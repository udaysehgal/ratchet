import { PublicKey } from '@solana/web3.js';
import { getLaunch, listLaunches } from '../src/server/meteora';

async function main() {
  const launches = await listLaunches();
  console.log('launches:', JSON.stringify(launches, null, 1));
  const mint = process.argv[2];
  if (mint) console.log('detail:', JSON.stringify(await getLaunch(new PublicKey(mint)), null, 1));
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
