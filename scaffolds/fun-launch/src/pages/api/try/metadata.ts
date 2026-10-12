import type { NextApiRequest, NextApiResponse } from 'next';

/** Token metadata for /try launches (devnet test tokens). */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const origin = `${req.headers['x-forwarded-proto'] ?? 'https'}://${req.headers.host}`;
  const name = String(req.query.n ?? 'Ratchet Try').slice(0, 32);
  const symbol = String(req.query.s ?? 'TRY').slice(0, 10);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.status(200).json({
    name,
    symbol,
    description: 'A devnet test launch from www.useratchet.xyz/try: team unlocks held by a ratchet-vault.',
    image: `${origin}/try-token.svg`,
  });
}
