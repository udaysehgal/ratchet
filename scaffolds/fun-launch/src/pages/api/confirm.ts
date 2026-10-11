import type { NextApiRequest, NextApiResponse } from 'next';
import { connection, invalidateCache } from '@/server/meteora';

const TIMEOUT_MS = 45_000;

/** Wait for a wallet-submitted transaction to confirm, then drop cached chain reads. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { signature } = req.body as { signature?: string };
  if (!signature || !/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(signature)) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const { value } = await connection.getSignatureStatuses([signature]);
    const status = value[0];
    if (status?.err) {
      invalidateCache();
      return res.status(200).json({ confirmed: false, error: JSON.stringify(status.err) });
    }
    if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
      invalidateCache();
      return res.status(200).json({ confirmed: true });
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return res.status(200).json({ confirmed: false, error: 'Timed out waiting for confirmation' });
}
