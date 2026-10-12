import type { NextApiRequest, NextApiResponse } from 'next';
import { PublicKey } from '@solana/web3.js';
import { createRateLimiter, enforceRateLimit } from '@/server/rateLimit';
import { buildAsk, buildBuy, buildClaimVested, buildCreatePair, buildGraduate, buildLaunch } from '@/server/try';

const allow = createRateLimiter(40, 60_000);
const clean = (s: unknown, max: number) => String(s ?? '').replace(/[^\p{L}\p{N} $._-]/gu, '').trim().slice(0, max);

/** Builds one /try step as an unsigned devnet transaction for the visitor's wallet. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!enforceRateLimit(allow, req, res)) return;
  const { action, user, pool, name, symbol } = req.body ?? {};
  try {
    const u = new PublicKey(user);
    const p = pool ? new PublicKey(pool) : null;
    const need = () => {
      if (!p) throw new Error('Missing pool');
      return p;
    };
    switch (action) {
      case 'launch': {
        const n = clean(name, 32) || 'Ratchet Try';
        const s = (clean(symbol, 10) || 'TRY').toUpperCase();
        const origin = `${req.headers['x-forwarded-proto'] ?? 'https'}://${req.headers.host}`;
        const uri = `${origin}/api/try/metadata?n=${encodeURIComponent(n)}&s=${encodeURIComponent(s)}`;
        return res.status(200).json(await buildLaunch(u, n, s, uri));
      }
      case 'buy':
        return res.status(200).json(await buildBuy(u, need()));
      case 'graduate':
        return res.status(200).json(await buildGraduate(u, need()));
      case 'claim-vested':
        return res.status(200).json(await buildClaimVested(u, need()));
      case 'create-pair':
        return res.status(200).json(await buildCreatePair(u, need()));
      case 'ask':
        return res.status(200).json(await buildAsk(u, need()));
      default:
        return res.status(400).json({ error: 'Unknown action' });
    }
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
}
