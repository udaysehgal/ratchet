import Head from 'next/head';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import Page from '@/components/ui/Page/Page';
import type { UnlockRadar } from './api/unlocks';
import type { TeamUnlock } from '@/server/unlocks';
import { cn } from '@/lib/utils';

const VERDICT: Record<TeamUnlock['verdict'], { label: string; className: string }> = {
  sold: { label: 'Sold past unlocks', className: 'bg-rose/15 text-rose' },
  mixed: { label: 'Sold some', className: 'bg-amber/15 text-amber' },
  held: { label: 'Kept past unlocks', className: 'bg-emerald/15 text-emerald' },
  unclaimed: { label: 'Never claimed', className: 'bg-neutral-850 text-neutral-400' },
  locked: { label: 'First unlock', className: 'bg-neutral-850 text-neutral-400' },
};

function when(ts: number) {
  const s = ts - Date.now() / 1000;
  if (s < 3600) return `in ${Math.max(1, Math.round(s / 60))} min`;
  if (s < 86400) return `in ${Math.round(s / 3600)} h`;
  return `in ${Math.round(s / 86400)} d`;
}

const pct = (x: number) => `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;

function Row({ u, right }: { u: TeamUnlock; right: React.ReactNode }) {
  const v = VERDICT[u.verdict];
  return (
    <li className="flex items-center gap-3 border-t border-neutral-900 py-3 first:border-t-0">
      <div className="min-w-0 flex-1">
        <Link href={`/check?mint=${u.mint}`} className="font-medium hover:text-primary">
          {u.symbol !== '???' ? u.symbol : `${u.mint.slice(0, 4)}…${u.mint.slice(-4)}`}
        </Link>{' '}
        {u.symbol !== '???' && <span className="truncate text-sm text-neutral-500">{u.name}</span>}
        <div className="mt-1">
          <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', v.className)}>{v.label}</span>
          {u.movedShare !== null && u.verdict !== 'held' && (
            <span className="num ml-2 text-xs text-neutral-500">moved {pct(u.movedShare)} of claimed</span>
          )}
        </div>
      </div>
      <div className="num text-right text-sm text-neutral-300">{right}</div>
    </li>
  );
}

export default function UnlocksPage() {
  const { data, isLoading, error } = useQuery(['unlock-radar'], async () => {
    const res = await fetch('/api/unlocks');
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? 'Failed to load');
    return body as UnlockRadar;
  });

  return (
    <Page>
      <Head>
        <title>Unlock radar - Ratchet</title>
      </Head>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 py-10 md:py-16">
        <header className="flex flex-col gap-4">
          <span className="eyebrow inline-flex items-center gap-2 text-primary">
            <span className="iconify ph--asterisk-bold h-3.5 w-3.5" />
            Every Meteora DBC team allocation, live from mainnet
          </span>
          <h1 className="display max-w-4xl text-4xl md:text-6xl">Unlock radar</h1>
          <p className="max-w-2xl text-neutral-400 md:text-lg">
            Every DBC launch with a team allocation, its next unlock, and what the team did with the
            ones before. Most teams sell the moment tokens vest.{' '}
            <a className="text-foreground underline-offset-4 hover:underline" href="https://github.com/udaysehgal/ratchet/blob/main/docs/UNLOCK-STUDY.md">
              Read the study
            </a>
            .
          </p>
        </header>

        {isLoading ? (
          <div className="panel h-40 animate-pulse" />
        ) : error || !data ? (
          <p className="text-rose">{error instanceof Error ? error.message : 'Failed to load'}</p>
        ) : (
          <>
            <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-neutral-850 bg-neutral-850 md:grid-cols-4">
              {[
                ['Team allocations', data.stats.allocations.toLocaleString('en-US'), 'Meteora Lock escrows from DBC'],
                ['Teams that claimed', data.stats.claimedTeams.toLocaleString('en-US'), 'of those that unlocked'],
                ['Claimed tokens moved out', pct(data.stats.movedShareOfClaimed), 'no longer in the team wallet'],
                ['Teams that kept theirs', data.stats.held.toLocaleString('en-US'), `vs ${data.stats.sold.toLocaleString('en-US')} that sold`],
              ].map(([label, value, sub]) => (
                <div key={label} className="flex flex-col gap-1 bg-neutral-950 p-4 md:p-5">
                  <span className="eyebrow">{label}</span>
                  <span className="num text-2xl md:text-3xl">{value}</span>
                  <span className="text-xs text-neutral-500">{sub}</span>
                </div>
              ))}
            </section>

            <section className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
              <div className="panel flex flex-col gap-2 p-5 sm:p-6">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-xl font-semibold">Unlocking in the next 30 days</h2>
                  <span className="text-sm text-neutral-500">{data.upcoming.length} shown</span>
                </div>
                {data.upcoming.length === 0 ? (
                  <p className="text-sm text-neutral-500">No team unlocks in the next 30 days.</p>
                ) : (
                  <ul>
                    {data.upcoming.map((u) => (
                      <Row
                        key={u.escrow}
                        u={u}
                        right={
                          <>
                            <div>{when(u.nextUnlockAt!)}</div>
                            <div className="text-xs text-neutral-500">{pct(u.nextUnlockAmount / u.total)} of allocation</div>
                          </>
                        }
                      />
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex flex-col gap-6">
                <div className="panel flex flex-col gap-2 p-5 sm:p-6">
                  <h2 className="text-xl font-semibold">Teams that kept their unlocks</h2>
                  <p className="text-sm text-neutral-500">Claimed, and still holding over 90% of it.</p>
                  <ul>
                    {data.held.slice(0, 10).map((u) => (
                      <Row key={u.escrow} u={u} right={<div>{pct(u.claimed / u.total)} claimed</div>} />
                    ))}
                  </ul>
                </div>
                <div className="panel panel-glow flex flex-col gap-3 p-5 sm:p-6">
                  <h2 className="text-xl font-semibold">The fix</h2>
                  <p className="text-sm text-neutral-400">
                    A Ratchet vault holds the team allocation itself. Unlocks can only reach the market
                    as sell orders at 1.25× the graduation price or higher, and that floor only rises.
                  </p>
                  <Link href="/vault" className="text-sm font-medium text-primary hover:underline">
                    See the vault live on devnet →
                  </Link>
                </div>
              </div>
            </section>

            <p className="text-xs text-neutral-500">
              Source: every Meteora Lock escrow created by the DBC pool authority, read live. “Moved” means
              claimed tokens no longer in the team wallet (a lower bound on selling). JSON:{' '}
              <code className="num text-neutral-400">GET /api/unlocks</code>
            </p>
          </>
        )}
      </div>
    </Page>
  );
}
