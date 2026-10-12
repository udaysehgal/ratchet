/**
 * Permissionless keeper for ratchet-vaults. For every vault the program owns:
 *   - claim_vested when the Meteora Lock escrow has unlocked more than was claimed,
 *   - collect_fees when the DBC pool holds creator fees,
 *   - after graduation: the creator's curve surplus, migration-fee share and DAMM v2 LP fees.
 * Every one of these can only move tokens into the vault (base) or to the beneficiary (quote),
 * so anyone can run this with any funded key. Runs on a schedule in .github/workflows/keeper.yml.
 *
 *   KEEPER_KEY='[...]' npx tsx scripts/vault-keeper.ts [rpc]
 */
import fs from 'node:fs';
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { DynamicBondingCurveClient, deriveBaseKeyForLocker, deriveDbcPoolAuthority, deriveEscrow } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { CpAmm, derivePoolAuthority as deriveDammPoolAuthority, getUnClaimLpFee } from '@meteora-ag/cp-amm-sdk';
import {
  VAULT_PROGRAM_ID,
  VAULT_SPACE,
  claimPositionFeeIx,
  claimVestedIx,
  collectFeesIx,
  decodeVault,
  withdrawMigrationFeeIx,
  withdrawSurplusIx,
} from '../src/lib/vault';

const RPC = process.argv[2] ?? process.env.RPC_URL ?? 'https://api.devnet.solana.com';
const conn = new Connection(RPC, 'confirmed');
const dbc = new DynamicBondingCurveClient(conn, 'confirmed');
const cpAmm = new CpAmm(conn);
const keySource = process.env.KEEPER_KEY ?? fs.readFileSync(process.env.KEEPER_KEY_PATH ?? '', 'utf8');
const keeper = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(keySource)));
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

      // 3. After graduation: creator surplus and migration-fee share (quote) → the beneficiary.
      // Preflight simulation rejects these when there is nothing to withdraw, at no cost.
      if (state?.isMigrated === 1) {
        const config = await dbc.state.getPoolConfig(state.config);
        const quoteAccounts = {
          vault, poolAuthority: deriveDbcPoolAuthority(), config: state.config, pool: v.dbcPool, vaultQuoteToken: vaultQuote,
          quoteVault: state.quoteVault, quoteMint: v.quoteMint, quoteTokenProgram: quoteProgram, beneficiaryQuoteToken: beneficiaryQuote,
        };
        const withdrawals: [string, TransactionInstruction][] = [['surplus', withdrawSurplusIx(quoteAccounts)]];
        if (config.creatorMigrationFeePercentage > 0) withdrawals.push(['migration fee', withdrawMigrationFeeIx(quoteAccounts)]);
        for (const [label, ix] of withdrawals) {
          try {
            const sig = await sendAndConfirmTransaction(conn, new Transaction().add(...ensureAtas, ix), [keeper]);
            note(`${tag} withdraw ${label} · ${sig}`);
          } catch {
            note(`${tag} no ${label} to withdraw`);
          }
        }

        // 4. LP fees on the creator's DAMM v2 position, whose NFT the vault holds
        const damm = (await cpAmm.fetchPoolStatesByTokenAMint(v.baseMint)).find((p) => p.account.tokenBMint.equals(v.quoteMint));
        for (const pos of damm ? await cpAmm.getUserPositionByPool(damm.publicKey, vault) : []) {
          const fee = getUnClaimLpFee(damm!.account, pos.positionState);
          if (fee.feeTokenA.isZero() && fee.feeTokenB.isZero()) continue;
          const sig = await sendAndConfirmTransaction(
            conn,
            new Transaction().add(
              ...ensureAtas,
              claimPositionFeeIx({
                vault, poolAuthority: deriveDammPoolAuthority(), pool: damm!.publicKey, position: pos.position,
                vaultBaseToken: vaultBase, vaultQuoteToken: vaultQuote, tokenAVault: damm!.account.tokenAVault,
                tokenBVault: damm!.account.tokenBVault, baseMint: v.baseMint, quoteMint: v.quoteMint,
                positionNftAccount: pos.positionNftAccount, baseTokenProgram: baseProgram, quoteTokenProgram: quoteProgram,
                beneficiaryQuoteToken: beneficiaryQuote,
              })
            ),
            [keeper]
          );
          note(`${tag} claim_position_fee · ${sig}`);
        }
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
