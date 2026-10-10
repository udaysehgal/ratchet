/**
 * Exercise /api/tx the way the UI does, with a local keypair standing in for the wallet.
 * Usage: npx tsx scripts/smoke-tx.ts <keypair.json> <mint> '<json action>'
 */
import fs from 'fs';
import { Keypair, Transaction } from '@solana/web3.js';

async function main() {
  const [keypairPath, mint, actionJson] = process.argv.slice(2);
  const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath!, 'utf8'))));
  const base = process.env.BASE_URL ?? 'http://localhost:3100';
  const built = await fetch(`${base}/api/tx`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...JSON.parse(actionJson!), mint, user: kp.publicKey.toBase58() }),
  }).then((r) => r.json());
  if (built.error) throw new Error(`build: ${built.error}`);
  const tx = Transaction.from(Buffer.from(built.tx, 'base64'));
  tx.partialSign(kp);
  const sent = await fetch(`${base}/api/send-transaction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signedTransaction: tx.serialize().toString('base64') }),
  }).then((r) => r.json());
  if (sent.error) throw new Error(`send: ${sent.error}`);
  console.log(`${built.description}: ${sent.signature}`);
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
