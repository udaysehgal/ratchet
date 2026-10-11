/**
 * Client for the ratchet-vault program (programs/ratchet-vault, spec in docs/VAULT.md).
 * Encodes instructions by hand (Borsh enum: 1-byte variant + fields) to match the program.
 */
import { AccountMeta, PublicKey, TransactionInstruction } from '@solana/web3.js';

export const VAULT_PROGRAM_ID = new PublicKey('BrwQHeRJWXDbXgUVi1TKdoDbnfB5kcRTcieYmSH2NzWB');
export const MIN_FLOOR_BPS = 12_500;

export const VAULT_ERRORS: Record<number, string> = {
  6000: 'InvalidVault',
  6001: 'NotPoolCreator',
  6002: 'AlreadyGraduated',
  6003: 'WrongProgramOwner',
  6004: 'PoolMismatch',
  6005: 'MintMismatch',
  6006: 'BelowFloor',
  6007: 'FloorCannotDecrease',
  6008: 'NotBeneficiary',
  6009: 'BadTokenAccount',
  6010: 'BadNonce',
  6011: 'SunsetNotReached',
  6012: 'MathOverflow',
  6013: 'NoBins',
};

export function findVault(dbcPool: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from('vault'), dbcPool.toBuffer()], VAULT_PROGRAM_ID)[0];
}

export function findOrder(vault: PublicKey, nonce: number | bigint): PublicKey {
  const n = Buffer.alloc(8);
  n.writeBigUInt64LE(BigInt(nonce));
  return PublicKey.findProgramAddressSync([Buffer.from('order'), vault.toBuffer(), n], VAULT_PROGRAM_ID)[0];
}

export type VaultState = {
  dbcPool: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  beneficiary: PublicKey;
  graduationPriceQ64: bigint;
  floorBps: number;
  sunsetTs: bigint;
  ordersPlaced: bigint;
  bump: number;
};

export function decodeVault(data: Buffer): VaultState {
  if (data.subarray(0, 8).toString() !== 'RTVAULT1') throw new Error('Not a Ratchet vault');
  const pk = (o: number) => new PublicKey(data.subarray(o, o + 32));
  return {
    dbcPool: pk(8),
    baseMint: pk(40),
    quoteMint: pk(72),
    beneficiary: pk(104),
    graduationPriceQ64: data.readBigUInt64LE(136) | (data.readBigUInt64LE(144) << BigInt(64)),
    floorBps: data.readUInt16LE(152),
    sunsetTs: data.readBigInt64LE(154),
    ordersPlaced: data.readBigUInt64LE(162),
    bump: data.readUInt8(170),
  };
}

// ---------- encoding ----------

const u8 = (v: number) => Buffer.from([v]);
const u16 = (v: number) => {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(v);
  return b;
};
const u32 = (v: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(v);
  return b;
};
const i32 = (v: number) => {
  const b = Buffer.alloc(4);
  b.writeInt32LE(v);
  return b;
};
const u64 = (v: number | bigint) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(v));
  return b;
};
const i64 = (v: number | bigint) => {
  const b = Buffer.alloc(8);
  b.writeBigInt64LE(BigInt(v));
  return b;
};
const slicesBytes = (slices: [number, number][]) =>
  Buffer.concat([u32(slices.length), ...slices.map(([k, n]) => Buffer.from([k, n]))]);

const w = (pubkey: PublicKey, isSigner = false): AccountMeta => ({ pubkey, isSigner, isWritable: true });
const r = (pubkey: PublicKey, isSigner = false): AccountMeta => ({ pubkey, isSigner, isWritable: false });
const ix = (keys: AccountMeta[], data: Buffer) =>
  new TransactionInstruction({ programId: VAULT_PROGRAM_ID, keys, data });

export const DBC_PROGRAM = new PublicKey('dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN');
export const DLMM_PROGRAM = new PublicKey('LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo');
export const LOCKER_PROGRAM = new PublicKey('LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn');
export const MEMO_PROGRAM = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
const SYSTEM = new PublicKey('11111111111111111111111111111111');
const eventAuthority = (program: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from('__event_authority')], program)[0];

export function adoptLaunchIx(p: {
  creator: PublicKey;
  pool: PublicKey;
  config: PublicKey;
  beneficiary: PublicKey;
  sunsetTs?: number;
}) {
  return ix(
    [
      w(p.creator, true),
      w(findVault(p.pool)),
      w(p.pool),
      r(p.config),
      r(SYSTEM),
      r(eventAuthority(DBC_PROGRAM)),
      r(DBC_PROGRAM),
    ],
    Buffer.concat([u8(0), p.beneficiary.toBuffer(), i64(p.sunsetTs ?? 0)])
  );
}

export function claimVestedIx(p: {
  vault: PublicKey;
  escrow: PublicKey;
  baseMint: PublicKey;
  escrowToken: PublicKey;
  vaultBaseToken: PublicKey;
  tokenProgram: PublicKey;
}) {
  return ix(
    [
      w(p.vault),
      w(p.escrow),
      r(p.baseMint),
      w(p.escrowToken),
      w(p.vaultBaseToken),
      r(MEMO_PROGRAM),
      r(p.tokenProgram),
      r(eventAuthority(LOCKER_PROGRAM)),
      r(LOCKER_PROGRAM),
    ],
    u8(1)
  );
}

export function placeAskIx(p: {
  beneficiary: PublicKey;
  vault: PublicKey;
  nonce: number | bigint;
  lbPair: PublicKey;
  bitmapExtension: PublicKey | null;
  reserveX: PublicKey;
  baseMint: PublicKey;
  vaultBaseToken: PublicKey;
  tokenProgram: PublicKey;
  bins: { id: number; amount: bigint }[];
  hookSlices?: [number, number][];
  binArrays: PublicKey[];
}) {
  return ix(
    [
      w(p.beneficiary, true),
      w(p.vault),
      w(p.lbPair),
      p.bitmapExtension ? w(p.bitmapExtension) : r(DLMM_PROGRAM),
      w(p.reserveX),
      r(p.baseMint),
      w(findOrder(p.vault, p.nonce)),
      w(p.vaultBaseToken),
      r(p.tokenProgram),
      r(SYSTEM),
      r(eventAuthority(DLMM_PROGRAM)),
      r(DLMM_PROGRAM),
      ...p.binArrays.map((b) => w(b)),
    ],
    Buffer.concat([
      u8(2),
      u64(p.nonce),
      u32(p.bins.length),
      ...p.bins.map((b) => Buffer.concat([i32(b.id), u64(b.amount)])),
      slicesBytes(p.hookSlices ?? []),
    ])
  );
}

export function cancelAskIx(p: {
  beneficiary: PublicKey;
  vault: PublicKey;
  nonce: number | bigint;
  lbPair: PublicKey;
  bitmapExtension: PublicKey | null;
  reserveX: PublicKey;
  reserveY: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  vaultBaseToken: PublicKey;
  vaultQuoteToken: PublicKey;
  baseTokenProgram: PublicKey;
  quoteTokenProgram: PublicKey;
  beneficiaryQuoteToken: PublicKey;
  bins: number[];
  close: boolean;
  hookSlices?: [number, number][];
  binArrays: PublicKey[];
}) {
  return ix(
    [
      w(p.beneficiary, true),
      w(p.vault),
      w(p.lbPair),
      p.bitmapExtension ? w(p.bitmapExtension) : r(DLMM_PROGRAM),
      w(p.reserveX),
      w(p.reserveY),
      r(p.baseMint),
      r(p.quoteMint),
      w(findOrder(p.vault, p.nonce)),
      w(p.vaultBaseToken),
      w(p.vaultQuoteToken),
      r(p.baseTokenProgram),
      r(p.quoteTokenProgram),
      r(MEMO_PROGRAM),
      r(eventAuthority(DLMM_PROGRAM)),
      r(DLMM_PROGRAM),
      w(p.beneficiaryQuoteToken),
      ...p.binArrays.map((b) => w(b)),
    ],
    Buffer.concat([
      u8(3),
      u64(p.nonce),
      u32(p.bins.length),
      ...p.bins.map(i32),
      u8(p.close ? 1 : 0),
      slicesBytes(p.hookSlices ?? []),
    ])
  );
}

export function raiseFloorIx(p: { beneficiary: PublicKey; vault: PublicKey; floorBps: number }) {
  return ix([r(p.beneficiary, true), w(p.vault)], Buffer.concat([u8(4), u16(p.floorBps)]));
}

export function collectFeesIx(p: {
  vault: PublicKey;
  pool: PublicKey;
  poolAuthority: PublicKey;
  vaultBaseToken: PublicKey;
  vaultQuoteToken: PublicKey;
  baseVault: PublicKey;
  quoteVault: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  baseTokenProgram: PublicKey;
  quoteTokenProgram: PublicKey;
  beneficiaryQuoteToken: PublicKey;
}) {
  return ix(
    [
      r(p.vault),
      r(p.poolAuthority),
      w(p.pool),
      w(p.vaultBaseToken),
      w(p.vaultQuoteToken),
      w(p.baseVault),
      w(p.quoteVault),
      r(p.baseMint),
      r(p.quoteMint),
      r(p.baseTokenProgram),
      r(p.quoteTokenProgram),
      r(eventAuthority(DBC_PROGRAM)),
      r(DBC_PROGRAM),
      w(p.beneficiaryQuoteToken),
    ],
    u8(5)
  );
}

export function setBeneficiaryIx(p: { beneficiary: PublicKey; vault: PublicKey; newBeneficiary: PublicKey }) {
  return ix([r(p.beneficiary, true), w(p.vault)], Buffer.concat([u8(6), p.newBeneficiary.toBuffer()]));
}

/** Pull the vault's custom error code out of a failed transaction's logs or error. */
export function vaultErrorName(error: unknown): string | null {
  const e = error as { logs?: string[]; transactionLogs?: string[]; transactionMessage?: string; message?: string };
  const text = [...(e?.logs ?? []), ...(e?.transactionLogs ?? []), e?.transactionMessage ?? '', e?.message ?? '', String(error)].join('\n');
  // The vault's own failure is logged as "Program <vault id> failed: custom program error: 0x...."
  const own = text.match(new RegExp(`Program ${VAULT_PROGRAM_ID.toBase58()} failed: custom program error: 0x([0-9a-f]+)`, 'i'));
  const any = own ?? text.match(/custom program error: 0x([0-9a-f]+)/i);
  if (!any) return null;
  return VAULT_ERRORS[parseInt(any[1]!, 16)] ?? `0x${any[1]}`;
}
