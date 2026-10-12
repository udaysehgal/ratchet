import type { NextApiRequest, NextApiResponse } from 'next';
import { createRateLimiter, enforceRateLimit } from '@/server/rateLimit';

const RPC_URL = process.env.RPC_URL as string;

/**
 * Browser → server RPC proxy for the wallet flow. Public RPCs reject browser requests (403),
 * and this keeps the server's RPC key private. Only the methods the wallet adapter needs.
 */
const ALLOWED_METHODS = new Set([
  'getLatestBlockhash',
  'isBlockhashValid',
  'getBlockHeight',
  'getSlot',
  'getEpochInfo',
  'getSignatureStatuses',
  'sendTransaction',
  'simulateTransaction',
  'getFeeForMessage',
]);

// A wallet flow needs a handful of calls per transaction; this leaves headroom without letting
// anyone run their own traffic through our paid RPC key
const allow = createRateLimiter(60, 60_000);

type RpcRequest = { jsonrpc: string; id: unknown; method: string; params?: unknown };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!enforceRateLimit(allow, req, res)) return;
  const body = req.body as RpcRequest | RpcRequest[];
  const calls = Array.isArray(body) ? body : [body];
  if (calls.length === 0 || calls.length > 5 || calls.some((c) => !ALLOWED_METHODS.has(c?.method))) {
    return res.status(403).json({ error: 'RPC method not allowed' });
  }
  try {
    const upstream = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    res.status(upstream.status).setHeader('Content-Type', 'application/json');
    res.send(await upstream.text());
  } catch (error) {
    console.error('rpc proxy error:', error);
    res.status(502).json({ error: 'Upstream RPC unavailable' });
  }
}
