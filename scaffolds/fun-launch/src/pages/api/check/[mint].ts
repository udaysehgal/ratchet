import type { NextApiRequest, NextApiResponse } from 'next';
import { PublicKey } from '@solana/web3.js';
import { checkLaunch } from '@/server/check';

/** Safety check for any Meteora DBC token (not only Ratchet launches). CORS-open for tools and bots. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  let mint: PublicKey;
  try {
    mint = new PublicKey(req.query.mint as string);
  } catch {
    return res.status(400).json({ error: 'Not a valid token address' });
  }
  try {
    const result = await checkLaunch(mint);
    if (!result) return res.status(404).json({ error: 'No Meteora DBC pool found for this token' });
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    res.status(200).json(result);
  } catch (error) {
    console.error('check error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
}
