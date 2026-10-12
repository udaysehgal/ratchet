/**
 * /try: a vaulted launch anyone can run on devnet with their own wallet. Every step is built
 * here as an unsigned devnet transaction (plus any throwaway co-signer keys); the wallet signs.
 * Uses the low-threshold devnet preset (presets/devnet/vault-test.jsonc: 0.3 SOL graduation,
 * 1% flat fee, team vesting starting 5 s after graduation).
 */
import { ComputeBudgetProgram, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import {
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import BN from 'bn.js';
import {
  DAMM_V2_MIGRATION_FEE_ADDRESS,
  SwapMode,
  deriveBaseKeyForLocker,
  deriveDbcPoolAddress,
  deriveEscrow,
} from '@meteora-ag/dynamic-bonding-curve-sdk';
import DLMM, {
  deriveCustomizablePermissionlessLbPair,
  getBinArrayInfoForNonContiguousBinIds,
  getQPriceFromId,
} from '@meteora-ag/dlmm';
import {
  DAILY_ASK_BPS,
  DLMM_PROGRAM,
  adoptLaunchIx,
  claimVestedIx,
  decodeVault,
  findVault,
  placeAskIx,
  vaultErrorName,
} from '@/lib/vault';
import { devnet, devnetDbc } from './devnet';

export const TRY_CONFIG = new PublicKey('5PgsCUob1FKA5UXAycmHCGHXfugXXBhFg9wSinL9htAt');
const BIN_STEP = 100;
const DAY = 86_400;

export type TryTx = { tx: string; coSigners?: string[]; description: string; pool?: string; mint?: string; vault?: string };

const exportKeys = (keys: Keypair[]) => keys.map((k) => Buffer.from(k.secretKey).toString('base64'));

async function finalize(tx: Transaction, user: PublicKey) {
  tx.feePayer = user;
  tx.recentBlockhash = (await devnet.getLatestBlockhash()).blockhash;
  return tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64');
}

async function vaultState(pool: PublicKey) {
  const vault = findVault(pool);
  const info = await devnet.getAccountInfo(vault);
  if (!info) throw new Error('No vault for this pool');
  return { vault, v: decodeVault(info.data as Buffer) };
}

/** 1. Launch on DBC and hand the creator role to a new vault, in one transaction. */
export async function buildLaunch(user: PublicKey, name: string, symbol: string, metadataUri: string): Promise<TryTx> {
  const baseMint = Keypair.generate();
  const pool = deriveDbcPoolAddress(NATIVE_MINT, baseMint.publicKey, TRY_CONFIG);
  const tx = await devnetDbc.creator.createPool({
    config: TRY_CONFIG,
    baseMint: baseMint.publicKey,
    name,
    symbol,
    uri: metadataUri,
    payer: user,
    poolCreator: user,
  });
  tx.add(adoptLaunchIx({ creator: user, pool, config: TRY_CONFIG, beneficiary: user }));
  return {
    tx: await finalize(tx, user),
    coSigners: exportKeys([baseMint]),
    description: 'launch on DBC and hand the creator role to the vault',
    pool: pool.toBase58(),
    mint: baseMint.publicKey.toBase58(),
    vault: findVault(pool).toBase58(),
  };
}

/** 2. Buy the curve to its 0.3 SOL threshold (partial fill: the excess is refunded). */
export async function buildBuy(user: PublicKey, pool: PublicKey): Promise<TryTx> {
  const config = await devnetDbc.state.getPoolConfig(TRY_CONFIG);
  const amountIn = new BN(Math.ceil(Number(config.migrationQuoteThreshold.toString()) * 1.1));
  const tx = await devnetDbc.pool.swap2({
    owner: user,
    pool,
    swapBaseForQuote: false,
    swapMode: SwapMode.PartialFill,
    amountIn,
    minimumAmountOut: new BN(0),
    referralTokenAccount: null,
  });
  return { tx: await finalize(tx, user), description: 'buy the curve to graduation' };
}

/** 3. Graduate: team vesting escrow (recipient = the vault), then migrate to DAMM v2. */
export async function buildGraduate(user: PublicKey, pool: PublicKey): Promise<TryTx> {
  const escrow = deriveEscrow(deriveBaseKeyForLocker(pool));
  if (!(await devnet.getAccountInfo(escrow))) {
    const tx = await devnetDbc.migration.createLocker({ payer: user, pool });
    return { tx: await finalize(tx, user), description: 'create the team vesting escrow (recipient: the vault)' };
  }
  const config = await devnetDbc.state.getPoolConfig(TRY_CONFIG);
  const { transaction, firstPositionNftKeypair, secondPositionNftKeypair } = await devnetDbc.migration.migrateToDammV2({
    payer: user,
    pool,
    dammConfig: DAMM_V2_MIGRATION_FEE_ADDRESS[config.migrationFeeOption]!,
  });
  return {
    tx: await finalize(transaction, user),
    coSigners: exportKeys([firstPositionNftKeypair, secondPositionNftKeypair]),
    description: 'graduate to DAMM v2 with LP locked forever',
  };
}

/** 4. Claim vested team tokens. They land in the vault; the team wallet gets nothing. */
export async function buildClaimVested(user: PublicKey, pool: PublicKey): Promise<TryTx> {
  const { vault, v } = await vaultState(pool);
  const escrow = deriveEscrow(deriveBaseKeyForLocker(pool));
  const vaultBase = getAssociatedTokenAddressSync(v.baseMint, vault, true, TOKEN_PROGRAM_ID);
  const tx = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(user, vaultBase, vault, v.baseMint),
    createAssociatedTokenAccountIdempotentInstruction(user, getAssociatedTokenAddressSync(NATIVE_MINT, vault, true), vault, NATIVE_MINT),
    createAssociatedTokenAccountIdempotentInstruction(user, getAssociatedTokenAddressSync(NATIVE_MINT, user), user, NATIVE_MINT),
    claimVestedIx({
      vault,
      escrow,
      baseMint: v.baseMint,
      escrowToken: getAssociatedTokenAddressSync(v.baseMint, escrow, true),
      vaultBaseToken: vaultBase,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
  );
  return { tx: await finalize(tx, user), description: 'claim vested team tokens into the vault' };
}

/** 5. Create the token's DLMM pair at the graduation price (any holder can; you hold some). */
export async function buildCreatePair(user: PublicKey, pool: PublicKey): Promise<TryTx> {
  const { v } = await vaultState(pool);
  const grad = Number(v.graduationPriceQ64) / 2 ** 64;
  const activeId = DLMM.getBinIdFromPrice(grad, BIN_STEP, false);
  const tx = await DLMM.createCustomizablePermissionlessLbPair2(
    devnet, new BN(BIN_STEP), v.baseMint, NATIVE_MINT, new BN(activeId), new BN(100), 1, false,
    user, undefined, false, undefined, undefined, { cluster: 'devnet', programId: DLMM_PROGRAM }
  );
  return { tx: await finalize(tx, user), description: 'create the DLMM pair' };
}

async function askTx(user: PublicKey, pool: PublicKey, legs: { multiple: number; amount: bigint }[]) {
  const { vault, v } = await vaultState(pool);
  const lbPair = deriveCustomizablePermissionlessLbPair(v.baseMint, NATIVE_MINT, DLMM_PROGRAM)[0];
  const dlmm = await DLMM.create(devnet, lbPair, { cluster: 'devnet', programId: DLMM_PROGRAM });
  const grad = Number(v.graduationPriceQ64) / 2 ** 64;
  const priceOf = (id: number) => Number(getQPriceFromId(new BN(id), new BN(BIN_STEP)).toString()) / 2 ** 64;
  // Lowest bin at or above the target (for ≥ floor asks), or the bin just under it (for the refusal demo)
  const binAt = (m: number, under: boolean) => {
    let id = DLMM.getBinIdFromPrice(grad * m, BIN_STEP, false);
    while (priceOf(id) < grad * m) id++;
    return under ? id - 1 : id;
  };
  const bins = legs.map((l) => ({ id: binAt(Math.abs(l.multiple), l.multiple < 0), amount: l.amount }));
  const { binArrayAccountMetas, binArrayIndexes } = getBinArrayInfoForNonContiguousBinIds(bins.map((b) => b.id), DLMM_PROGRAM, lbPair);
  // The DLMM helper adds a compute budget sized only for creating bin arrays; replace it with one
  // that also covers the vault's price checks and its CPI into DLMM
  const initBinArrays = (await dlmm.initializeBinArrays(binArrayIndexes, user)).filter(
    (ix) => !ix.programId.equals(ComputeBudgetProgram.programId)
  );
  const tx = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
    ...initBinArrays,
    placeAskIx({
      beneficiary: user, vault, nonce: v.ordersPlaced, lbPair, bitmapExtension: null,
      reserveX: dlmm.lbPair.reserveX, baseMint: v.baseMint,
      vaultBaseToken: getAssociatedTokenAddressSync(v.baseMint, vault, true, TOKEN_PROGRAM_ID),
      tokenProgram: TOKEN_PROGRAM_ID, bins, hookSlices: [[0, 0]],
      binArrays: binArrayAccountMetas.map((m) => m.pubkey),
    })
  );
  return { tx, bins, vault, v };
}

/** How much the vault may still offer in the current 24 h window (program: 10% of the balance). */
export async function askBudget(pool: PublicKey): Promise<bigint> {
  const { vault, v } = await vaultState(pool);
  const bal = await devnet.getTokenAccountBalance(getAssociatedTokenAddressSync(v.baseMint, vault, true)).catch((): null => null);
  const balance = BigInt(bal?.value.amount ?? '0');
  const now = Math.floor(Date.now() / 1000);
  if (v.windowStartTs === BigInt(0) || now >= Number(v.windowStartTs) + DAY) {
    return (balance * BigInt(DAILY_ASK_BPS)) / BigInt(10_000);
  }
  return v.windowBudget - v.windowUsed;
}

/** 6. Sell into strength: asks at 1.25x and 2x the graduation price, within the daily cap. */
export async function buildAsk(user: PublicKey, pool: PublicKey): Promise<TryTx> {
  const budget = await askBudget(pool);
  if (budget < BigInt(2)) throw new Error('Daily cap used: the vault can offer more after its 24 h window resets');
  const each = budget / BigInt(2);
  const { tx } = await askTx(user, pool, [
    { multiple: 1.25, amount: each },
    { multiple: 2, amount: each },
  ]);
  return { tx: await finalize(tx, user), description: 'place asks at 1.25x and 2x through the vault' };
}

/**
 * Show what the program refuses, without signing anything: simulate an ask one bin under the
 * 1.25x floor (or another rule) and return the vault's error.
 */
export async function simulateRefusal(user: PublicKey, pool: PublicKey, kind: 'below-floor' | 'over-cap') {
  const budget = await askBudget(pool);
  const legs =
    kind === 'below-floor'
      ? [{ multiple: -1.25, amount: BigInt(1000) }] // the bin just under 1.25x
      : [{ multiple: 2, amount: budget + BigInt(1) }];
  const { tx } = await askTx(user, pool, legs);
  tx.feePayer = user;
  tx.recentBlockhash = (await devnet.getLatestBlockhash()).blockhash;
  const sim = await devnet.simulateTransaction(tx);
  const logs = sim.value.logs ?? [];
  return {
    refused: sim.value.err !== null,
    error: vaultErrorName({ logs }) ?? (sim.value.err ? JSON.stringify(sim.value.err) : null),
    log: logs.filter((l) => /ratchet-vault|custom program error/.test(l)).slice(-3),
  };
}

export type TryState = {
  pool: string;
  mint: string;
  vault: string;
  raised: number;
  threshold: number;
  graduated: boolean;
  escrow: boolean;
  vestedClaimed: number; // raw
  vaultHolds: number; // raw
  userHolds: number; // raw
  pair: string | null;
  floorBps: number;
  budget: number; // raw, still offerable this window
  orders: number;
};

export async function getTryState(pool: PublicKey, user: PublicKey | null): Promise<TryState> {
  const { vault, v } = await vaultState(pool);
  const [poolAcc, config, escrowInfo] = await Promise.all([
    devnetDbc.state.getPool(pool),
    devnetDbc.state.getPoolConfig(TRY_CONFIG),
    devnet.getAccountInfo(deriveEscrow(deriveBaseKeyForLocker(pool))),
  ]);
  const st = poolAcc!.poolState;
  const bal = async (owner: PublicKey) =>
    Number(
      (await devnet.getTokenAccountBalance(getAssociatedTokenAddressSync(v.baseMint, owner, true)).catch((): null => null))?.value
        .amount ?? 0
    );
  const pair = deriveCustomizablePermissionlessLbPair(v.baseMint, NATIVE_MINT, DLMM_PROGRAM)[0];
  const [vaultHolds, userHolds, pairInfo, budget] = await Promise.all([
    bal(vault),
    user ? bal(user) : Promise.resolve(0),
    devnet.getAccountInfo(pair),
    askBudget(pool),
  ]);
  return {
    pool: pool.toBase58(),
    mint: v.baseMint.toBase58(),
    vault: vault.toBase58(),
    raised: Number(st.quoteReserve.toString()) / 1e9,
    threshold: Number(config.migrationQuoteThreshold.toString()) / 1e9,
    graduated: st.isMigrated === 1,
    escrow: !!escrowInfo,
    vestedClaimed: escrowInfo ? Number((escrowInfo.data as Buffer).readBigUInt64LE(184)) : 0,
    vaultHolds,
    userHolds,
    pair: pairInfo ? pair.toBase58() : null,
    floorBps: v.floorBps,
    budget: Number(budget),
    orders: Number(v.ordersPlaced),
  };
}
