/**
 * Build a Ratchet preset's DBC curve offline and print what a launch on it looks like.
 * Usage: DBC_CONFIG_PATH=../presets/devnet/anti-sniper.jsonc pnpm tsx src/ratchet/preview_preset.ts
 */
import { getDbcConfig } from '../helpers/cli';
import { buildPresetCurve } from './preset_curve';
import BN from 'bn.js';
import {
  getMigrationThresholdPrice,
  getPriceFromSqrtPrice,
} from '@meteora-ag/dynamic-bonding-curve-sdk';

const plain = (o: any): any =>
  BN.isBN(o)
    ? o.toString()
    : o && typeof o === 'object'
      ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, plain(v)]))
      : o;
const show = (o: unknown) => JSON.stringify(plain(o));

async function main() {
  const config = await getDbcConfig();
  const dbc = config.dbcConfig as any;
  const curve: any = buildPresetCurve(dbc);
  const baseDec = dbc.token.tokenBaseDecimal;
  const quoteDec = dbc.token.tokenQuoteDecimal;
  const supply = dbc.token.totalTokenSupply;

  const startPrice = getPriceFromSqrtPrice(curve.sqrtStartPrice, baseDec, quoteDec);
  const migrationSqrtPrice = getMigrationThresholdPrice(
    curve.migrationQuoteThreshold,
    curve.sqrtStartPrice,
    curve.curve
  );
  const endPrice = getPriceFromSqrtPrice(migrationSqrtPrice, baseDec, quoteDec);
  const threshold = Number(curve.migrationQuoteThreshold.toString()) / 10 ** quoteDec;

  console.log(`preset: ${process.env.DBC_CONFIG_PATH ?? 'config/dbc_config.jsonc'}`);
  console.log(`raise to graduate (migration quote threshold): ${threshold} quote`);
  console.log(`start price: ${startPrice.toString()}  | start mcap: ${startPrice.mul(supply).toFixed(4)}`);
  console.log(`graduation price: ${endPrice.toString()} | graduation mcap: ${endPrice.mul(supply).toFixed(4)}`);
  console.log(`price change start → graduation: ${endPrice.div(startPrice).sub(1).mul(100).toFixed(2)}%`);
  console.log(`curve points: ${curve.curve.length}`);
  console.log(`base fee: ${show(curve.poolFees.baseFee)}`);
  console.log(`dynamic fee: ${curve.poolFees.dynamicFee ? 'on' : 'off'}`);
  console.log(`pool creation fee (lamports): ${curve.poolCreationFee?.toString()}`);
  console.log(`creator trading fee %: ${curve.creatorTradingFeePercentage}`);
  console.log(`migrated pool fee: ${show(curve.migratedPoolFee)} | compounding bps: ${curve.compoundingFeeBps ?? curve.migratedCompoundingFeeBps ?? 'n/a'}`);
  console.log(`locked vesting: ${show(curve.lockedVesting)}`);
  console.log(`LP split: partner ${curve.partnerLiquidityPercentage}% / creator ${curve.creatorLiquidityPercentage}% / partner locked ${curve.partnerPermanentLockedLiquidityPercentage}% / creator locked ${curve.creatorPermanentLockedLiquidityPercentage}%`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
