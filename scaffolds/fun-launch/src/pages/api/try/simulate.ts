import type { NextApiRequest, NextApiResponse } from 'next';
import { PublicKey } from '@solana/web3.js';
import { createRateLimiter, enforceRateLimit } from '@/server/rateLimit';
import { simulateRefusal } from '@/server/try';

const allow = createRateLimiter(30, 60_000);

/** Simulate an ask the vault must refuse (nothing is signed or sent) and return its error. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!enforceRateLimit(allow, req, res)) return;
  try {
    const { user, pool, kind } = req.body ?? {};
    const k = kind === 'over-cap' ? 'over-cap' : 'below-floor';
    res.status(200).json(await simulateRefusal(new PublicKey(user), new PublicKey(pool), k));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
}
