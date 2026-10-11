import { useCallback, useState } from 'react';
import { Keypair, Transaction } from '@solana/web3.js';
import { useWallet } from '@jup-ag/wallet-adapter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { signSubmitConfirm } from '@/lib/walletTx';
import type { Earning, LaunchDetail, LaunchSummary } from '@/server/meteora';

export type { Earning, LaunchDetail, LaunchSummary, LadderRung } from '@/server/meteora';

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `Request failed: ${res.status}`);
  return body as T;
}

export function useLaunches() {
  return useQuery(['launches'], () => getJson<{ launches: LaunchSummary[] }>('/api/launches'), {
    select: (d) => d.launches,
    refetchInterval: 10_000,
  });
}

export function useLaunch(mint: string | undefined) {
  return useQuery(
    ['launch', mint],
    () => getJson<{ launch: LaunchDetail }>(`/api/launch/${mint}`),
    { enabled: !!mint, select: (d) => d.launch, refetchInterval: 8_000 }
  );
}

export function useEarnings(user: string | undefined) {
  return useQuery(
    ['earnings', user],
    () => getJson<{ earnings: Earning[] }>(`/api/earnings?user=${user}`),
    { enabled: !!user, select: (d) => d.earnings, refetchInterval: 30_000 }
  );
}

type TxAction =
  | { action: 'swap'; side: 'buy' | 'sell'; amount: number; slippageBps?: number }
  | { action: 'claim-vesting' }
  | { action: 'claim-fees' }
  | { action: 'graduate' }
  | { action: 'create-dlmm-pair' }
  | { action: 'ladder'; rungs: { multiple: number; amount: number }[] };

/** Build a Meteora tx server-side, sign it with the connected wallet, send it. */
export function useRatchetTx(mint: string | undefined) {
  const { publicKey, signTransaction } = useWallet();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);

  const run = useCallback(
    async (request: TxAction) => {
      if (!publicKey || !signTransaction) {
        toast.error('Connect your wallet first');
        return null;
      }
      if (!mint) return null;
      setPending(request.action);
      try {
        const { tx, description, coSigners } = await getJson<{
          tx: string;
          description: string;
          coSigners?: string[];
        }>('/api/tx', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...request, mint, user: publicKey.toBase58() }),
        });
        // Fresh blockhash, throwaway co-signers, wallet signs; submitted through our RPC proxy
        const signature = await signSubmitConfirm(
          Transaction.from(Buffer.from(tx, 'base64')),
          signTransaction,
          (coSigners ?? []).map((k) => Keypair.fromSecretKey(Buffer.from(k, 'base64')))
        );
        toast.success(`Done: ${description}`);
        await queryClient.invalidateQueries(['launch', mint]);
        await queryClient.invalidateQueries(['launches']);
        await queryClient.invalidateQueries(['earnings']);
        return signature;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Transaction failed');
        return null;
      } finally {
        setPending(null);
      }
    },
    [mint, publicKey, signTransaction, queryClient]
  );

  return { run, pending };
}
