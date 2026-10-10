import type { NextApiRequest, NextApiResponse } from 'next';
import { listLaunches } from '@/server/meteora';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    res.setHeader('Cache-Control', 's-maxage=5, stale-while-revalidate=10');
    res.status(200).json({ launches: await listLaunches() });
  } catch (error) {
    console.error('listLaunches error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
}
