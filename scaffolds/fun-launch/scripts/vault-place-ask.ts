/**
 * Place a standing ladder through a ratchet-vault (beneficiary signs).
 *   npx tsx scripts/vault-place-ask.ts <vault> <keypair> [multiples=1.6,2.5,4] [rpc]
 */
import fs from 'node:fs';
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import BN from 'bn.js';
import DLMM, { deriveCustomizablePermissionlessLbPair, getBinArrayInfoForNonContiguousBinIds, getQPriceFromId } from '@meteora-ag/dlmm';
import { DLMM_PROGRAM, decodeVault, placeAskIx } from '../src/lib/vault';

const [vaultArg, keyPath, multArg, rpc] = process.argv.slice(2);
const conn = new Connection(rpc ?? 'https://api.devnet.solana.com', 'confirmed');
const team = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(keyPath!, 'utf8'))));
const vault = new PublicKey(vaultArg!);
const multiples = (multArg ?? '1.6,2.5,4').split(',').map(Number);

(async () => {
  const v = decodeVault((await conn.getAccountInfo(vault))!.data as Buffer);
  if (!v.beneficiary.equals(team.publicKey)) throw new Error('keypair is not the beneficiary');
  const lbPair = deriveCustomizablePermissionlessLbPair(v.baseMint, v.quoteMint, DLMM_PROGRAM)[0];
  const dlmm = await DLMM.create(conn, lbPair, { cluster: 'devnet', programId: DLMM_PROGRAM });
  const grad = Number(v.graduationPriceQ64) / 2 ** 64;
  const step = dlmm.lbPair.binStep;
  const atOrAbove = (m: number) => {
    let id = DLMM.getBinIdFromPrice(grad * m, step, false);
    while (Number(getQPriceFromId(new BN(id), new BN(step)).toString()) / 2 ** 64 < grad * m) id++;
    return id;
  };
  const vaultBase = getAssociatedTokenAddressSync(v.baseMint, vault, true, TOKEN_PROGRAM_ID);
  const held = BigInt((await conn.getTokenAccountBalance(vaultBase)).value.amount);
  const each = held / BigInt(multiples.length * 10); // the daily cap: 10% of the inventory, split evenly
  const bins = multiples.map((m) => ({ id: atOrAbove(m), amount: each }));
  const { binArrayAccountMetas, binArrayIndexes } = getBinArrayInfoForNonContiguousBinIds(bins.map((b) => b.id), DLMM_PROGRAM, lbPair);
  const init = await dlmm.initializeBinArrays(binArrayIndexes, team.publicKey);
  if (init.length) await sendAndConfirmTransaction(conn, new Transaction().add(...init), [team]).catch((): undefined => undefined);
  const sig = await sendAndConfirmTransaction(
    conn,
    new Transaction().add(
      placeAskIx({
        beneficiary: team.publicKey, vault, nonce: v.ordersPlaced, lbPair, bitmapExtension: null,
        reserveX: dlmm.lbPair.reserveX, baseMint: v.baseMint, vaultBaseToken: vaultBase, tokenProgram: TOKEN_PROGRAM_ID,
        bins, hookSlices: [[0, 0]], binArrays: binArrayAccountMetas.map((m) => m.pubkey),
      })
    ),
    [team]
  );
  console.log('placed', multiples.join('x, ') + 'x', 'bins', bins.map((b) => b.id).join(','), sig);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
