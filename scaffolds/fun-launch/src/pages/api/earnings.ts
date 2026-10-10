import type { NextApiRequest, NextApiResponse } from 'next';
import { PublicKey } from '@solana/web3.js';
import { getEarnings } from '@/server/meteora';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  let user: PublicKey;
  try {
    user = new PublicKey(req.query.user as string);
  } catch {
    return res.status(400).json({ error: 'Invalid user' });
  }
  try {
    res.status(200).json({ earnings: await getEarnings(user) });
  } catch (error) {
    console.error('getEarnings error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
}
