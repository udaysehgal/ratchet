import type { NextApiRequest, NextApiResponse } from 'next';
import { PublicKey } from '@solana/web3.js';
import {
  buildClaimFeesTx,
  buildClaimVestingTx,
  buildDammSwapTx,
  buildCreateDlmmPairTx,
  buildLadderTx,
  buildSwapTx,
  getLaunch,
} from '@/server/meteora';

type TxRequest =
  | { action: 'swap'; mint: string; user: string; side: 'buy' | 'sell'; amount: number; slippageBps?: number }
  | { action: 'claim-vesting'; mint: string; user: string }
  | { action: 'claim-fees'; mint: string; user: string }
  | { action: 'create-dlmm-pair'; mint: string; user: string }
  | { action: 'ladder'; mint: string; user: string; rungs: { multiple: number; amount: number }[] };

/** Builds an unsigned Meteora transaction for the connected wallet to sign. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const body = req.body as TxRequest;
  let mint: PublicKey;
  let user: PublicKey;
  try {
    mint = new PublicKey(body.mint);
    user = new PublicKey(body.user);
  } catch {
    return res.status(400).json({ error: 'Invalid mint or user' });
  }

  try {
    switch (body.action) {
      case 'swap': {
        if (body.side !== 'buy' && body.side !== 'sell') throw new Error('Invalid side');
        if (!(body.amount > 0)) throw new Error('Amount must be positive');
        const slippageBps = Math.min(Math.max(body.slippageBps ?? 500, 10), 5000);
        const swap = { baseMint: mint, user, side: body.side, amount: body.amount, slippageBps };
        // Curve until graduation, then the token's DAMM v2 pool
        const launch = await getLaunch(mint);
        if (!launch) throw new Error('Not a Ratchet launch');
        return res
          .status(200)
          .json(launch.migrated ? await buildDammSwapTx(swap) : await buildSwapTx(swap));
      }
      case 'claim-fees':
        return res.status(200).json(await buildClaimFeesTx(mint, user));
      case 'claim-vesting':
        return res.status(200).json(await buildClaimVestingTx(mint, user));
      case 'create-dlmm-pair':
        return res.status(200).json(await buildCreateDlmmPairTx(mint, user));
      case 'ladder':
        if (!Array.isArray(body.rungs)) throw new Error('Missing rungs');
        return res.status(200).json(await buildLadderTx({ baseMint: mint, user, rungs: body.rungs }));
      default:
        return res.status(400).json({ error: 'Unknown action' });
    }
  } catch (error) {
    console.error('tx build error:', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
}
