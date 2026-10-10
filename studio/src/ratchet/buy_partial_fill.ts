/**
 * Buy on a DBC pool in PartialFill mode: fills up to the end of the curve and refunds the rest.
 * Usage: DBC_CONFIG_PATH=... pnpm tsx src/ratchet/buy_partial_fill.ts --baseMint <mint> --amount <quote>
 */
import BN from 'bn.js';
import { Connection, sendAndConfirmTransaction } from '@solana/web3.js';
import { DynamicBondingCurveClient, SwapMode } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { getDbcConfig } from '../helpers/cli';
import { safeParseKeypairFromFile } from '../helpers';
import { PublicKey } from '@solana/web3.js';

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1 || !process.argv[i + 1]) throw new Error(`Missing --${name}`);
  return process.argv[i + 1];
}

async function main() {
  const config = await getDbcConfig();
  const keypair = await safeParseKeypairFromFile(config.keypairFilePath);
  const connection = new Connection(config.rpcUrl, 'confirmed');
  const client = new DynamicBondingCurveClient(connection, 'confirmed');

  const baseMint = new PublicKey(arg('baseMint'));
  const amountIn = new BN(Math.round(Number(arg('amount')) * 1e9));
  const pool = await client.state.getPoolByBaseMint(baseMint);
  if (!pool) throw new Error('Pool not found');

  const tx = await client.pool.swap2({
    owner: keypair.publicKey,
    pool: pool.publicKey,
    swapBaseForQuote: false,
    referralTokenAccount: null,
    swapMode: SwapMode.PartialFill,
    amountIn,
    minimumAmountOut: new BN(0),
  });
  const sig = await sendAndConfirmTransaction(connection, tx, [keypair], { commitment: 'confirmed' });
  console.log(`> Partial-fill buy tx: ${sig}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
