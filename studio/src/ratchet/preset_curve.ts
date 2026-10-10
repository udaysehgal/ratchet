import {
  buildCurve,
  buildCurveWithCustomSqrtPrices,
  buildCurveWithMarketCap,
  getSqrtPriceFromPrice,
} from '@meteora-ag/dynamic-bonding-curve-sdk';

/** Same buildCurveMode mapping as studio's createDbcConfig, for the modes Ratchet presets use. */
export function buildPresetCurve(dbcConfig: any) {
  const { buildCurveMode, leftoverReceiver, feeClaimer, transferHookProgram, ...params } =
    dbcConfig;
  if (buildCurveMode === 0) return buildCurve(params);
  if (buildCurveMode === 1) return buildCurveWithMarketCap(params);
  if (buildCurveMode === 5) {
    const { prices, ...rest } = params;
    const sqrtPrices = prices.map((p: number) =>
      getSqrtPriceFromPrice(String(p), rest.token.tokenBaseDecimal, rest.token.tokenQuoteDecimal)
    );
    return buildCurveWithCustomSqrtPrices({ ...rest, sqrtPrices });
  }
  throw new Error(`Ratchet presets support buildCurveMode 0, 1, 5 (got ${buildCurveMode})`);
}
