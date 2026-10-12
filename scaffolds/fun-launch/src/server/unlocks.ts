/**
 * Unlock radar: every Meteora DBC team allocation (Meteora Lock escrows created by DBC's pool
 * authority), with its schedule, what the team claimed, and how much of that has left the team
 * wallet. Method and findings: docs/UNLOCK-STUDY.md.
 */
import { PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { connection, getTokenMetas } from './meteora';

const LOCKER = new PublicKey('LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn');
const DBC_POOL_AUTHORITY = 'FhVo3mqL8PW5pH5U2CN4XE33DokiyZnUwuGpH2hmHLuM';
const ESCROW_SIZE = 296;
const TTL_MS = 10 * 60_000;

export type TeamUnlock = {
  escrow: string;
  mint: string;
  symbol: string;
  name: string;
  recipient: string;
  total: number; // raw units
  vested: number;
  claimed: number;
  moved: number; // claimed tokens no longer in the team wallet (lower bound)
  movedShare: number | null; // moved / claimed, null if nothing claimed
  nextUnlockAt: number | null; // unix seconds, null when fully vested
  nextUnlockAmount: number; // raw units
  finalUnlockAt: number;
  verdict: 'sold' | 'held' | 'mixed' | 'unclaimed' | 'locked';
};

type Escrow = {
  pubkey: PublicKey;
  recipient: PublicKey;
  mint: PublicKey;
  token2022: boolean;
  cliffTime: number;
  frequency: number;
  cliffUnlock: bigint;
  perPeriod: bigint;
  periods: number;
  claimed: bigint;
};

function parse(pubkey: PublicKey, d: Buffer): Escrow {
  return {
    pubkey,
    recipient: new PublicKey(d.subarray(8, 40)),
    mint: new PublicKey(d.subarray(40, 72)),
    token2022: d[139] === 1,
    cliffTime: Number(d.readBigUInt64LE(144)),
    frequency: Number(d.readBigUInt64LE(152)),
    cliffUnlock: d.readBigUInt64LE(160),
    perPeriod: d.readBigUInt64LE(168),
    periods: Number(d.readBigUInt64LE(176)),
    claimed: d.readBigUInt64LE(184),
  };
}

function schedule(e: Escrow, now: number) {
  const total = e.cliffUnlock + e.perPeriod * BigInt(e.periods);
  if (now < e.cliffTime) {
    return { total, vested: BigInt(0), nextAt: e.cliffTime as number | null, nextAmount: e.cliffUnlock > BigInt(0) ? e.cliffUnlock : e.perPeriod };
  }
  const elapsed = e.frequency > 0 ? Math.floor((now - e.cliffTime) / e.frequency) : e.periods;
  const done = Math.min(e.periods, elapsed);
  const vested = e.cliffUnlock + e.perPeriod * BigInt(done);
  const nextAt = done < e.periods ? e.cliffTime + (done + 1) * e.frequency : null;
  return { total, vested, nextAt, nextAmount: nextAt ? e.perPeriod : BigInt(0) };
}

function verdict(claimed: bigint, moved: bigint, vested: bigint): TeamUnlock['verdict'] {
  if (vested === BigInt(0)) return 'locked';
  if (claimed === BigInt(0)) return 'unclaimed';
  if (moved * BigInt(10) >= claimed * BigInt(9)) return 'sold';
  if (moved * BigInt(10) <= claimed) return 'held';
  return 'mixed';
}

let cache: { at: number; value: Promise<TeamUnlock[]> } | null = null;

export function getTeamUnlocks(): Promise<TeamUnlock[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const value = loadTeamUnlocks().catch((e) => {
    cache = null;
    throw e;
  });
  cache = { at: Date.now(), value };
  return value;
}

async function loadTeamUnlocks(): Promise<TeamUnlock[]> {
  const now = Math.floor(Date.now() / 1000);
  const accounts = await connection.getProgramAccounts(LOCKER, {
    filters: [{ dataSize: ESCROW_SIZE }, { memcmp: { offset: 72, bytes: DBC_POOL_AUTHORITY } }],
  });
  const escrows = accounts.map((a) => parse(a.pubkey, a.account.data as Buffer));

  // Team wallet balances, 100 token accounts per request
  const atas = escrows.map((e) =>
    getAssociatedTokenAddressSync(e.mint, e.recipient, true, e.token2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID)
  );
  const held: bigint[] = [];
  for (let i = 0; i < atas.length; i += 100) {
    const infos = await connection.getMultipleAccountsInfo(atas.slice(i, i + 100));
    for (const info of infos) held.push(info && info.data.length >= 72 ? (info.data as Buffer).readBigUInt64LE(64) : BigInt(0));
  }
  const metas = await getTokenMetas(escrows.map((e) => e.mint));

  return escrows.map((e, i) => {
    const s = schedule(e, now);
    const kept = held[i]! < e.claimed ? held[i]! : e.claimed;
    const moved = e.claimed - kept;
    const meta = metas.get(e.mint.toBase58());
    return {
      escrow: e.pubkey.toBase58(),
      mint: e.mint.toBase58(),
      symbol: meta?.symbol ?? '???',
      name: meta?.name ?? 'Unknown',
      recipient: e.recipient.toBase58(),
      total: Number(s.total),
      vested: Number(s.vested),
      claimed: Number(e.claimed),
      moved: Number(moved),
      movedShare: e.claimed > BigInt(0) ? Number(moved) / Number(e.claimed) : null,
      nextUnlockAt: s.nextAt,
      nextUnlockAmount: Number(s.nextAmount),
      finalUnlockAt: e.cliffTime + e.periods * e.frequency,
      verdict: verdict(e.claimed, moved, s.vested),
    };
  });
}

export async function getTeamUnlockForMint(mint: string): Promise<TeamUnlock | null> {
  return (await getTeamUnlocks()).find((u) => u.mint === mint) ?? null;
}
