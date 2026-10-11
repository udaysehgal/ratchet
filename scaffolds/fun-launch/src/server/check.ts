/** Chain reads for the launch safety check (logic lives in lib/launchCheck.ts). */
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { assessLaunch, overallStatus, type Check, type CheckStatus } from '@/lib/launchCheck';
import { getPresetByConfig } from '@/presets';
import { QUOTE_TOKENS } from '@/lib/quotes';
import { connection, dbc, getLaunch, getTokenMetas } from './meteora';

export type LaunchCheck = {
  mint: string;
  name: string;
  symbol: string;
  pool: string;
  config: string;
  isRatchet: boolean;
  migrated: boolean;
  overall: CheckStatus;
  checks: Check[];
};

const tokens = (raw: BN, decimals: number) => Number(raw.toString()) / 10 ** decimals;

export async function checkLaunch(mint: PublicKey): Promise<LaunchCheck | null> {
  const pool = await dbc.state.getPoolByBaseMint(mint);
  if (!pool) return null;
  const state = pool.account.poolState;
  const config = await dbc.state.getPoolConfig(state.config);
  const decimals = config.tokenDecimal;
  const isRatchet = getPresetByConfig(state.config.toBase58()) !== null;

  const [mintInfo, metas, ratchet] = await Promise.all([
    connection.getParsedAccountInfo(mint),
    getTokenMetas([mint]),
    isRatchet ? getLaunch(mint).catch((): null => null) : Promise.resolve(null),
  ]);
  const parsed = (mintInfo.value?.data as { parsed?: { info?: Record<string, unknown> } })?.parsed?.info;
  const meta = metas.get(mint.toBase58());

  const fee = config.poolFees.baseFee;
  const cliff = Number(fee.cliffFeeNumerator.toString()) / 1e9;
  const periods = Number(fee.firstFactor);
  const reduction = Number(fee.thirdFactor.toString());
  const endFee =
    fee.baseFeeMode === 1
      ? cliff * Math.pow(1 - reduction / 10_000, periods)
      : fee.baseFeeMode === 0
        ? Math.max(cliff - (periods * reduction) / 1e9, 0)
        : cliff;

  const vest = config.lockedVestingConfig;
  const vestTotal = vest.cliffUnlockAmount.add(vest.amountPerPeriod.mul(vest.numberOfPeriod));

  const checks = assessLaunch({
    lp: {
      partnerLocked: config.partnerPermanentLockedLiquidityPercentage,
      creatorLocked: config.creatorPermanentLockedLiquidityPercentage,
      partnerUnlocked: config.partnerLiquidityPercentage,
      creatorUnlocked: config.creatorLiquidityPercentage,
      partnerVestingPct: config.partnerLiquidityVestingInfo.isInitialized
        ? config.partnerLiquidityVestingInfo.vestingPercentage
        : 0,
      creatorVestingPct: config.creatorLiquidityVestingInfo.isInitialized
        ? config.creatorLiquidityVestingInfo.vestingPercentage
        : 0,
    },
    migrationFeePct: config.migrationFeePercentage,
    creatorMigrationFeePct: config.creatorMigrationFeePercentage,
    tokenUpdateAuthority: config.tokenUpdateAuthority,
    mintAuthority: (parsed?.mintAuthority as string | null) ?? null,
    freezeAuthority: (parsed?.freezeAuthority as string | null) ?? null,
    preMigrationSupply: tokens(config.preMigrationTokenSupply, decimals),
    postMigrationSupply: tokens(config.postMigrationTokenSupply, decimals),
    curveSupply: tokens(config.swapBaseAmount, decimals),
    graduationPoolSupply: tokens(config.migrationBaseThreshold, decimals),
    teamVesting: {
      total: tokens(vestTotal, decimals),
      cliffSeconds: Number(vest.cliffDurationFromMigrationTime.toString()),
      durationSeconds:
        Number(vest.cliffDurationFromMigrationTime.toString()) +
        Number(vest.frequency.toString()) * Number(vest.numberOfPeriod.toString()),
    },
    fees: {
      startPct: cliff * 100,
      endPct: endFee * 100,
      decaySeconds: fee.baseFeeMode === 2 ? 0 : periods * Number(fee.secondFactor.toString()),
      mode: fee.baseFeeMode,
      dynamic: config.poolFees.dynamicFee.initialized === 1,
      creatorSharePct: config.creatorTradingFeePercentage,
    },
    migrationOption: config.migrationOption,
    migratedPoolFeeBps: config.migratedPoolFeeBps,
    compoundingFeeBps: config.migratedCompoundingFeeBps,
    ratchetLadderRungs: ratchet ? ratchet.ladder.length : null,
    migrated: state.isMigrated === 1,
    quoteSymbol:
      QUOTE_TOKENS.find((q) => q.mint === config.quoteMint.toBase58())?.symbol ?? 'quote token',
  });

  return {
    mint: mint.toBase58(),
    name: meta?.name ?? 'Unknown',
    symbol: meta?.symbol ?? '???',
    pool: pool.publicKey.toBase58(),
    config: state.config.toBase58(),
    isRatchet,
    migrated: state.isMigrated === 1,
    overall: overallStatus(checks),
    checks,
  };
}
