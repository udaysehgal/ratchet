/**
 * Permissionless keeper for ratchet-vaults. For every vault the program owns:
 *   - claim_vested when the Meteora Lock escrow has unlocked more than was claimed,
 *   - collect_fees when the DBC pool holds creator fees.
 * Both instructions can only move tokens into the vault (base) or to the beneficiary (quote),
 * so anyone can run this with any funded key. Runs on a schedule in .github/workflows/keeper.yml.
 *
 *   KEEPER_KEY='[...]' npx tsx scripts/vault-keeper.ts [rpc]
 */
import fs from 'node:fs';
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { DynamicBondingCurveClient, deriveBaseKeyForLocker, deriveDbcPoolAuthority, deriveEscrow } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { VAULT_PROGRAM_ID, claimVestedIx, collectFeesIx, decodeVault } from '../src/lib/vault';

const RPC = process.argv[2] ?? process.env.RPC_URL ?? 'https://api.devnet.solana.com';
const conn = new Connection(RPC, 'confirmed');
const dbc = new DynamicBondingCurveClient(conn, 'confirmed');
const keySource = process.env.KEEPER_KEY ?? fs.readFileSync(process.env.KEEPER_KEY_PATH ?? '', 'utf8');
const keeper = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(keySource)));
const VAULT_SPACE = 171;
const log: string[] = [];
const note = (s: string) => {
  console.log(s);
  log.push(s);
};

const tokenProgramOf = async (mint: PublicKey) =>
  (await conn.getAccountInfo(mint))!.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;

async function main() {
  const now = (await conn.getBlockTime(await conn.getSlot())) ?? Math.floor(Date.now() / 1000);
  const vaults = await conn.getProgramAccounts(VAULT_PROGRAM_ID, { filters: [{ dataSize: VAULT_SPACE }] });
  note(`keeper ${keeper.publicKey.toBase58().slice(0, 6)}… · ${vaults.length} vault(s) · chain time ${new Date(now * 1000).toISOString()}`);

  for (const { pubkey: vault, account } of vaults) {
    const v = decodeVault(account.data as Buffer);
    const tag = `vault ${vault.toBase58().slice(0, 6)}…`;
    try {
      const baseProgram = await tokenProgramOf(v.baseMint);
      const quoteProgram = await tokenProgramOf(v.quoteMint);
      const vaultBase = getAssociatedTokenAddressSync(v.baseMint, vault, true, baseProgram);
      const vaultQuote = getAssociatedTokenAddressSync(v.quoteMint, vault, true, quoteProgram);
      const beneficiaryQuote = getAssociatedTokenAddressSync(v.quoteMint, v.beneficiary, true, quoteProgram);
      const ensureAtas = [
        createAssociatedTokenAccountIdempotentInstruction(keeper.publicKey, vaultBase, vault, v.baseMint, baseProgram),
        createAssociatedTokenAccountIdempotentInstruction(keeper.publicKey, vaultQuote, vault, v.quoteMint, quoteProgram),
        createAssociatedTokenAccountIdempotentInstruction(keeper.publicKey, beneficiaryQuote, v.beneficiary, v.quoteMint, quoteProgram),
      ];

      // 1. Newly vested team tokens → the vault
      const escrow = deriveEscrow(deriveBaseKeyForLocker(v.dbcPool));
      const escrowInfo = await conn.getAccountInfo(escrow);
      if (escrowInfo) {
        const d = escrowInfo.data as Buffer;
        const cliffTime = Number(d.readBigUInt64LE(144));
        const frequency = Number(d.readBigUInt64LE(152));
        const periods = Number(d.readBigUInt64LE(176));
        const elapsed = now < cliffTime ? -1 : frequency > 0 ? Math.floor((now - cliffTime) / frequency) : periods;
        const vested = elapsed < 0 ? BigInt(0) : d.readBigUInt64LE(160) + d.readBigUInt64LE(168) * BigInt(Math.min(periods, elapsed));
        const claimed = d.readBigUInt64LE(184);
        if (vested > claimed) {
          const escrowToken = getAssociatedTokenAddressSync(v.baseMint, escrow, true, baseProgram);
          const sig = await sendAndConfirmTransaction(
            conn,
            new Transaction().add(...ensureAtas, claimVestedIx({ vault, escrow, baseMint: v.baseMint, escrowToken, vaultBaseToken: vaultBase, tokenProgram: baseProgram })),
            [keeper]
          );
          note(`${tag} claim_vested: ${vested - claimed} raw into the vault · ${sig}`);
        } else {
          note(`${tag} nothing newly vested`);
        }
      }

      // 2. Creator fees → quote to the beneficiary, base stays in the vault
      const pool = await dbc.state.getPool(v.dbcPool);
      const state = pool?.poolState;
      if (state && (!state.creatorQuoteFee.isZero() || !state.creatorBaseFee.isZero())) {
        const sig = await sendAndConfirmTransaction(
          conn,
          new Transaction().add(
            ...ensureAtas,
            collectFeesIx({
              vault, pool: v.dbcPool, poolAuthority: deriveDbcPoolAuthority(), vaultBaseToken: vaultBase, vaultQuoteToken: vaultQuote,
              baseVault: state.baseVault, quoteVault: state.quoteVault, baseMint: v.baseMint, quoteMint: v.quoteMint,
              baseTokenProgram: baseProgram, quoteTokenProgram: quoteProgram, beneficiaryQuoteToken: beneficiaryQuote,
            })
          ),
          [keeper]
        );
        note(`${tag} collect_fees · ${sig}`);
      } else {
        note(`${tag} no creator fees`);
      }
    } catch (e) {
      note(`${tag} error: ${String(e).slice(0, 200)}`);
    }
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### ratchet-vault keeper\n\n${log.map((l) => `- ${l}`).join('\n')}\n`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
