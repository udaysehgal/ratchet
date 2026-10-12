import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { UnlockRadar } from '@/pages/api/unlocks';
import { cn } from '@/lib/utils';

const STUDY_URL = 'https://github.com/udaysehgal/ratchet/blob/main/docs/UNLOCK-STUDY.md';

/** Sample of 40 teams that emptied their unlocks: how the tokens left (docs/evidence/unlock-study-sample.json). */
const SAMPLE = { sampled: 40, viaDex: 29, intoDamm: 17, classified: 33 };

export function useUnlockRadar() {
  return useQuery(['unlock-radar'], async () => {
    const res = await fetch('/api/unlocks');
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? 'Failed to load');
    return body as UnlockRadar;
  }, { staleTime: 10 * 60_000 });
}

/** The case for Ratchet, from live mainnet data: what DBC teams do when their tokens unlock. */
export function ProblemSection() {
  const { data } = useUnlockRadar();
  const s = data?.stats;
  const unlocked = s ? s.allocations - s.locked : null;
  const claimedShareSold = s && s.claimedTeams ? s.sold / s.claimedTeams : null;

  const bars = s
    ? [
        { label: 'Claimed, then moved 90%+ out of the team wallet', n: s.sold, highlight: true },
        { label: 'Unlocked, not claimed yet', n: s.unclaimed },
        { label: 'Claimed and kept 90%+', n: s.held },
        { label: 'Claimed, moved part of it', n: s.mixed },
      ]
    : [];
  const max = Math.max(1, ...bars.map((b) => b.n));

  return (
    <section className="flex flex-col gap-10">
      <div className="flex max-w-3xl flex-col gap-4">
        <span className="eyebrow inline-flex items-center gap-2 text-primary">
          <span className="iconify ph--asterisk-bold h-3.5 w-3.5" />
          The problem, measured on mainnet
        </span>
        <h2 className="display text-4xl md:text-5xl">Most teams sell the moment their tokens unlock</h2>
        <p className="text-neutral-400 md:text-lg">
          Team vesting on Meteora DBC delays the dump; it doesn’t stop it. We read every team
          allocation on mainnet and followed what happened when it vested.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-neutral-850 bg-neutral-850 md:grid-cols-3">
        {[
          {
            value: s ? `${Math.round(s.movedShareOfClaimed * 100)}%` : '—',
            label: 'of all claimed team tokens have left team wallets',
          },
          {
            value: claimedShareSold !== null ? `${Math.round(claimedShareSold * 100)}%` : '—',
            label: `of teams that claimed moved 90%+ of it out (${s ? s.sold.toLocaleString('en-US') : '—'} of ${s ? s.claimedTeams.toLocaleString('en-US') : '—'})`,
          },
          {
            value: `${Math.round((SAMPLE.viaDex / SAMPLE.classified) * 100)}%`,
            label: `of the moves we traced were DEX sells, ${SAMPLE.intoDamm} of ${SAMPLE.viaDex} straight into the DAMM v2 pool holders trade in`,
          },
        ].map((stat) => (
          <div key={stat.label} className="flex flex-col gap-2 bg-neutral-950 p-5 md:p-6">
            <span className="num text-4xl text-primary md:text-5xl">{stat.value}</span>
            <span className="text-sm text-neutral-400">{stat.label}</span>
          </div>
        ))}
      </div>

      <div className="panel flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-lg font-medium">
            What happened to {unlocked !== null ? unlocked.toLocaleString('en-US') : 'every'} unlocked team allocations
          </h3>
          <span className="text-xs text-neutral-500">Meteora Lock escrows created by DBC · live</span>
        </div>
        {!s ? (
          <div className="flex flex-col gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-6 animate-pulse rounded bg-neutral-900" />
            ))}
          </div>
        ) : (
          <ul className="flex flex-col gap-4" aria-label="Outcomes of unlocked team allocations">
            {bars.map((b) => (
              <li key={b.label} className="grid grid-cols-1 gap-1.5 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)] md:items-center md:gap-4">
                <span className={cn('text-sm', b.highlight ? 'font-medium text-foreground' : 'text-neutral-400')}>{b.label}</span>
                <div className="flex items-center gap-3">
                  <div className="h-5 flex-1 overflow-hidden rounded bg-neutral-900">
                    <div
                      className={cn('h-full rounded', b.highlight ? 'bg-primary' : 'bg-neutral-700')}
                      style={{ width: `${Math.max(1, (b.n / max) * 100)}%` }}
                    />
                  </div>
                  <span className="num w-28 shrink-0 text-right text-sm text-foreground">
                    {b.n.toLocaleString('en-US')} · {unlocked ? Math.round((b.n / unlocked) * 100) : 0}%
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-col gap-3 border-t border-neutral-900 pt-5 md:flex-row md:items-center md:justify-between">
          <p className="max-w-2xl text-sm text-neutral-400">
            <span className="text-foreground">Ratchet’s answer:</span> a vault holds the team allocation,
            so unlocks can only reach the market as sell orders at 1.25× the graduation price or higher.
          </p>
          <div className="flex shrink-0 flex-wrap gap-5 text-sm font-medium">
            <Link href="/unlocks" className="inline-flex items-center gap-1 hover:text-primary">
              Unlock radar <span className="iconify ph--caret-right-bold h-4 w-4" />
            </Link>
            <Link href="/try" className="inline-flex items-center gap-1 text-primary hover:underline">
              Try the vault on devnet <span className="iconify ph--caret-right-bold h-4 w-4" />
            </Link>
            <a href={STUDY_URL} className="inline-flex items-center gap-1 text-neutral-400 hover:text-primary">
              Method & data <span className="iconify ph--arrow-up-right-bold h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
