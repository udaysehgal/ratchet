import type { NextApiRequest, NextApiResponse } from 'next';
import { PublicKey } from '@solana/web3.js';
import { checkLaunch } from '@/server/check';
import type { CheckStatus } from '@/lib/launchCheck';

const STYLE: Record<CheckStatus | 'unknown' | 'unavailable', { text: string; color: string }> = {
  pass: { text: 'no red flags', color: '#2ea44f' },
  warn: { text: 'cautions', color: '#d29922' },
  fail: { text: 'red flags', color: '#cf222e' },
  info: { text: 'checked', color: '#6e7781' },
  unknown: { text: 'not a DBC token', color: '#6e7781' },
  unavailable: { text: 'unavailable', color: '#6e7781' },
};

// Approximate Verdana 11px widths, as shields.io does, so the badge needs no font metrics
const width = (s: string) => Math.round(s.length * 6.4 + 12);

function badge(label: string, value: string, color: string) {
  const lw = width(label);
  const vw = width(value);
  // The symbol is on-chain and attacker-chosen; it lands in attributes too, so escape quotes
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${lw + vw}" height="20" role="img" aria-label="${esc(label)}: ${esc(value)}">
<title>${esc(label)}: ${esc(value)}</title>
<clipPath id="r"><rect width="${lw + vw}" height="20" rx="3"/></clipPath>
<g clip-path="url(#r)"><rect width="${lw}" height="20" fill="#24292f"/><rect x="${lw}" width="${vw}" height="20" fill="${color}"/></g>
<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
<text x="${lw / 2}" y="14">${esc(label)}</text><text x="${lw + vw / 2}" y="14">${esc(value)}</text></g>
</svg>`;
}

/**
 * Embeddable launch-check badge for any Meteora DBC token:
 *   ![launch check](https://www.useratchet.xyz/api/badge/<mint>)
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  let status: CheckStatus | 'unknown' | 'unavailable' = 'unknown';
  let symbol = '';
  let mint: PublicKey | null = null;
  try {
    mint = new PublicKey(String(req.query.mint).replace(/\.svg$/, ''));
  } catch {
    // not a valid address: "not a DBC token"
  }
  if (mint) {
    try {
      const result = await checkLaunch(mint);
      if (result) {
        status = result.overall;
        symbol = result.symbol;
      }
    } catch {
      status = 'unavailable'; // chain read failed; don't claim it isn't a DBC token
    }
  }
  const s = STYLE[status];
  // Don't let CDNs keep a failed read for long
  res.setHeader('Cache-Control', status === 'unavailable' ? 'no-store' : 's-maxage=300, stale-while-revalidate=3600');
  res.status(200).send(badge(symbol ? `${symbol} launch check` : 'launch check', s.text, s.color));
}
