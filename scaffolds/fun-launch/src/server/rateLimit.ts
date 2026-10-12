/**
 * Fixed-window rate limit per client IP, kept in memory. On serverless each warm instance keeps
 * its own counts, so this is a brake on casual abuse (draining the RPC quota, filling public
 * storage), not a hard guarantee; put a shared store or the platform firewall in front for that.
 */
import type { NextApiRequest, NextApiResponse } from 'next';

type Window = { start: number; count: number };

export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const windows = new Map<string, Window>();
  return function allow(key: string): boolean {
    const t = now();
    const w = windows.get(key);
    if (!w || t - w.start >= windowMs) {
      // Drop expired entries now and then so the map can't grow without bound
      if (windows.size > 10_000) {
        for (const [k, v] of windows) if (t - v.start >= windowMs) windows.delete(k);
      }
      windows.set(key, { start: t, count: 1 });
      return true;
    }
    w.count += 1;
    return w.count <= limit;
  };
}

/** The caller's IP as the platform reports it (first x-forwarded-for hop on Vercel). */
export function clientIp(req: Pick<NextApiRequest, 'headers' | 'socket'>): string {
  const forwarded = req.headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  const real = req.headers['x-real-ip'];
  return first || (Array.isArray(real) ? real[0] : real) || req.socket?.remoteAddress || 'unknown';
}

/** Responds 429 and returns false when the caller is over the limit. */
export function enforceRateLimit(
  allow: (key: string) => boolean,
  req: NextApiRequest,
  res: NextApiResponse
): boolean {
  if (allow(clientIp(req))) return true;
  res.status(429).json({ error: 'Too many requests, please slow down' });
  return false;
}
