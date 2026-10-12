/**
 * What do Meteora DBC teams do when their tokens unlock?
 *
 * Every DBC team allocation is a Meteora Lock vesting escrow created by DBC's pool authority at
 * graduation. This script reads all of them from mainnet and, for each one: how much has
 * vested, how much the team claimed, how much of the claimed amount is still in the team
 * wallet, and where the token's price is against its graduation price.
 *
 *   npx tsx scripts/unlock-study.ts [rpcUrl]   →  ../../docs/evidence/unlock-study.json
 */
import fs from 'node:fs';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';

const RPC = process.argv[2] ?? 'https://api.mainnet-beta.solana.com';
const LOCKER = new PublicKey('LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn');
const DBC_POOL_AUTHORITY = 'FhVo3mqL8PW5pH5U2CN4XE33DokiyZnUwuGpH2hmHLuM';
const OUT = new URL('../../../docs/evidence/unlock-study.json', import.meta.url);

const conn = new Connection(RPC, 'confirmed');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function retry<T>(f: () => Promise<T>, tries = 6): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await f();
    } catch (e) {
      if (i >= tries) throw e;
      await sleep(500 * 2 ** i);
    }
  }
}

type Escrow = {
  escrow: string;
  recipient: string;
  mint: string;
  token2022: boolean;
  cliffTime: number;
  frequency: number;
  cliffUnlock: bigint;
  perPeriod: bigint;
  periods: number;
  claimed: bigint;
  cancelledAt: number;
};

function parse(pubkey: PublicKey, d: Buffer): Escrow {
  const pk = (o: number) => new PublicKey(d.subarray(o, o + 32)).toBase58();
  const u64 = (o: number) => d.readBigUInt64LE(o);
  return {
    escrow: pubkey.toBase58(),
    recipient: pk(8),
    mint: pk(40),
    token2022: d[139] === 1,
    cliffTime: Number(u64(144)),
    frequency: Number(u64(152)),
    cliffUnlock: u64(160),
    perPeriod: u64(168),
    periods: Number(u64(176)),
    claimed: u64(184),
    cancelledAt: Number(u64(200)),
  };
}

function vestedAt(e: Escrow, now: number): bigint {
  if (now < e.cliffTime) return BigInt(0);
  const elapsed = e.frequency > 0 ? Math.floor((now - e.cliffTime) / e.frequency) : e.periods;
  return e.cliffUnlock + e.perPeriod * BigInt(Math.min(e.periods, elapsed));
}

async function inBatches<T, R>(items: T[], size: number, f: (batch: T[]) => Promise<R[]>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await retry(() => f(items.slice(i, i + size)))));
    if (i % 1000 === 0) process.stdout.write(`  ${i}/${items.length}\r`);
  }
  return out;
}

async function main() {
  const slot = await conn.getSlot();
  const now = (await conn.getBlockTime(slot)) ?? Math.floor(Date.now() / 1000);

  const raw = await retry(() =>
    conn.getProgramAccounts(LOCKER, {
      filters: [{ dataSize: 296 }, { memcmp: { offset: 72, bytes: DBC_POOL_AUTHORITY } }],
    })
  );
  const escrows = raw.map((a) => parse(a.pubkey, a.account.data as Buffer)).filter((e) => e.perPeriod + e.cliffUnlock > BigInt(0));
  console.log(`DBC team escrows: ${escrows.length}`);

  // How much of what each team claimed is still in its wallet (ATA of the token)
  const atas = escrows.map((e) =>
    getAssociatedTokenAddressSync(new PublicKey(e.mint), new PublicKey(e.recipient), true, e.token2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID)
  );
  const ataInfos = await inBatches(atas, 100, (b) => conn.getMultipleAccountsInfo(b));
  const held = ataInfos.map((a) => (a && a.data.length >= 72 ? (a.data as Buffer).readBigUInt64LE(64) : BigInt(0)));

  const rows = escrows.map((e, i) => {
    const total = e.cliffUnlock + e.perPeriod * BigInt(e.periods);
    const vested = vestedAt(e, now);
    const stillHeld = held[i]! < e.claimed ? held[i]! : e.claimed;
    return {
      ...e,
      total,
      vested,
      heldOfClaimed: stillHeld,
      movedOfClaimed: e.claimed - stillHeld,
    };
  });

  // Market today for each token (DexScreener, 30 tokens per request): the most liquid pair
  const markets: Record<string, { fdvUsd: number | null; liquidityUsd: number; priceUsd: number | null; pairs: number } | null> = {};
  const mints = [...new Set(rows.map((r) => r.mint))];
  for (let i = 0; i < mints.length; i += 30) {
    const batch = mints.slice(i, i + 30);
    const pairs = await retry(async () => {
      const res = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${batch.join(',')}`);
      if (!res.ok) throw new Error(`dexscreener ${res.status}`);
      return (await res.json()) as { baseToken: { address: string }; fdv?: number; priceUsd?: string; liquidity?: { usd?: number } }[];
    });
    for (const m of batch) {
      const mine = pairs.filter((p) => p.baseToken.address === m).sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
      const top = mine[0];
      markets[m] = top
        ? { fdvUsd: top.fdv ?? null, liquidityUsd: top.liquidity?.usd ?? 0, priceUsd: top.priceUsd ? Number(top.priceUsd) : null, pairs: mine.length }
        : null;
    }
    process.stdout.write(`  markets ${i}/${mints.length}\r`);
    await sleep(250);
  }

  const out = {
    generatedAt: new Date(now * 1000).toISOString(),
    rpc: RPC.replace(/api-key=[^&]+/, 'api-key=***'),
    method:
      'All Meteora Lock escrows created by the DBC pool authority (FhVo3m…HLuM), i.e. every DBC team allocation. Vested is computed at chain time. "Moved" = claimed minus what the recipient wallet still holds in its token account for that mint: a lower bound on what was sold or sent elsewhere. Market: the most liquid pair on DexScreener at generation time (null = no pair listed).',
    escrows: rows.map((r) => ({
      escrow: r.escrow,
      mint: r.mint,
      recipient: r.recipient,
      total: r.total.toString(),
      vested: r.vested.toString(),
      claimed: r.claimed.toString(),
      movedOfClaimed: r.movedOfClaimed.toString(),
      cliffTime: r.cliffTime,
      cancelled: r.cancelledAt > 0,
      market: markets[r.mint] ?? null,
    })),
  };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log(`\nwrote ${OUT.pathname}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
