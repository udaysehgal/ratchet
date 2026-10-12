/**
 * Would Ratchet have stopped it? For every DBC team that moved ≥90% of its claimed unlocks
 * (docs/evidence/unlock-study.json), find each DEX sale of the team's tokens out of the team
 * wallet, price it in SOL, and compare it with that token's graduation price (the DBC config's
 * migration price). A Ratchet vault refuses any sale below 1.25× the graduation price and any
 * day that sells more than 10% of the vault.
 *   npx tsx scripts/unlock-counterfactual.ts [rpc]  →  ../../docs/evidence/unlock-counterfactual.json
 */
import fs from 'node:fs';
import { Connection, PublicKey, type ParsedTransactionWithMeta } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { DynamicBondingCurveClient, getPriceFromSqrtPrice } from '@meteora-ag/dynamic-bonding-curve-sdk';

const conn = new Connection(process.argv[2] ?? 'https://api.mainnet-beta.solana.com', 'confirmed');
const dbc = new DynamicBondingCurveClient(conn, 'confirmed');
const WSOL = 'So11111111111111111111111111111111111111112';
const FLOOR = 1.25;
const DAILY_CAP = 0.1;
const LIMIT = Number(process.env.LIMIT ?? 10_000);
/** Check every STEP-th team (an evenly spaced, deterministic sample); 1 = all of them. */
const STEP = Number(process.env.STEP ?? 1);
const SIGS = Number(process.env.SIGS ?? 100);
const OUT = '../../docs/evidence/unlock-counterfactual.json';
const DEX = new Set([
  'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG', // Meteora DAMM v2
  'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN', // Meteora DBC
  'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo', // Meteora DLMM
  'Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB', // Meteora DAMM v1
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', // Jupiter
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium
  'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK', // Raydium CLMM
  'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA', // PumpSwap
  'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc', // Orca
  'proVF4pMXVaYqmy4NjniPh4pqKNfMmsihgd4wdkCX3u', // OKX DEX
]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function retry<T>(f: () => Promise<T>, n = 6): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await f();
    } catch (e) {
      if (i >= n) throw e;
      await sleep(1000 * 2 ** i);
    }
  }
}

const quoteDecimalsCache = new Map<string, number>();
async function getQuoteDecimals(mint: string) {
  if (!quoteDecimalsCache.has(mint)) {
    const info = await conn.getParsedAccountInfo(new PublicKey(mint));
    quoteDecimalsCache.set(mint, (info.value?.data as { parsed: { info: { decimals: number } } }).parsed.info.decimals);
  }
  return quoteDecimalsCache.get(mint)!;
}

type Sale = { sig: string; time: number; tokens: number; sol: number; ratio: number };

/** Tokens the team wallet sold and SOL it got back in one transaction, or null if it wasn't a DEX sale. */
function readSale(tx: ParsedTransactionWithMeta, mint: string, owner: string, decimals: number, quote: string, quoteDecimals: number) {
  const meta = tx.meta;
  if (!meta || meta.err) return null;
  const keys = tx.transaction.message.accountKeys.map((k) => k.pubkey.toBase58());
  if (!keys.some((k) => DEX.has(k))) return null;
  const bal = (list: typeof meta.preTokenBalances, m: string) =>
    (list ?? []).filter((b) => b.mint === m && b.owner === owner).reduce((s, b) => s + Number(b.uiTokenAmount.amount), 0);
  const tokens = (bal(meta.preTokenBalances, mint) - bal(meta.postTokenBalances, mint)) / 10 ** decimals;
  if (tokens <= 0) return null;
  const i = keys.indexOf(owner);
  const lamports = quote === WSOL && i >= 0 ? meta.postBalances[i] - meta.preBalances[i] + (i === 0 ? meta.fee : 0) : 0;
  const quoteIn = (lamports + bal(meta.postTokenBalances, quote) - bal(meta.preTokenBalances, quote)) / 10 ** quoteDecimals;
  if (quoteIn <= 0) return null;
  return { tokens, sol: quoteIn, time: tx.blockTime ?? 0 };
}

(async () => {
  const study = JSON.parse(fs.readFileSync('../../docs/evidence/unlock-study.json', 'utf8'));
  const moved = study.escrows
    .filter((e: { claimed: string; movedOfClaimed: string }) => BigInt(e.claimed) > BigInt(0) && BigInt(e.movedOfClaimed) * BigInt(10) >= BigInt(e.claimed) * BigInt(9))
    .filter((_: unknown, i: number) => i % STEP === 0)
    .slice(0, LIMIT);

  const teams: Record<string, unknown>[] = [];
  const skipped = { noPool: 0, noSales: 0, error: 0 };
  const summarize = (checked: number) => {
  const solTeams = teams.filter((t) => t.quoteMint === WSOL);
  const sum = (k: string) => solTeams.reduce((s, t) => s + (t[k] as number), 0);
  return {
    generatedAt: new Date().toISOString(),
    method:
      'Teams from unlock-study.json that moved ≥90% of claimed unlocks. For each, every transaction on the team wallet’s token account (latest SIGS, see sample) that touched a DEX program, lowered the team’s token balance and raised its balance of the pool’s quote token (SOL or e.g. USDC): price = quote received / tokens sold, compared with the DBC config’s migration (graduation) price. Teams whose unlocks left by plain transfer, or sold into a different quote token, are counted as unpriced.',
    sample: { everyNthTeam: STEP, latestSignaturesPerWallet: SIGS },
    teamsChecked: checked,
    complete: checked === moved.length,
    teamsWithPricedSales: teams.length,
    skipped,
    teamsWithAnySaleBelowFloor: teams.filter((t) => (t.soldBelowFloor as number) > 0).length,
    teamsThatWouldBeBlockedEntirely: teams.filter((t) => (t.soldBelowFloor as number) >= (t.sold as number) * 0.999).length,
    teamsOverDailyCap: teams.filter((t) => (t.maxSoldIn24h as number) > (t.claimed as number) * DAILY_CAP).length,
    quoteMints: teams.reduce((m: Record<string, number>, t) => ((m[t.quoteMint as string] = (m[t.quoteMint as string] ?? 0) + 1), m), {}),
    proceedsSolOfSolQuotedTeams: sum('proceedsSol'),
    proceedsSolBelowFloorOfSolQuotedTeams: sum('proceedsSolBelowFloor'),
    medianTeamSaleRatio: teams.map((t) => t.medianRatio as number).sort((a, b) => a - b)[Math.floor(teams.length / 2)],
    teams,
  };
  };
  for (const [n, e] of moved.entries()) {
    try {
      const mint = new PublicKey(e.mint);
      const pool = await retry(() => dbc.state.getPoolByBaseMint(mint));
      if (!pool) {
        skipped.noPool++;
        continue;
      }
      const config = await retry(() => dbc.state.getPoolConfig(pool.account.poolState.config));
      const quote = config.quoteMint.toBase58();
      const quoteDecimals = quote === WSOL ? 9 : await retry(() => getQuoteDecimals(quote));
      const decimals = config.tokenDecimal;
      const grad = Number(getPriceFromSqrtPrice(config.migrationSqrtPrice, decimals, quoteDecimals));
      const mintInfo = await retry(() => conn.getAccountInfo(mint));
      const program = mintInfo?.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
      const ata = getAssociatedTokenAddressSync(mint, new PublicKey(e.recipient), true, program);
      const sigs = await retry(() => conn.getSignaturesForAddress(ata, { limit: SIGS }));
      const sales: Sale[] = [];
      for (const s of sigs) {
        if (s.err) continue;
        const tx = await retry(() => conn.getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 0 }));
        await sleep(120);
        const sale = tx && readSale(tx, e.mint, e.recipient, decimals, quote, quoteDecimals);
        if (sale) sales.push({ sig: s.signature, ...sale, ratio: sale.sol / sale.tokens / grad });
      }
      if (sales.length === 0) {
        skipped.noSales++;
        continue;
      }
      const claimed = Number(BigInt(e.claimed)) / 10 ** decimals;
      const sold = sales.reduce((s, x) => s + x.tokens, 0);
      const belowFloor = sales.filter((x) => x.ratio < FLOOR).reduce((s, x) => s + x.tokens, 0);
      const solBelowFloor = sales.filter((x) => x.ratio < FLOOR).reduce((s, x) => s + x.sol, 0);
      const belowGrad = sales.filter((x) => x.ratio < 1).reduce((s, x) => s + x.tokens, 0);
      sales.sort((a, b) => a.time - b.time);
      const maxDay = Math.max(...sales.map((a) => sales.filter((b) => b.time >= a.time && b.time < a.time + 86_400).reduce((s, b) => s + b.tokens, 0)));
      teams.push({
        mint: e.mint,
        quoteMint: quote,
        recipient: e.recipient,
        graduationPrice: grad,
        claimed,
        sold,
        soldBelowFloor: belowFloor,
        soldBelowGraduation: belowGrad,
        proceedsSol: sales.reduce((s, x) => s + x.sol, 0),
        proceedsSolBelowFloor: solBelowFloor,
        medianRatio: [...sales].sort((a, b) => a.ratio - b.ratio)[Math.floor(sales.length / 2)].ratio,
        maxSoldIn24h: maxDay,
        sales: sales.map((x) => ({ sig: x.sig, time: x.time, tokens: x.tokens, sol: x.sol, ratio: Number(x.ratio.toFixed(4)) })),
      });
    } catch {
      skipped.error++;
    }
    fs.writeFileSync(OUT, JSON.stringify(summarize(n + 1), null, 1));
    if (n % 5 === 0) console.log(`${n + 1}/${moved.length}: ${teams.length} teams with priced sales`, skipped);
    await sleep(150);
  }

  const result = summarize(moved.length);
  const { teams: _t, ...headline } = result;
  console.log(JSON.stringify(headline, null, 1));
  fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
})();
