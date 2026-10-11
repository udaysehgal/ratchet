/** Quote tokens Ratchet presets can raise in. Every preset's DBC config names one of these. */
export type QuoteToken = { mint: string; symbol: string; decimals: number };

export const QUOTE_TOKENS: QuoteToken[] = [
  { mint: 'So11111111111111111111111111111111111111112', symbol: 'SOL', decimals: 9 },
  // Tesla xStock (Backed): Token-2022 with Meteora token badges on DBC and DAMM v2
  { mint: 'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB', symbol: 'TSLAx', decimals: 8 },
];

export function quoteToken(mint: string): QuoteToken {
  const token = QUOTE_TOKENS.find((q) => q.mint === mint);
  if (!token) throw new Error(`Unsupported quote token ${mint}`);
  return token;
}

export const isSolQuote = (symbol: string) => symbol === 'SOL';
