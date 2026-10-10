/**
 * Every on-chain read and transaction Ratchet needs, built on Meteora SDKs:
 * DBC (launch, curve, swaps, vesting locker), DAMM v2 (graduated pool), DLMM (unlock ladder),
 * and Met Lock (vesting escrow claims). Server-only: transactions are returned unsigned
 * (except ephemeral keypairs we generate) for the user's wallet to sign.
 */
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from '@solana/web3.js';
import BN from 'bn.js';
import {
  DynamicBondingCurveClient,
  SwapMode,
  deriveBaseKeyForLocker,
  deriveEscrow,
  deriveMintMetadata,
  getCurrentPoint,
  getPriceFromSqrtPrice,
  type PoolConfig,
  type VirtualPool,
} from '@meteora-ag/dynamic-bonding-curve-sdk';
import { CpAmm, getPriceFromSqrtPrice as getDammV2Price } from '@meteora-ag/cp-amm-sdk';
import DLMM, {
  LBCLMM_PROGRAM_IDS,
  deriveCustomizablePermissionlessLbPair,
  getPriceOfBinByBinId,
} from '@meteora-ag/dlmm';
import { LockClient } from '@meteora-ag/met-lock-sdk';
import { NETWORK, getAllPresetConfigs, getPresetByConfig, type PresetId } from '@/presets';

const RPC_URL = process.env.RPC_URL as string;
if (!RPC_URL) {
  throw new Error('Missing RPC_URL');
}

const QUOTE_DECIMALS = 9; // all Ratchet presets are SOL-quoted
const DLMM_CLUSTER = NETWORK === 'mainnet' ? 'mainnet-beta' : 'devnet';
const DLMM_PROGRAM_ID = new PublicKey(LBCLMM_PROGRAM_IDS[DLMM_CLUSTER]);

/** Unlock ladder rules. Enforced by this API (soft commitment); a vault program would enforce on-chain. */
export const LADDER_MIN_MULTIPLE = 1.25; // lowest rung: 1.25x the graduation price
export const LADDER_MAX_RUNGS = 8;
const DLMM_BIN_STEP = 100; // 1% per bin
const DLMM_FEE_BPS = 100;

export const connection = new Connection(RPC_URL, 'confirmed');
const dbc = new DynamicBondingCurveClient(connection, 'confirmed');
const cpAmm = new CpAmm(connection);
const lock = new LockClient(connection, 'confirmed');

// ---------- reads ----------

export type TokenMeta = { name: string; symbol: string; uri: string };

/** Parse name/symbol/uri from Metaplex metadata accounts (borsh strings, NUL-padded). */
export async function getTokenMetas(mints: PublicKey[]): Promise<Map<string, TokenMeta>> {
  const out = new Map<string, TokenMeta>();
  for (let i = 0; i < mints.length; i += 100) {
    const chunk = mints.slice(i, i + 100);
    const accounts = await connection.getMultipleAccountsInfo(chunk.map(deriveMintMetadata));
    accounts.forEach((account, j) => {
      if (!account) return;
      const data = account.data;
      let offset = 1 + 32 + 32; // key, update authority, mint
      const readString = () => {
        const len = data.readUInt32LE(offset);
        offset += 4;
        const s = data
          .subarray(offset, offset + len)
          .toString('utf8')
          .replace(/\0/g, '')
          .trim();
        offset += len;
        return s;
      };
      const name = readString();
      const symbol = readString();
      const uri = readString();
      out.set(chunk[j]!.toBase58(), { name, symbol, uri });
    });
  }
  return out;
}

export type LaunchSummary = {
  pool: string;
  baseMint: string;
  creator: string;
  config: string;
  presetId: PresetId | null;
  name: string;
  symbol: string;
  uri: string;
  quoteReserve: number; // SOL
  threshold: number; // SOL
  progress: number; // 0..1
  migrated: boolean;
};

type PoolState = VirtualPool['poolState'];

function summarize(
  pool: PublicKey,
  state: PoolState,
  config: PoolConfig,
  meta: TokenMeta | undefined
): LaunchSummary {
  const quoteReserve = Number(state.quoteReserve.toString()) / 10 ** QUOTE_DECIMALS;
  const threshold = Number(config.migrationQuoteThreshold.toString()) / 10 ** QUOTE_DECIMALS;
  return {
    pool: pool.toBase58(),
    baseMint: state.baseMint.toBase58(),
    creator: state.creator.toBase58(),
    config: state.config.toBase58(),
    presetId: getPresetByConfig(state.config.toBase58())?.id ?? null,
    name: meta?.name ?? 'Unknown',
    symbol: meta?.symbol ?? '???',
    uri: meta?.uri ?? '',
    quoteReserve,
    threshold,
    progress: threshold > 0 ? Math.min(quoteReserve / threshold, 1) : 0,
    migrated: state.isMigrated === 1,
  };
}

/** All launches on Ratchet's preset configs, closest to graduation first. */
export async function listLaunches(): Promise<LaunchSummary[]> {
  const configs = getAllPresetConfigs();
  const results = await Promise.all(
    configs.map(async (config) => {
      const [configState, pools] = await Promise.all([
        dbc.state.getPoolConfig(config),
        dbc.state.getPoolsByConfig(config),
      ]);
      return pools.map((p) => ({ ...p, configState }));
    })
  );
  const pools = results.flat();
  const metas = await getTokenMetas(pools.map((p) => p.account.poolState.baseMint));
  return pools
    .map((p) =>
      summarize(
        p.publicKey,
        p.account.poolState,
        p.configState,
        metas.get(p.account.poolState.baseMint.toBase58())
      )
    )
    .sort((a, b) => Number(a.migrated) - Number(b.migrated) || b.progress - a.progress);
}

export type LadderRung = {
  binId: number;
  price: number; // SOL per token
  multiple: number; // price / graduation price
  deposited: number; // tokens
  unfilled: number; // tokens
  filledSol: number; // SOL received
};

export type LaunchDetail = LaunchSummary & {
  currentPrice: number; // SOL per token (DBC curve, or DAMM v2 after graduation)
  graduationPrice: number;
  dammV2Pool: string | null;
  vesting: {
    escrow: string;
    total: number;
    claimed: number;
    claimable: number;
    cliffTime: number;
    frequency: number;
    periods: number;
  } | null;
  dlmmPair: string | null;
  ladder: LadderRung[];
};

async function getVesting(pool: PublicKey, decimals: number) {
  const escrow = deriveEscrow(deriveBaseKeyForLocker(pool));
  const info = await connection.getAccountInfo(escrow);
  if (!info) return null;
  const state = await lock.getEscrow(escrow);
  const total = state.cliffUnlockAmount.add(state.amountPerPeriod.mul(state.numberOfPeriod));
  // Vesting is evaluated against the chain's clock, which can lag wall-clock time
  const slot = await connection.getSlot();
  const blockTime = await connection.getBlockTime(slot);
  const now = new BN(blockTime ?? Math.floor(Date.now() / 1000));
  let vested = new BN(0);
  if (now.gte(state.cliffTime)) {
    const elapsed = BN.max(now.sub(state.vestingStartTime), new BN(0));
    const periods = state.frequency.isZero()
      ? state.numberOfPeriod
      : BN.min(elapsed.div(state.frequency), state.numberOfPeriod);
    vested = BN.min(state.cliffUnlockAmount.add(state.amountPerPeriod.mul(periods)), total);
  }
  const claimed = state.totalClaimedAmount;
  const toTokens = (v: BN) => Number(v.toString()) / 10 ** decimals;
  return {
    escrow: escrow.toBase58(),
    total: toTokens(total),
    claimed: toTokens(claimed),
    claimable: toTokens(BN.max(vested.sub(claimed), new BN(0))),
    cliffTime: Number(state.cliffTime.toString()),
    frequency: Number(state.frequency.toString()),
    periods: Number(state.numberOfPeriod.toString()),
  };
}

function dlmmPairAddress(baseMint: PublicKey, quoteMint: PublicKey) {
  return deriveCustomizablePermissionlessLbPair(baseMint, quoteMint, DLMM_PROGRAM_ID)[0];
}

async function getLadder(
  pair: PublicKey,
  owner: PublicKey,
  baseDecimals: number,
  graduationPrice: number
): Promise<LadderRung[]> {
  const dlmm = await DLMM.create(connection, pair, { cluster: DLMM_CLUSTER });
  const orders = await dlmm.getLimitOrderByUserAndLbPair(owner);
  const rungs: LadderRung[] = [];
  for (const order of orders) {
    for (const bin of order.limitOrderData.limitOrderBinData) {
      if (bin.empty || !bin.isAskSide) continue;
      const price = Number(
        dlmm.fromPricePerLamport(
          getPriceOfBinByBinId(bin.binId, dlmm.lbPair.binStep).toNumber()
        )
      );
      rungs.push({
        binId: bin.binId,
        price,
        multiple: graduationPrice > 0 ? price / graduationPrice : 0,
        deposited: Number(bin.depositAmountX), // SDK returns UI units
        unfilled: Number(bin.unfilledAmountX),
        filledSol: Number(bin.swappedAmountY),
      });
    }
  }
  return rungs.sort((a, b) => a.binId - b.binId);
}

export async function getLaunch(baseMint: PublicKey): Promise<LaunchDetail | null> {
  const pool = await dbc.state.getPoolByBaseMint(baseMint);
  if (!pool) return null;
  const state = pool.account.poolState;
  const config = await dbc.state.getPoolConfig(state.config);
  const metas = await getTokenMetas([baseMint]);
  const summary = summarize(pool.publicKey, state, config, metas.get(baseMint.toBase58()));
  const baseDecimals = config.tokenDecimal;

  const graduationPrice = Number(
    getPriceFromSqrtPrice(config.migrationSqrtPrice, baseDecimals, QUOTE_DECIMALS)
  );
  let currentPrice = Number(
    getPriceFromSqrtPrice(state.sqrtPrice, baseDecimals, QUOTE_DECIMALS)
  );

  let dammV2Pool: string | null = null;
  if (summary.migrated) {
    const dammPools = await cpAmm.fetchPoolStatesByTokenAMint(baseMint);
    const match = dammPools.find((p) => p.account.tokenBMint.equals(config.quoteMint));
    if (match) {
      dammV2Pool = match.publicKey.toBase58();
      currentPrice = Number(
        getDammV2Price(match.account.sqrtPrice, baseDecimals, QUOTE_DECIMALS)
      );
    }
  }

  const vesting = summary.migrated ? await getVesting(pool.publicKey, baseDecimals) : null;

  const pair = dlmmPairAddress(baseMint, config.quoteMint);
  const pairExists = (await connection.getAccountInfo(pair)) !== null;
  const ladder = pairExists
    ? await getLadder(pair, state.creator, baseDecimals, graduationPrice)
    : [];

  return {
    ...summary,
    currentPrice,
    graduationPrice,
    dammV2Pool,
    vesting,
    dlmmPair: pairExists ? pair.toBase58() : null,
    ladder,
  };
}

// ---------- transactions ----------

export type BuiltTx = { tx: string; description: string };

async function finalize(tx: Transaction, feePayer: PublicKey, signers: Keypair[] = []) {
  const { blockhash } = await connection.getLatestBlockhash();
  tx.feePayer = feePayer;
  tx.recentBlockhash = blockhash;
  if (signers.length) tx.partialSign(...signers);
  return tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64');
}

/** Buy or sell on the DBC curve. Buys use PartialFill so the last buyer can't overshoot graduation. */
export async function buildSwapTx(params: {
  baseMint: PublicKey;
  user: PublicKey;
  side: 'buy' | 'sell';
  amount: number; // SOL for buy, tokens for sell
  slippageBps: number;
}): Promise<BuiltTx> {
  const pool = await dbc.state.getPoolByBaseMint(params.baseMint);
  if (!pool) throw new Error('Pool not found');
  if (pool.account.poolState.isMigrated === 1) {
    throw new Error('Token has graduated; trade on DAMM v2');
  }
  const config = await dbc.state.getPoolConfig(pool.account.poolState.config);
  const swapBaseForQuote = params.side === 'sell';
  const decimals = swapBaseForQuote ? config.tokenDecimal : QUOTE_DECIMALS;
  const amountIn = new BN(Math.floor(params.amount * 10 ** decimals).toString());
  const swapMode = swapBaseForQuote ? SwapMode.ExactIn : SwapMode.PartialFill;

  const quote = dbc.pool.swapQuote2({
    virtualPool: pool.account,
    config,
    swapBaseForQuote,
    hasReferral: false,
    eligibleForFirstSwapWithMinFee: false,
    currentPoint: await getCurrentPoint(connection, config.activationType),
    slippageBps: params.slippageBps,
    swapMode,
    amountIn,
  });

  const tx = await dbc.pool.swap2({
    owner: params.user,
    pool: pool.publicKey,
    swapBaseForQuote,
    referralTokenAccount: null,
    swapMode,
    amountIn,
    minimumAmountOut: quote.minimumAmountOut ?? new BN(0),
  });
  return {
    tx: await finalize(tx, params.user),
    description: `${params.side} on DBC curve`,
  };
}

async function requireCreatorLaunch(baseMint: PublicKey, user: PublicKey) {
  const pool = await dbc.state.getPoolByBaseMint(baseMint);
  if (!pool) throw new Error('Pool not found');
  const state = pool.account.poolState;
  if (!state.creator.equals(user)) throw new Error('Only the token creator can do this');
  if (state.isMigrated !== 1) throw new Error('Token has not graduated yet');
  const config = await dbc.state.getPoolConfig(state.config);
  return { pool, config };
}

/** Claim vested team tokens from the DBC locker escrow (Met Lock). */
export async function buildClaimVestingTx(baseMint: PublicKey, user: PublicKey): Promise<BuiltTx> {
  const { pool } = await requireCreatorLaunch(baseMint, user);
  const escrow = deriveEscrow(deriveBaseKeyForLocker(pool.publicKey));
  const tx = await lock.claimV2({
    escrow,
    recipient: user,
    maxAmount: new BN('18446744073709551615'), // capped on-chain at what has vested
    payer: user,
  });
  return { tx: await finalize(tx, user), description: 'claim vested team tokens' };
}

/** Create the token's DLMM pair (limit-order type) at the current DAMM v2 price. */
export async function buildCreateDlmmPairTx(baseMint: PublicKey, user: PublicKey): Promise<BuiltTx> {
  const { config } = await requireCreatorLaunch(baseMint, user);
  const launch = await getLaunch(baseMint);
  if (!launch) throw new Error('Pool not found');
  if (launch.dlmmPair) throw new Error('DLMM pair already exists');

  const pricePerLamport = DLMM.getPricePerLamport(
    config.tokenDecimal,
    QUOTE_DECIMALS,
    launch.currentPrice
  );
  const activeBinId = DLMM.getBinIdFromPrice(pricePerLamport, DLMM_BIN_STEP, false);
  const tx = await DLMM.createCustomizablePermissionlessLbPair2(
    connection,
    new BN(DLMM_BIN_STEP),
    baseMint,
    config.quoteMint,
    new BN(activeBinId.toString()),
    new BN(DLMM_FEE_BPS),
    1, // activation by timestamp
    false, // no alpha vault
    user,
    undefined,
    false, // creator cannot pause the pool
    undefined, // default function type: limit orders
    undefined,
    { cluster: DLMM_CLUSTER, programId: DLMM_PROGRAM_ID }
  );
  return { tx: await finalize(tx, user), description: 'create DLMM pair' };
}

/**
 * Commit unlocked tokens as DLMM asks. Every rung must sit at or above
 * LADDER_MIN_MULTIPLE x the graduation price, so unlocks only sell into strength.
 */
export async function buildLadderTx(params: {
  baseMint: PublicKey;
  user: PublicKey;
  rungs: { multiple: number; amount: number }[];
}): Promise<BuiltTx & { limitOrder: string }> {
  const { config } = await requireCreatorLaunch(params.baseMint, params.user);
  if (params.rungs.length === 0 || params.rungs.length > LADDER_MAX_RUNGS) {
    throw new Error(`Ladder needs 1-${LADDER_MAX_RUNGS} rungs`);
  }
  for (const rung of params.rungs) {
    if (!(rung.multiple >= LADDER_MIN_MULTIPLE)) {
      throw new Error(`Every rung must be at least ${LADDER_MIN_MULTIPLE}x the graduation price`);
    }
    if (!(rung.amount > 0)) throw new Error('Rung amounts must be positive');
  }
  const launch = await getLaunch(params.baseMint);
  if (!launch?.dlmmPair) throw new Error('Create the DLMM pair first');

  const dlmm = await DLMM.create(connection, new PublicKey(launch.dlmmPair), {
    cluster: DLMM_CLUSTER,
  });
  const binAmounts = new Map<number, BN>();
  for (const rung of params.rungs) {
    const price = launch.graduationPrice * rung.multiple;
    const binId = dlmm.getBinIdFromPrice(Number(dlmm.toPricePerLamport(price)), false);
    if (binId <= dlmm.lbPair.activeId) {
      throw new Error(`Rung at ${rung.multiple}x is at or below the current price`);
    }
    const amount = new BN(Math.floor(rung.amount * 10 ** config.tokenDecimal).toString());
    binAmounts.set(binId, (binAmounts.get(binId) ?? new BN(0)).add(amount));
  }
  const bins = [...binAmounts.entries()]
    .map(([id, amount]) => ({ id, amount }))
    .sort((a, b) => a.id - b.id);

  const limitOrder = Keypair.generate();
  const tx = await dlmm.placeLimitOrder({
    owner: params.user,
    payer: params.user,
    sender: params.user,
    limitOrder: limitOrder.publicKey,
    params: { isAskSide: true, relativeBin: null, bins },
  });
  return {
    tx: await finalize(tx, params.user, [limitOrder]),
    description: 'place unlock ladder on DLMM',
    limitOrder: limitOrder.publicKey.toBase58(),
  };
}
