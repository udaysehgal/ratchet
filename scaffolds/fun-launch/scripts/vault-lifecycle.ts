/**
 * End-to-end test of the ratchet-vault program against Meteora's real programs.
 *
 *   programs/ratchet-vault/scripts/local-validator.sh        # mainnet programs cloned locally
 *   npx tsx scripts/vault-lifecycle.ts <dbc-config> [keypair]  # from scaffolds/fun-launch
 *
 * Launch → adopt (vault becomes creator) → buy to graduation → migrate to DAMM v2 → claim
 * vested tokens into the vault → DLMM pair → asks through the vault (and the ones it must
 * refuse) → raise floor → cancel → collect fees → creator LP fees and surplus.
 */
import fs from 'node:fs';
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import BN from 'bn.js';
import {
  DAMM_V2_MIGRATION_FEE_ADDRESS,
  DynamicBondingCurveClient,
  SwapMode,
  deriveBaseKeyForLocker,
  deriveDbcPoolAddress,
  deriveDbcPoolAuthority,
  deriveEscrow,
} from '@meteora-ag/dynamic-bonding-curve-sdk';
import DLMM, {
  deriveCustomizablePermissionlessLbPair,
  getBinArrayInfoForNonContiguousBinIds,
  getQPriceFromId,
} from '@meteora-ag/dlmm';
import { CpAmm, derivePoolAuthority as deriveDammPoolAuthority } from '@meteora-ag/cp-amm-sdk';
import {
  DLMM_PROGRAM,
  VAULT_PROGRAM_ID,
  adoptLaunchIx,
  cancelAskIx,
  claimPositionFeeIx,
  claimVestedIx,
  collectFeesIx,
  decodeVault,
  findVault,
  placeAskIx,
  raiseFloorIx,
  vaultErrorName,
  withdrawSurplusIx,
} from '../src/lib/vault';

const RPC = process.env.RPC_URL ?? 'http://127.0.0.1:8899';
const CONFIG = new PublicKey(process.argv[2] ?? '');
const keyPath = process.argv[3] ?? '../../programs/ratchet-vault/keys/local-payer.json';
const conn = new Connection(RPC, 'confirmed');
const dbc = new DynamicBondingCurveClient(conn, 'confirmed');
const team = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(keyPath, 'utf8'))));
const results: { step: string; ok: boolean; detail: string }[] = [];

function record(step: string, ok: boolean, detail = '') {
  results.push({ step, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${step}${detail ? `  (${detail})` : ''}`);
}

async function send(ixs: TransactionInstruction[] | Transaction, signers: Keypair[]) {
  const tx = ixs instanceof Transaction ? ixs : new Transaction().add(...ixs);
  return sendAndConfirmTransaction(conn, tx, signers, { commitment: 'confirmed' });
}

/** Expect the vault to refuse with a specific error. */
async function expectRefusal(step: string, error: string, run: () => Promise<unknown>) {
  try {
    await run();
    record(step, false, 'was accepted');
  } catch (e) {
    const got = vaultErrorName(e);
    record(step, got === error, `refused with ${got ?? String(e).slice(0, 120)}`);
  }
}

/**
 * For CPIs whose Meteora program may legitimately refuse (nothing to claim). The run fails if
 * the vault itself refused, or if Meteora refused over signers, accounts or Anchor constraints
 * (the vault built the CPI wrong). Any other Meteora refusal is reported but not counted.
 */
const WIRING_ERRORS =
  /signature|privilege|NotEnoughAccountKeys|Constraint|AccountNotInitialized|AccountDiscriminator|AccountOwnedByWrongProgram|InvalidProgramId|InvalidAccountData|IncorrectProgramId/i;
async function expectSuccessOrMeteoraRefusal(step: string, run: () => Promise<string>) {
  try {
    record(step, true, await run());
  } catch (e) {
    const logs = ((e as { logs?: string[] })?.logs ?? []).join('\n');
    const text = `${String(e)}\n${logs}`;
    // The innermost program to fail is the first "failed" line in the logs
    const failed = logs.match(/Program (\w+) failed/)?.[1];
    if (failed === VAULT_PROGRAM_ID.toBase58()) {
      record(step, false, `vault refused: ${vaultErrorName(e) ?? text.slice(0, 200)}`);
    } else if (!failed || WIRING_ERRORS.test(text)) {
      record(step, false, text.slice(0, 300));
    } else {
      console.log(`INFO  ${step}: ${failed} refused, not counted (${text.slice(0, 200)})`);
    }
  }
}

const balance = async (ata: PublicKey) => {
  const info = await conn.getTokenAccountBalance(ata).catch((): null => null);
  return info ? BigInt(info.value.amount) : BigInt(0);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const isLocal = RPC.includes('127.0.0.1') || RPC.includes('localhost');
  const buyer = Keypair.generate();
  if (isLocal) {
    // DBC's pool authority pays Meteora Lock escrow rent; it holds SOL on mainnet and devnet
    for (const k of [team.publicKey, buyer.publicKey, deriveDbcPoolAuthority()]) {
      await conn.confirmTransaction(await conn.requestAirdrop(k, 50 * LAMPORTS_PER_SOL), 'confirmed');
    }
  } else {
    await send([SystemProgram.transfer({ fromPubkey: team.publicKey, toPubkey: buyer.publicKey, lamports: Number(process.env.BUYER_LAMPORTS ?? 0.3 * LAMPORTS_PER_SOL) })], [team]);
  }

  // 1. Launch on DBC and hand the creator role to the vault in the same transaction
  const config = await dbc.state.getPoolConfig(CONFIG);
  const baseMint = Keypair.generate();
  const pool = deriveDbcPoolAddress(config.quoteMint, baseMint.publicKey, CONFIG);
  const vault = findVault(pool);
  const launchTx = await dbc.creator.createPool({
    config: CONFIG,
    baseMint: baseMint.publicKey,
    name: 'Vaulted Test',
    symbol: 'VLT',
    uri: 'https://ratchet-olive.vercel.app/vault-test.json',
    payer: team.publicKey,
    poolCreator: team.publicKey,
  });
  launchTx.add(adoptLaunchIx({ creator: team.publicKey, pool, config: CONFIG, beneficiary: team.publicKey }));
  const launchSig = await send(launchTx, [team, baseMint]);
  const poolState = (await dbc.state.getPool(pool))!.poolState;
  record('launch + adopt_launch in one tx: DBC pool creator is now the vault', poolState.creator.equals(vault), launchSig);
  const v0 = decodeVault((await conn.getAccountInfo(vault))!.data as Buffer);
  record('vault floor starts at 1.25x graduation price', v0.floorBps === 12_500, `graduation price q64 ${v0.graduationPriceQ64}`);

  // 2. Buy the curve to graduation (PartialFill stops at the threshold)
  const threshold = Number(config.migrationQuoteThreshold.toString());
  await send(
    await dbc.pool.swap2({
      owner: buyer.publicKey,
      pool,
      swapBaseForQuote: false,
      swapMode: SwapMode.PartialFill,
      amountIn: new BN(Math.ceil(threshold * 1.1)),
      minimumAmountOut: new BN(0),
      referralTokenAccount: null,
    }),
    [buyer]
  );
  record('curve filled', (await dbc.state.getPool(pool))!.poolState.quoteReserve.gte(config.migrationQuoteThreshold));

  // 3. Graduate: vesting escrow (recipient = pool creator = vault), then migrate to DAMM v2
  await send(await dbc.migration.createLocker({ payer: team.publicKey, pool }), [team]);
  const escrow = deriveEscrow(deriveBaseKeyForLocker(pool));
  const { transaction: migrateTx, firstPositionNftKeypair, secondPositionNftKeypair } =
    await dbc.migration.migrateToDammV2({ payer: team.publicKey, pool, dammConfig: DAMM_V2_MIGRATION_FEE_ADDRESS[config.migrationFeeOption]! });
  await send(migrateTx, [team, firstPositionNftKeypair, secondPositionNftKeypair]);
  record('graduated to DAMM v2', (await dbc.state.getPool(pool))!.poolState.isMigrated === 1);

  // 4. Vested team tokens land in the vault, never the team wallet
  const vaultBase = getAssociatedTokenAddressSync(baseMint.publicKey, vault, true, TOKEN_PROGRAM_ID);
  const vaultQuote = getAssociatedTokenAddressSync(NATIVE_MINT, vault, true);
  const teamBase = getAssociatedTokenAddressSync(baseMint.publicKey, team.publicKey);
  const teamQuote = getAssociatedTokenAddressSync(NATIVE_MINT, team.publicKey);
  await send(
    [
      createAssociatedTokenAccountIdempotentInstruction(team.publicKey, vaultBase, vault, baseMint.publicKey),
      createAssociatedTokenAccountIdempotentInstruction(team.publicKey, vaultQuote, vault, NATIVE_MINT),
      createAssociatedTokenAccountIdempotentInstruction(team.publicKey, teamQuote, team.publicKey, NATIVE_MINT),
    ],
    [team]
  );
  const cliff = Number(config.lockedVestingConfig.cliffDurationFromMigrationTime.toString());
  await sleep((cliff + 3) * 1000);
  const escrowToken = getAssociatedTokenAddressSync(baseMint.publicKey, escrow, true);
  await send([claimVestedIx({ vault, escrow, baseMint: baseMint.publicKey, escrowToken, vaultBaseToken: vaultBase, tokenProgram: TOKEN_PROGRAM_ID })], [team]);
  const vaultHeld = await balance(vaultBase);
  record('claim_vested: tokens in the vault', vaultHeld > BigInt(0), `${vaultHeld} raw`);
  record('team wallet received none of them', (await balance(teamBase)) === BigInt(0));

  // 5. DLMM pair at the graduation price. DLMM requires the pair creator to hold some of the
  // token (launch-owner proof); the team wallet holds none by design, so a holder creates it.
  const v1 = decodeVault((await conn.getAccountInfo(vault))!.data as Buffer);
  const gradPrice = Number(v1.graduationPriceQ64) / 2 ** 64; // raw quote per raw base
  const BIN_STEP = 100;
  const activeId = DLMM.getBinIdFromPrice(gradPrice, BIN_STEP, false);
  const pairTx = await DLMM.createCustomizablePermissionlessLbPair2(
    conn, new BN(BIN_STEP), baseMint.publicKey, NATIVE_MINT, new BN(activeId), new BN(100), 1, false,
    buyer.publicKey, undefined, false, undefined, undefined, { cluster: 'mainnet-beta', programId: DLMM_PROGRAM }
  );
  await send(pairTx, [buyer]);
  const lbPair = deriveCustomizablePermissionlessLbPair(baseMint.publicKey, NATIVE_MINT, DLMM_PROGRAM)[0];
  const dlmm = await DLMM.create(conn, lbPair, { cluster: 'mainnet-beta', programId: DLMM_PROGRAM });
  record('DLMM pair created', true, lbPair.toBase58());

  const binFor = (multiple: number) => DLMM.getBinIdFromPrice(gradPrice * multiple, BIN_STEP, false);
  const atOrAbove = (multiple: number) => {
    let id = binFor(multiple);
    while (Number(getQPriceFromId(new BN(id), new BN(BIN_STEP)).toString()) / 2 ** 64 < gradPrice * multiple) id++;
    return id;
  };

  const ask = async (nonce: number, bins: { id: number; amount: bigint }[], signer = team) => {
    const { binArrayAccountMetas, binArrayIndexes } = getBinArrayInfoForNonContiguousBinIds(bins.map((b) => b.id), DLMM_PROGRAM, lbPair);
    const init = await dlmm.initializeBinArrays(binArrayIndexes, signer.publicKey);
    if (init.length) await send(init, [signer]).catch((): undefined => undefined); // already initialised is fine
    return send(
      [
        placeAskIx({
          beneficiary: signer.publicKey, vault, nonce, lbPair, bitmapExtension: null,
          reserveX: dlmm.lbPair.reserveX, baseMint: baseMint.publicKey, vaultBaseToken: vaultBase,
          tokenProgram: TOKEN_PROGRAM_ID, bins, hookSlices: [[0, 0]],
          binArrays: binArrayAccountMetas.map((m) => m.pubkey),
        }),
      ],
      [signer]
    );
  };

  // 6. The ratchet: asks at or above the floor only, at most 10% of the vault per day
  const half = vaultHeld / BigInt(20);
  const bins = [
    { id: atOrAbove(1.25), amount: half },
    { id: atOrAbove(2), amount: half },
  ];
  await ask(0, bins);
  record('place_ask at 1.25x and 2x graduation price', (await balance(vaultBase)) === vaultHeld - BigInt(2) * half, `bins ${bins.map((b) => b.id).join(', ')}`);

  await expectRefusal('place_ask at 1.2x is refused', 'BelowFloor', () => ask(1, [{ id: binFor(1.2), amount: BigInt(1000) }]));
  await expectRefusal('place_ask one bin below 1.25x is refused', 'BelowFloor', () => ask(1, [{ id: atOrAbove(1.25) - 1, amount: BigInt(1000) }]));
  await expectRefusal('place_ask by a non-beneficiary is refused', 'NotBeneficiary', () => ask(1, [{ id: atOrAbove(2), amount: BigInt(1000) }], buyer));
  await expectRefusal('place_ask over the daily cap is refused', 'DailyCapExceeded', () => ask(1, [{ id: atOrAbove(2), amount: BigInt(1000) }]));

  // 7. Floor only rises
  await send([raiseFloorIx({ beneficiary: team.publicKey, vault, floorBps: 15_000 })], [team]);
  record('raise_floor to 1.5x', decodeVault((await conn.getAccountInfo(vault))!.data as Buffer).floorBps === 15_000);
  await expectRefusal('lowering the floor is refused', 'FloorCannotDecrease', () =>
    send([raiseFloorIx({ beneficiary: team.publicKey, vault, floorBps: 12_500 })], [team])
  );
  await expectRefusal('place_ask at 1.3x after the raise is refused', 'BelowFloor', () => ask(1, [{ id: atOrAbove(1.3), amount: BigInt(1000) }]));

  // 8. A buyer lifts the 1.25x ask on DLMM: the team sold into strength
  let filled = false;
  try {
    await dlmm.refetchStates();
    const binArraysForSwap = await dlmm.getBinArrayForSwap(false);
    const inAmount = new BN(Math.floor(gradPrice * 1.3 * Number(half) / 2)); // enough quote to buy ~half the 1.25x rung
    const quote = dlmm.swapQuote(inAmount, false, new BN(5000), binArraysForSwap);
    const swapTx = await dlmm.swap({
      inToken: NATIVE_MINT, outToken: baseMint.publicKey, inAmount, minOutAmount: new BN(0),
      lbPair, user: buyer.publicKey, binArraysPubkey: quote.binArraysPubkey,
    });
    await send(swapTx, [buyer]);
    filled = true;
    record('a buyer lifts the vault ask on DLMM', true, `paid ${inAmount.toString()} lamports at >= 1.25x`);
  } catch (e) {
    record('a buyer lifts the vault ask on DLMM', false, String(e).slice(0, 160));
  }

  // 9. Cancel: unfilled tokens go back to the vault, proceeds to the team, nothing else moves
  const before = await balance(vaultBase);
  const teamQuoteBeforeCancel = await balance(teamQuote);
  const { binArrayAccountMetas } = getBinArrayInfoForNonContiguousBinIds(bins.map((b) => b.id), DLMM_PROGRAM, lbPair);
  await send(
    [
      cancelAskIx({
        beneficiary: team.publicKey, vault, nonce: 0, lbPair, bitmapExtension: null,
        reserveX: dlmm.lbPair.reserveX, reserveY: dlmm.lbPair.reserveY, baseMint: baseMint.publicKey, quoteMint: NATIVE_MINT,
        vaultBaseToken: vaultBase, vaultQuoteToken: vaultQuote, baseTokenProgram: TOKEN_PROGRAM_ID, quoteTokenProgram: TOKEN_PROGRAM_ID,
        beneficiaryQuoteToken: teamQuote, bins: bins.map((b) => b.id), close: true, hookSlices: [[0, 0], [1, 0]],
        binArrays: binArrayAccountMetas.map((m) => m.pubkey),
      }),
    ],
    [team]
  );
  const after = await balance(vaultBase);
  const proceeds = (await balance(teamQuote)) - teamQuoteBeforeCancel;
  if (filled) {
    record('cancel_ask: unfilled tokens back to the vault, sold tokens gone', after > before && after < before + BigInt(2) * half, `${before} → ${after}`);
    record('cancel_ask: sale proceeds forwarded to the team in SOL', proceeds > BigInt(0), `+${proceeds} lamports (wSOL)`);
  } else {
    record('cancel_ask returns unfilled tokens to the vault', after === before + BigInt(2) * half, `${before} → ${after}`);
  }
  record('team wallet still holds no team tokens', (await balance(teamBase)) === BigInt(0));

  // 10. Fees: quote to the team, base stays in the vault
  const quoteBefore = await balance(teamQuote);
  await send(
    [
      collectFeesIx({
        vault, pool, poolAuthority: deriveDbcPoolAuthority(), vaultBaseToken: vaultBase, vaultQuoteToken: vaultQuote,
        baseVault: poolState.baseVault, quoteVault: poolState.quoteVault, baseMint: baseMint.publicKey, quoteMint: NATIVE_MINT,
        baseTokenProgram: TOKEN_PROGRAM_ID, quoteTokenProgram: TOKEN_PROGRAM_ID, beneficiaryQuoteToken: teamQuote,
      }),
    ],
    [team]
  );
  const quoteAfter = await balance(teamQuote);
  record('collect_fees: creator curve fees forwarded to the team in SOL', quoteAfter > quoteBefore, `+${quoteAfter - quoteBefore} lamports (wSOL)`);

  // 11. The creator's DAMM v2 LP position: its NFT went to the pool creator, the vault
  const cpAmm = new CpAmm(conn);
  const damm = (await cpAmm.fetchPoolStatesByTokenAMint(baseMint.publicKey)).find((p) => p.account.tokenBMint.equals(NATIVE_MINT));
  const vaultPositions = damm ? await cpAmm.getUserPositionByPool(damm.publicKey, vault) : [];
  record('the vault holds the creator DAMM v2 position', vaultPositions.length > 0, `${vaultPositions.length} position(s)`);
  for (const pos of vaultPositions) {
    await expectSuccessOrMeteoraRefusal('claim_position_fee: the vault signs for its LP position', () =>
      send(
        [
          claimPositionFeeIx({
            vault, poolAuthority: deriveDammPoolAuthority(), pool: damm!.publicKey, position: pos.position,
            vaultBaseToken: vaultBase, vaultQuoteToken: vaultQuote, tokenAVault: damm!.account.tokenAVault,
            tokenBVault: damm!.account.tokenBVault, baseMint: baseMint.publicKey, quoteMint: NATIVE_MINT,
            positionNftAccount: pos.positionNftAccount, baseTokenProgram: TOKEN_PROGRAM_ID, quoteTokenProgram: TOKEN_PROGRAM_ID,
            beneficiaryQuoteToken: teamQuote,
          }),
        ],
        [team]
      )
    );
  }
  record('vault quote account is empty after the claims (everything forwarded)', (await balance(vaultQuote)) === BigInt(0));

  // 12. The creator's curve surplus, if the final buy overshot the threshold
  await expectSuccessOrMeteoraRefusal('withdraw_surplus: the vault signs as creator, SOL to the team', () =>
    send(
      [
        withdrawSurplusIx({
          vault, poolAuthority: deriveDbcPoolAuthority(), config: CONFIG, pool, vaultQuoteToken: vaultQuote,
          quoteVault: poolState.quoteVault, quoteMint: NATIVE_MINT, quoteTokenProgram: TOKEN_PROGRAM_ID,
          beneficiaryQuoteToken: teamQuote,
        }),
      ],
      [team]
    )
  );

  // Cross-check the program's price math against DLMM's own bin prices
  const floor125 = gradPrice * 1.25;
  const id = atOrAbove(1.25);
  const dlmmPrice = Number(getQPriceFromId(new BN(id), new BN(BIN_STEP)).toString()) / 2 ** 64;
  record("first accepted bin matches DLMM's own price ≥ 1.25x", dlmmPrice >= floor125 && dlmmPrice < floor125 * 1.011, `${(dlmmPrice / gradPrice).toFixed(4)}x`);

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  fs.writeFileSync(
    process.env.RESULTS_PATH ?? '/tmp/vault-lifecycle.json',
    JSON.stringify({ rpc: RPC, pool: pool.toBase58(), vault: vault.toBase58(), baseMint: baseMint.publicKey.toBase58(), lbPair: lbPair.toBase58(), results }, null, 2)
  );
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  if (e?.logs) console.error(e.logs.join('\n'));
  process.exit(1);
});
