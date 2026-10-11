import type { NextApiRequest, NextApiResponse } from 'next';
import { NETWORK } from '@/presets';
import { listLaunches } from '@/server/meteora';

/**
 * Public graduation feed for trading terminals and bots.
 * GET /api/feed?minProgress=0.8&status=live|graduated|all
 * Every field is read from chain via the Meteora DBC SDK (cached ~10s).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const minProgress = Math.min(Math.max(Number(req.query.minProgress ?? 0) || 0, 0), 1);
  const status = (req.query.status as string) ?? 'all';

  try {
    const launches = (await listLaunches()).filter(
      (l) =>
        l.progress >= minProgress &&
        (status === 'all' || (status === 'live' ? !l.migrated : status === 'graduated' && l.migrated))
    );
    res.setHeader('Cache-Control', 's-maxage=5, stale-while-revalidate=10');
    res.status(200).json({
      network: NETWORK,
      updatedAt: new Date().toISOString(),
      count: launches.length,
      launches: launches.map((l) => ({
        mint: l.baseMint,
        symbol: l.symbol,
        name: l.name,
        metadataUri: l.uri,
        preset: l.presetId,
        dbcPool: l.pool,
        dbcConfig: l.config,
        creator: l.creator,
        quoteMint: l.quoteMint,
        quoteSymbol: l.quoteSymbol,
        raised: l.quoteReserve, // in the quote token
        graduationThreshold: l.threshold,
        progress: l.progress,
        graduated: l.migrated,
      })),
    });
  } catch (error) {
    console.error('feed error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
}
