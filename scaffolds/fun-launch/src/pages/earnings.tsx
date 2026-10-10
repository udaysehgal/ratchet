import Head from 'next/head';
import { useWallet } from '@jup-ag/wallet-adapter';
import Page from '@/components/ui/Page/Page';
import { useEarnings } from '@/hooks/useRatchet';
import { EarningRow, earningTotalSol } from '@/components/Ratchet/EarningRow';
import { formatSol } from '@/lib/format/ratchet';

export default function EarningsPage() {
  const { publicKey } = useWallet();
  const address = publicKey?.toBase58();
  const { data, isLoading, error } = useEarnings(address);
  const total = (data ?? []).reduce((sum, e) => sum + earningTotalSol(e), 0);

  return (
    <Page>
      <Head>
        <title>Earnings - Ratchet</title>
      </Head>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Earnings</h1>
          <p className="text-neutral-400">
            Fees your wallet can claim as a token creator or as the launchpad partner: DBC curve
            trading fees, launch fees, and fees from permanently locked DAMM v2 LP.
          </p>
        </div>
        {!address ? (
          <p className="rounded-lg border border-dashed border-neutral-850 p-6 text-center text-neutral-500">
            Connect your wallet to see what you can claim.
          </p>
        ) : isLoading ? (
          <p className="text-neutral-500">Reading fees from chain…</p>
        ) : error ? (
          <p className="text-rose">{error instanceof Error ? error.message : 'Failed to load'}</p>
        ) : (data ?? []).length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-850 p-6 text-center text-neutral-500">
            This wallet hasn&apos;t created or partnered any Ratchet launches.
          </p>
        ) : (
          <>
            <p className="text-lg">
              Claimable now: <strong>{formatSol(total, 6)} SOL</strong>
            </p>
            {data!.map((e) => (
              <EarningRow key={e.pool} earning={e} />
            ))}
          </>
        )}
      </div>
    </Page>
  );
}
