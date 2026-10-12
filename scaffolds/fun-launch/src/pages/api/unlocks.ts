import type { NextApiRequest, NextApiResponse } from 'next';
import { getTeamUnlocks, type TeamUnlock } from '@/server/unlocks';

export type UnlockRadar = {
  generatedAt: string;
  stats: Record<TeamUnlock['verdict'] | 'allocations' | 'claimedTeams', number> & { movedShareOfClaimed: number };
  upcoming: TeamUnlock[];
  held: TeamUnlock[];
  sold: TeamUnlock[];
};

/** Every Meteora DBC team allocation, upcoming unlocks first. CORS-open. */
export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const all = await getTeamUnlocks();
    const now = Math.floor(Date.now() / 1000);
    const count = (v: TeamUnlock['verdict']) => all.filter((u) => u.verdict === v).length;
    const claimed = all.filter((u) => u.claimed > 0);
    const sumClaimed = claimed.reduce((s, u) => s + u.claimed, 0);
    const sumMoved = claimed.reduce((s, u) => s + u.moved, 0);
    const body: UnlockRadar = {
      generatedAt: new Date().toISOString(),
      stats: {
        allocations: all.length,
        claimedTeams: claimed.length,
        sold: count('sold'),
        held: count('held'),
        mixed: count('mixed'),
        unclaimed: count('unclaimed'),
        locked: count('locked'),
        movedShareOfClaimed: sumClaimed > 0 ? sumMoved / sumClaimed : 0,
      },
      upcoming: all
        .filter((u) => u.nextUnlockAt && u.nextUnlockAt > now && u.nextUnlockAt < now + 30 * 86400)
        .sort((a, b) => a.nextUnlockAt! - b.nextUnlockAt!)
        .slice(0, 60),
      held: all.filter((u) => u.verdict === 'held').sort((a, b) => b.claimed / b.total - a.claimed / a.total).slice(0, 25),
      sold: all.filter((u) => u.verdict === 'sold').sort((a, b) => b.moved / b.total - a.moved / a.total).slice(0, 25),
    };
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
    res.status(200).json(body);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
}
