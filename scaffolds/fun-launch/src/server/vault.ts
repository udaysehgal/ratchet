/**
 * Live state of a ratchet-vault on devnet (the program isn't on mainnet yet).
 * Reads the vault account, its token balances, its open DLMM asks and its recent history.
 */
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import DLMM, { deriveCustomizablePermissionlessLbPair, getPriceOfBinByBinId } from '@meteora-ag/dlmm';
import { deriveBaseKeyForLocker, deriveEscrow } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { DAILY_ASK_BPS, DLMM_PROGRAM, VAULT_PROGRAM_ID, decodeVault } from '@/lib/vault';

const DEVNET_RPC = process.env.DEVNET_RPC_URL ?? 'https://api.devnet.solana.com';
const devnet = new Connection(DEVNET_RPC, 'confirmed');

/** The vault from the devnet lifecycle run (docs/EVIDENCE.md). */
export const DEMO_VAULT = '2LmfUMgwN3Kt1dmu7MR4KrkJTQBTeMFVhdT4M9jJE6wF';

export type VaultView = {
  address: string;
  program: string;
  dbcPool: string;
  baseMint: string;
  symbol: string;
  name: string;
  beneficiary: string;
  floorMultiple: number;
  /** Share of the vault's tokens that can be offered as asks per 24h, in percent. */
  dailyCapPct: number;
  /** After this (unix seconds) the team can release tokens without the floor; null = never. */
  sunsetTs: number | null;
  graduationPrice: number; // quote per token, UI units
  tokensInVault: number;
  tokensInAsks: number;
  tokensSold: number;
  proceedsQuote: number;
  vestingClaimed: number;
  vestingTotal: number;
  dlmmPair: string | null;
  asks: { binId: number; price: number; multiple: number; unfilled: number; filledQuote: number }[];
  history: { signature: string; time: number | null; label: string }[];
};

const LABELS: [RegExp, string][] = [
  [/TransferPoolCreator/, 'Launch: creator role handed to the vault'],
  [/CreateVestingEscrowV2/, 'Graduation: team vesting escrow, recipient = vault'],
  [/ClaimV2/, 'Vested team tokens claimed into the vault'],
  [/PlaceLimitOrder/, 'Ask placed on DLMM above the floor'],
  [/floor raised/, 'Floor raised'],
  [/CancelLimitOrder/, 'Ask cancelled: tokens back to the vault, proceeds to the team'],
  [/ClaimCreatorTradingFee/, 'Creator fees collected, SOL forwarded to the team'],
];

function readMetadata(data: Buffer | undefined) {
  if (!data) return { name: 'Unknown', symbol: '???' };
  const str = (o: number) => {
    const len = data.readUInt32LE(o);
    return { value: data.subarray(o + 4, o + 4 + len).toString('utf8').replace(/\0/g, '').trim(), next: o + 4 + len };
  };
  const name = str(65);
  const symbol = str(name.next);
  return { name: name.value, symbol: symbol.value };
}

export async function getVaultView(address: string): Promise<VaultView> {
  const vaultKey = new PublicKey(address);
  const info = await devnet.getAccountInfo(vaultKey);
  if (!info || !info.owner.equals(VAULT_PROGRAM_ID)) throw new Error('Not a Ratchet vault on devnet');
  const v = decodeVault(info.data as Buffer);

  const baseMintInfo = await devnet.getAccountInfo(v.baseMint);
  const tokenProgram = baseMintInfo?.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
  const baseDecimals = baseMintInfo ? (baseMintInfo.data as Buffer)[44]! : 6;
  const quoteMintInfo = await devnet.getAccountInfo(v.quoteMint);
  const quoteDecimals = quoteMintInfo ? (quoteMintInfo.data as Buffer)[44]! : 9;
  const metaPda = PublicKey.findProgramAddressSync(
    [Buffer.from('metadata'), new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s').toBuffer(), v.baseMint.toBuffer()],
    new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s')
  )[0];
  const vaultBase = getAssociatedTokenAddressSync(v.baseMint, vaultKey, true, tokenProgram);
  const escrow = deriveEscrow(deriveBaseKeyForLocker(v.dbcPool));
  const [metaInfo, baseBal, escrowInfo] = await Promise.all([
    devnet.getAccountInfo(metaPda),
    devnet.getTokenAccountBalance(vaultBase).catch((): null => null),
    devnet.getAccountInfo(escrow),
  ]);
  const meta = readMetadata(metaInfo?.data as Buffer | undefined);
  const toUi = (raw: bigint, d: number) => Number(raw) / 10 ** d;
  let vestingClaimed = 0;
  let vestingTotal = 0;
  if (escrowInfo) {
    const d = escrowInfo.data as Buffer;
    const total = d.readBigUInt64LE(160) + d.readBigUInt64LE(168) * d.readBigUInt64LE(176);
    vestingTotal = toUi(total, baseDecimals);
    vestingClaimed = toUi(d.readBigUInt64LE(184), baseDecimals);
  }

  // Graduation price in UI units: raw Q64 price × 10^(base - quote)
  const graduationPrice = (Number(v.graduationPriceQ64) / 2 ** 64) * 10 ** (baseDecimals - quoteDecimals);

  const pair = deriveCustomizablePermissionlessLbPair(v.baseMint, v.quoteMint, DLMM_PROGRAM)[0];
  const asks: VaultView['asks'] = [];
  let dlmmPair: string | null = null;
  let tokensSold = 0;
  let proceedsQuote = 0;
  if (await devnet.getAccountInfo(pair)) {
    dlmmPair = pair.toBase58();
    const dlmm = await DLMM.create(devnet, pair, { cluster: 'devnet', programId: DLMM_PROGRAM });
    const orders = await dlmm.getLimitOrderByUserAndLbPair(vaultKey);
    for (const order of orders) {
      for (const bin of order.limitOrderData.limitOrderBinData) {
        if (bin.empty || !bin.isAskSide) continue;
        const price = Number(dlmm.fromPricePerLamport(getPriceOfBinByBinId(bin.binId, dlmm.lbPair.binStep).toNumber()));
        const unfilled = Number(bin.unfilledAmountX);
        tokensSold += Number(bin.depositAmountX) - unfilled;
        proceedsQuote += Number(bin.swappedAmountY);
        asks.push({ binId: bin.binId, price, multiple: graduationPrice > 0 ? price / graduationPrice : 0, unfilled, filledQuote: Number(bin.swappedAmountY) });
      }
    }
  }
  asks.sort((a, b) => a.binId - b.binId);

  const sigs = await devnet.getSignaturesForAddress(vaultKey, { limit: 20 });
  const history: VaultView['history'] = [];
  for (const s of sigs.filter((x) => !x.err)) {
    const tx = await devnet.getTransaction(s.signature, { maxSupportedTransactionVersion: 0 }).catch((): null => null);
    const logs = (tx?.meta?.logMessages ?? []).join('\n');
    const label = LABELS.filter(([re]) => re.test(logs)).map(([, l]) => l).pop();
    if (label) history.push({ signature: s.signature, time: s.blockTime ?? null, label });
  }

  return {
    address,
    program: VAULT_PROGRAM_ID.toBase58(),
    dbcPool: v.dbcPool.toBase58(),
    baseMint: v.baseMint.toBase58(),
    symbol: meta.symbol,
    name: meta.name,
    beneficiary: v.beneficiary.toBase58(),
    floorMultiple: v.floorBps / 10_000,
    dailyCapPct: DAILY_ASK_BPS / 100,
    sunsetTs: v.sunsetTs > BigInt(0) ? Number(v.sunsetTs) : null,
    graduationPrice,
    tokensInVault: baseBal ? Number(baseBal.value.uiAmount) : 0,
    tokensInAsks: asks.reduce((s, a) => s + a.unfilled, 0),
    tokensSold,
    proceedsQuote,
    vestingClaimed,
    vestingTotal,
    dlmmPair,
    asks,
    history: history.reverse(),
  };
}
