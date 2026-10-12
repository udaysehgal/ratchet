/**
 * Creates the DBC config the vault lifecycle test launches from, on a local validator.
 * Same curve as presets/devnet/vault-test.jsonc (built like studio's `dbc-create-config`).
 * Prints the config address on the last line of stdout.
 *
 *   npx tsx scripts/vault-ci-config.ts [keypair] [preset]   # from scaffolds/fun-launch
 */
import fs from 'node:fs';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, sendAndConfirmTransaction } from '@solana/web3.js';
import { DynamicBondingCurveClient, buildCurve } from '@meteora-ag/dynamic-bonding-curve-sdk';

const RPC = process.env.RPC_URL ?? 'http://127.0.0.1:8899';
const keyPath = process.argv[2] ?? '../../programs/ratchet-vault/keys/local-payer.json';
const presetPath = process.argv[3] ?? '../../presets/devnet/vault-test.jsonc';

async function main() {
  if (!RPC.includes('127.0.0.1') && !RPC.includes('localhost')) {
    throw new Error(`Refusing to create a test config on ${RPC}: this script is for a local validator`);
  }
  const conn = new Connection(RPC, 'confirmed');
  const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(keyPath, 'utf8'))));
  await conn.confirmTransaction(await conn.requestAirdrop(payer.publicKey, 10 * LAMPORTS_PER_SOL), 'confirmed');

  // JSONC: drop whole-line comments (values contain URLs, so leave inline `//` alone)
  const preset = JSON.parse(
    fs
      .readFileSync(presetPath, 'utf8')
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n')
  );
  const { buildCurveMode, leftoverReceiver, feeClaimer, ...curveParams } = preset.dbcConfig;
  if (buildCurveMode !== 0) throw new Error(`Expected buildCurveMode 0 in ${presetPath}, got ${buildCurveMode}`);

  const config = Keypair.generate();
  const tx = await new DynamicBondingCurveClient(conn, 'confirmed').partner.createConfig({
    config: config.publicKey,
    quoteMint: new PublicKey(preset.quoteMint),
    feeClaimer: new PublicKey(feeClaimer),
    leftoverReceiver: new PublicKey(leftoverReceiver),
    payer: payer.publicKey,
    ...buildCurve(curveParams),
  });
  const sig = await sendAndConfirmTransaction(conn, tx, [payer, config], { commitment: 'confirmed' });
  console.error(`created DBC config · ${sig}`);
  console.log(config.publicKey.toBase58());
}

main().catch((e) => {
  console.error(e);
  if (e?.logs) console.error(e.logs.join('\n'));
  process.exit(1);
});
