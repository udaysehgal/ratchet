import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import Page from '@/components/ui/Page/Page';
import { formatSol, formatTokens } from '@/lib/format/ratchet';
import type { VaultView } from '@/server/vault';
import { cn } from '@/lib/utils';

const DEMO_VAULT = '2LmfUMgwN3Kt1dmu7MR4KrkJTQBTeMFVhdT4M9jJE6wF';
const devnet = (kind: 'account' | 'tx', id: string) => `https://solscan.io/${kind}/${id}?cluster=devnet`;
const short = (s: string) => `${s.slice(0, 4)}…${s.slice(-4)}`;

/** Attempts the program refused during the devnet run (docs/EVIDENCE.md). */
const REFUSALS = [
  ['Sell order at 1.2× the graduation price', 'BelowFloor'],
  ['Sell order one price step under 1.25×', 'BelowFloor'],
  ['Sell order from a wallet that isn’t the beneficiary', 'NotBeneficiary'],
  ['Lowering the floor from 1.5× back to 1.25×', 'FloorCannotDecrease'],
  ['Sell order at 1.3× after the floor rose to 1.5×', 'BelowFloor'],
];

const RULES = [
  'The vault holds the launch’s creator role, so team vesting and creator fees land here, not in a wallet.',
  'Team tokens leave only as Meteora DLMM sell orders priced at or above the floor.',
  'The floor starts at 1.25× the graduation price, read from the DBC config, and can only rise.',
  'Cancelled orders return unsold tokens to the vault. Only SOL proceeds go to the team.',
];

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 bg-neutral-950 p-4 md:p-5">
      <span className="eyebrow">{label}</span>
      <span className="num text-2xl text-foreground md:text-3xl">{value}</span>
      {sub && <span className="text-xs text-neutral-500">{sub}</span>}
    </div>
  );
}

export default function VaultPage() {
  const router = useRouter();
  const address = typeof router.query.address === 'string' ? router.query.address : DEMO_VAULT;
  const { data: v, isLoading, error } = useQuery(
    ['vault', address],
    async () => {
      const res = await fetch(`/api/vault/${address}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Failed to read vault');
      return body as VaultView;
    },
    { enabled: router.isReady, refetchInterval: 30_000 }
  );

  return (
    <Page>
      <Head>
        <title>Vault - Ratchet</title>
      </Head>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 py-10 md:py-16">
        <header className="flex flex-col gap-4">
          <span className="eyebrow inline-flex items-center gap-2 text-primary">
            <span className="iconify ph--asterisk-bold h-3.5 w-3.5" />
            ratchet-vault · live on Solana devnet
          </span>
          <h1 className="display max-w-4xl text-4xl md:text-6xl">The team can only sell into strength. On-chain.</h1>
          <p className="max-w-2xl text-neutral-400 md:text-lg">
            This vault holds a launch’s team tokens. No wallet can move them; they can only reach the
            market as sell orders above a floor that only rises. Read live from devnet.
          </p>
        </header>

        {isLoading ? (
          <div className="panel h-48 animate-pulse" />
        ) : error || !v ? (
          <p className="text-rose">{error instanceof Error ? error.message : 'Vault not found'}</p>
        ) : (
          <>
            <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-neutral-850 bg-neutral-850 md:grid-cols-4">
              <Stat label="Floor" value={`${v.floorMultiple.toFixed(2)}×`} sub="of the graduation price, only rises" />
              <Stat label="Held by the vault" value={formatTokens(v.tokensInVault)} sub={`${v.symbol}, unspendable`} />
              <Stat label="In sell orders" value={formatTokens(v.tokensInAsks)} sub="resting on Meteora DLMM" />
              <Stat
                label="Team vesting claimed"
                value={formatTokens(v.vestingClaimed)}
                sub={`of ${formatTokens(v.vestingTotal)}, into the vault`}
              />
            </section>

            <section className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
              <div className="panel flex flex-col gap-4 p-5 sm:p-6">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-xl font-semibold">Sell ladder</h2>
                  <span className="text-sm text-neutral-500">every order ≥ {v.floorMultiple.toFixed(2)}× graduation</span>
                </div>
                {v.asks.length === 0 ? (
                  <p className="text-sm text-neutral-500">No open orders right now.</p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {v.asks.map((a) => {
                      const width = Math.min(100, (a.multiple / Math.max(...v.asks.map((x) => x.multiple))) * 100);
                      return (
                        <li key={a.binId} className="flex flex-col gap-1.5">
                          <div className="flex items-baseline justify-between text-sm">
                            <span className="num text-lg text-primary">{a.multiple.toFixed(2)}×</span>
                            <span className="num text-neutral-400">
                              {formatTokens(a.unfilled)} {v.symbol} @ {formatSol(a.price)} SOL
                            </span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-neutral-900">
                            <div className="h-full rounded-full bg-gradient-to-r from-primary-500 to-primary" style={{ width: `${width}%` }} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 border-t border-neutral-900 pt-4 text-xs text-neutral-500">
                  <a className="hover:text-primary" href={devnet('account', v.address)} target="_blank" rel="noreferrer">Vault {short(v.address)} ↗</a>
                  <a className="hover:text-primary" href={devnet('account', v.program)} target="_blank" rel="noreferrer">Program {short(v.program)} ↗</a>
                  <a className="hover:text-primary" href={devnet('account', v.dbcPool)} target="_blank" rel="noreferrer">DBC pool ↗</a>
                  {v.dlmmPair && (
                    <a className="hover:text-primary" href={devnet('account', v.dlmmPair)} target="_blank" rel="noreferrer">DLMM pair ↗</a>
                  )}
                  <span>Graduation price {formatSol(v.graduationPrice)} SOL</span>
                </div>
              </div>

              <div className="panel flex flex-col gap-4 p-5 sm:p-6">
                <h2 className="text-xl font-semibold">What the program refused</h2>
                <ul className="flex flex-col gap-3">
                  {REFUSALS.map(([what, code]) => (
                    <li key={what} className="flex items-start gap-3">
                      <span className="iconify ph--x-circle-fill mt-0.5 h-5 w-5 shrink-0 text-rose" />
                      <div>
                        <div className="text-sm">{what}</div>
                        <code className="num text-xs text-neutral-500">{code}</code>
                      </div>
                    </li>
                  ))}
                </ul>
                <Link href="https://github.com/udaysehgal/ratchet/blob/main/docs/EVIDENCE.md#devnet-the-vault-enforcing-the-ladder-on-chain" className="text-xs text-neutral-500 hover:text-primary">
                  20/20 lifecycle checks on devnet →
                </Link>
              </div>
            </section>

            <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="panel flex flex-col gap-4 p-5 sm:p-6">
                <h2 className="text-xl font-semibold">The rules, enforced by the program</h2>
                <ul className="flex flex-col gap-3">
                  {RULES.map((r) => (
                    <li key={r} className="flex gap-3 text-sm text-neutral-300">
                      <span className="iconify ph--check-circle-fill mt-0.5 h-4 w-4 shrink-0 text-emerald" />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="panel flex flex-col gap-4 p-5 sm:p-6">
                <h2 className="text-xl font-semibold">On-chain history</h2>
                <ol className="flex flex-col">
                  {v.history.map((h, i) => (
                    <li key={h.signature} className={cn('flex gap-3 py-2', i > 0 && 'border-t border-neutral-900')}>
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm">{h.label}</div>
                        <a className="num text-xs text-neutral-500 hover:text-primary" href={devnet('tx', h.signature)} target="_blank" rel="noreferrer">
                          {short(h.signature)} ↗{h.time ? ` · ${new Date(h.time * 1000).toUTCString().slice(5, 22)} UTC` : ''}
                        </a>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </section>
          </>
        )}
      </div>
    </Page>
  );
}
