/**
 * Exercise /api/tx the way the UI does, with a local keypair standing in for the wallet.
 * Usage: npx tsx scripts/smoke-tx.ts <keypair.json> <mint> '<json action>'
 */
import fs from 'fs';
import { Connection, Keypair, Transaction } from '@solana/web3.js';

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
  const connection = new Connection(process.env.RPC_URL ?? 'https://api.devnet.solana.com', 'confirmed');
  const signature = await connection.sendRawTransaction(tx.serialize());
  for (let i = 0; i < 10; i++) {
    const r = await fetch(`${base}/api/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signature }),
    }).then((x) => x.json());
    if (r.status === 'confirmed') break;
    if (r.status === 'failed') throw new Error(`confirm: ${r.error}`);
  }
  console.log(`${built.description}: ${signature}`);
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
