import type { NextApiRequest, NextApiResponse } from 'next';
import { getPresetPreviews } from '@/server/meteora';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.status(200).json({ presets: await getPresetPreviews() });
  } catch (error) {
    console.error('presets error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
}
