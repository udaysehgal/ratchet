import type { NextApiRequest, NextApiResponse } from 'next';

/** USD prices for the tokens Ratchet launches can raise in (Jupiter price API), cached 60 s. */
export const RAISE_TOKENS = [
  { symbol: 'SOL', name: 'Solana', mint: 'So11111111111111111111111111111111111111112', icon: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png', label: 'Anti-sniper · Fair · Micro' },
  { symbol: 'TSLAx', name: 'Tesla', mint: 'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB', icon: 'https://xstocks-metadata.backed.fi/logos/tokens/TSLAx.png', label: 'Equity raise' },
  { symbol: 'NVDAx', name: 'NVIDIA', mint: 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh', icon: 'https://xstocks-metadata.backed.fi/logos/tokens/NVDAx.png', label: 'Equity raise' },
  { symbol: 'AAPLx', name: 'Apple', mint: 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp', icon: 'https://xstocks-metadata.backed.fi/logos/tokens/AAPLx.png', label: 'Equity raise' },
  { symbol: 'GOOGLx', name: 'Alphabet', mint: 'XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN', icon: 'https://xstocks-metadata.backed.fi/logos/tokens/GOOGLx.png', label: 'Equity raise' },
];

let cache: { at: number; body: unknown } | null = null;

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  if (!cache || Date.now() - cache.at > 60_000) {
    let prices: Record<string, { usdPrice?: number; priceChange24h?: number }> = {};
    try {
      const r = await fetch(`https://lite-api.jup.ag/price/v3?ids=${RAISE_TOKENS.map((t) => t.mint).join(',')}`);
      if (r.ok) prices = await r.json();
    } catch {
      // show the strip without prices
    }
    cache = {
      at: Date.now(),
      body: RAISE_TOKENS.map((t) => ({ ...t, usd: prices[t.mint]?.usdPrice ?? null, change24h: prices[t.mint]?.priceChange24h ?? null })),
    };
  }
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  res.status(200).json(cache.body);
}
