/** Quote tokens Ratchet presets can raise in. Every preset's DBC config names one of these. */
export type QuoteToken = { mint: string; symbol: string; decimals: number };

export const QUOTE_TOKENS: QuoteToken[] = [
  { mint: 'So11111111111111111111111111111111111111112', symbol: 'SOL', decimals: 9 },
  // xStocks (Backed): Token-2022 with Meteora token badges on DBC and DAMM v2
  { mint: 'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB', symbol: 'TSLAx', decimals: 8 },
  { mint: 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh', symbol: 'NVDAx', decimals: 8 },
  { mint: 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp', symbol: 'AAPLx', decimals: 8 },
  { mint: 'XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN', symbol: 'GOOGLx', decimals: 8 },
  { mint: 'XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W', symbol: 'SPYx', decimals: 8 },
  { mint: 'Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ', symbol: 'QQQx', decimals: 8 },
];

export function quoteToken(mint: string): QuoteToken {
  const token = QUOTE_TOKENS.find((q) => q.mint === mint);
  if (!token) throw new Error(`Unsupported quote token ${mint}`);
  return token;
}

export const isSolQuote = (symbol: string) => symbol === 'SOL';
