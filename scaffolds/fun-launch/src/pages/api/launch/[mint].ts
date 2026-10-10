import type { NextApiRequest, NextApiResponse } from 'next';
import { PublicKey } from '@solana/web3.js';
import { getLaunch } from '@/server/meteora';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  let mint: PublicKey;
  try {
    mint = new PublicKey(req.query.mint as string);
  } catch {
    return res.status(400).json({ error: 'Invalid mint' });
  }
  try {
    const launch = await getLaunch(mint);
    if (!launch) return res.status(404).json({ error: 'Not a Ratchet launch' });
    res.setHeader('Cache-Control', 's-maxage=3, stale-while-revalidate=6');
    res.status(200).json({ launch });
  } catch (error) {
    console.error('getLaunch error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
}
