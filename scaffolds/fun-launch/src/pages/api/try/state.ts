import type { NextApiRequest, NextApiResponse } from 'next';
import { PublicKey } from '@solana/web3.js';
import { getTryState } from '@/server/try';
import { devnet } from '@/server/devnet';

/** Progress of a /try launch on devnet, plus the visitor's devnet SOL balance. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = req.query.user ? new PublicKey(String(req.query.user)) : null;
    const sol = user ? (await devnet.getBalance(user)) / 1e9 : null;
    const state = req.query.pool ? await getTryState(new PublicKey(String(req.query.pool)), user) : null;
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ sol, state });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
}
