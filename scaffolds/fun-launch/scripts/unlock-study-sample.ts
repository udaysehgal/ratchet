/**
 * For a deterministic sample of 40 DBC teams that moved ≥90% of their claimed unlocks, find
 * the first transaction that reduced the team's balance and whether it went through a DEX.
 *   npx tsx scripts/unlock-study-sample.ts   →  ../../docs/evidence/unlock-study-sample.json
 */
import fs from 'node:fs';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';

const conn = new Connection(process.argv[2] ?? 'https://api.mainnet-beta.solana.com', 'confirmed');
const DEX: Record<string, string> = {
  cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG: 'Meteora DAMM v2',
  dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN: 'Meteora DBC',
  LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo: 'Meteora DLMM',
  Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB: 'Meteora DAMM v1',
  JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4: 'Jupiter',
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': 'Raydium',
  CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK: 'Raydium CLMM',
  pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA: 'PumpSwap',
  whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc: 'Orca',
  proVF4pMXVaYqmy4NjniPh4pqKNfMmsihgd4wdkCX3u: 'OKX DEX',
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const d = JSON.parse(fs.readFileSync('../../docs/evidence/unlock-study.json', 'utf8'));
  const moved = d.escrows.filter((e: { claimed: string; movedOfClaimed: string }) =>
    BigInt(e.claimed) > BigInt(0) && BigInt(e.movedOfClaimed) * BigInt(10) >= BigInt(e.claimed) * BigInt(9));
  const k = Math.floor(moved.length / 40);
  const sample = moved.filter((_: unknown, i: number) => i % k === 0).slice(0, 40);
  let viaDex = 0;
  let transferOnly = 0;
  let unknown = 0;
  const venues: Record<string, number> = {};
  const examples: { mint: string; venue: string; sig: string }[] = [];
  for (const e of sample) {
    try {
      const mintInfo = await conn.getAccountInfo(new PublicKey(e.mint));
      const program = mintInfo?.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
      const ata = getAssociatedTokenAddressSync(new PublicKey(e.mint), new PublicKey(e.recipient), true, program);
      let found: string | null = null;
      for (const s of await conn.getSignaturesForAddress(ata, { limit: 25 })) {
        const tx = await conn.getTransaction(s.signature, { maxSupportedTransactionVersion: 0 });
        await sleep(150);
        if (!tx?.meta) continue;
        const pre = tx.meta.preTokenBalances?.find((b) => b.mint === e.mint && b.owner === e.recipient);
        const post = tx.meta.postTokenBalances?.find((b) => b.mint === e.mint && b.owner === e.recipient);
        if (BigInt(pre?.uiTokenAmount.amount ?? '0') <= BigInt(post?.uiTokenAmount.amount ?? '0')) continue;
        const keys = tx.transaction.message.getAccountKeys({ accountKeysFromLookups: tx.meta.loadedAddresses }).keySegments().flat().map((x) => x.toBase58());
        const venue = keys.map((x) => DEX[x]).find(Boolean);
        if (venue) {
          found = venue;
          if (examples.length < 5) examples.push({ mint: e.mint, venue, sig: s.signature });
          break;
        }
        found = found ?? 'transfer';
      }
      if (!found) unknown++;
      else if (found === 'transfer') transferOnly++;
      else {
        viaDex++;
        venues[found] = (venues[found] ?? 0) + 1;
      }
    } catch {
      unknown++;
    }
    await sleep(300);
  }
  const res = { sampled: sample.length, soldViaDex: viaDex, transferredOnly: transferOnly, undetermined: unknown, venues, examples };
  console.log(JSON.stringify(res, null, 1));
  fs.writeFileSync('../../docs/evidence/unlock-study-sample.json', JSON.stringify(res, null, 1));
})();
