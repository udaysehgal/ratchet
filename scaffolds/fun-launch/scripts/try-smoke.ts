/**
 * Runs every /try step against devnet with a local key standing in for the visitor's wallet.
 *   npx tsx scripts/try-smoke.ts <keypair>
 */
import fs from 'node:fs';
import { Keypair, Transaction, sendAndConfirmRawTransaction } from '@solana/web3.js';
import { devnet } from '../src/server/devnet';
import { buildAsk, buildBuy, buildClaimVested, buildCreatePair, buildGraduate, buildLaunch, getTryState, simulateRefusal, type TryTx } from '../src/server/try';
import { PublicKey } from '@solana/web3.js';

const user = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(process.argv[2]!, 'utf8'))));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sign(built: TryTx) {
  const tx = Transaction.from(Buffer.from(built.tx, 'base64'));
  tx.recentBlockhash = (await devnet.getLatestBlockhash()).blockhash;
  const co = (built.coSigners ?? []).map((k) => Keypair.fromSecretKey(Buffer.from(k, 'base64')));
  tx.sign(user, ...co);
  const sig = await sendAndConfirmRawTransaction(devnet, tx.serialize(), { commitment: 'confirmed' });
  console.log(`ok  ${built.description}  ${sig.slice(0, 16)}…`);
}

(async () => {
  const launch = await buildLaunch(user.publicKey, 'Try Smoke', 'SMOKE', 'https://ratchet-olive.vercel.app/api/try/metadata?n=Try%20Smoke&s=SMOKE');
  await sign(launch);
  const pool = new PublicKey(launch.pool!);
  await sign(await buildBuy(user.publicKey, pool));
  await sign(await buildGraduate(user.publicKey, pool)); // escrow
  await sign(await buildGraduate(user.publicKey, pool)); // migrate
  await sleep(8000); // 5 s cliff
  await sign(await buildClaimVested(user.publicKey, pool));
  await sign(await buildCreatePair(user.publicKey, pool));
  console.log('refusal below floor:', await simulateRefusal(user.publicKey, pool, 'below-floor'));
  await sign(await buildAsk(user.publicKey, pool));
  console.log('refusal over cap:', await simulateRefusal(user.publicKey, pool, 'over-cap'));
  console.log('state:', await getTryState(pool, user.publicKey));
})().catch((e) => {
  console.error(e?.logs ?? e);
  process.exit(1);
});
