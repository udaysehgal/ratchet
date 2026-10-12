import type { NextApiRequest, NextApiResponse } from 'next';
import type { Connection } from '@solana/web3.js';
import { connection, invalidateCache } from '@/server/meteora';

// Stay well under the serverless time limit; the client polls until confirmed or expired
const CHECK_WINDOW_MS = 8_000;

export type ConfirmResponse = { status: 'confirmed' | 'failed' | 'pending'; error?: string };

/** Check a wallet-submitted transaction; on a final result, drop cached chain reads. */
export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<ConfirmResponse | { error: string }>
) {
  return confirmWith(connection, invalidateCache)(req, res);
}

export function confirmWith(conn: Connection, onFinal: () => void = () => undefined) {
  return async (req: NextApiRequest, res: NextApiResponse<ConfirmResponse | { error: string }>) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { signature } = req.body as { signature?: string };
    if (!signature || !/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(signature)) {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const deadline = Date.now() + CHECK_WINDOW_MS;
    try {
      while (Date.now() < deadline) {
        const { value } = await conn.getSignatureStatuses([signature]);
        const status = value[0];
        if (status?.err) {
          onFinal();
          return res.status(200).json({ status: 'failed', error: JSON.stringify(status.err) });
        }
        if (
          status?.confirmationStatus === 'confirmed' ||
          status?.confirmationStatus === 'finalized'
        ) {
          onFinal();
          return res.status(200).json({ status: 'confirmed' });
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
    } catch (error) {
      // RPC hiccup (e.g. rate limit): report pending so the client keeps polling
      console.error('confirm error:', error);
    }
    return res.status(200).json({ status: 'pending' });
  };
}
