import type { NextApiRequest, NextApiResponse } from 'next';
import { getVaultView, type VaultView } from '@/server/vault';

const cache = new Map<string, { at: number; value: VaultView }>();
const TTL_MS = 30_000;

/** Live state of a ratchet-vault on devnet. CORS-open. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const address = String(req.query.address ?? '');
  try {
    const hit = cache.get(address);
    const value = hit && Date.now() - hit.at < TTL_MS ? hit.value : await getVaultView(address);
    cache.set(address, { at: Date.now(), value });
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
    res.status(200).json(value);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
}
