/** Small number formatting for SOL prices and token amounts. */
export function formatSol(value: number, digits = 4): string {
  if (value === 0) return '0';
  if (Math.abs(value) < 0.0001) return value.toExponential(2);
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function formatTokens(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(value >= 0.995 ? 0 : 1)}%`;
}

export function explorerUrl(address: string, kind: 'address' | 'tx' = 'address'): string {
  const cluster = process.env.NEXT_PUBLIC_NETWORK === 'mainnet' ? '' : '?cluster=devnet';
  return `https://solscan.io/${kind === 'tx' ? 'tx' : 'account'}/${address}${cluster}`;
}
