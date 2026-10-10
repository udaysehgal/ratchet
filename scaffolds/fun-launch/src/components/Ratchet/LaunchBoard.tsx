import Link from 'next/link';
import { PRESETS } from '@/presets';
import { useLaunches, type LaunchSummary } from '@/hooks/useRatchet';
import { formatPercent, formatSol } from '@/lib/format/ratchet';
import { ProgressBar } from './ProgressBar';

const NEAR_GRADUATION = 0.8;

function presetName(id: LaunchSummary['presetId']) {
  return PRESETS.find((p) => p.id === id)?.name ?? 'Custom';
}

function LaunchRow({ launch }: { launch: LaunchSummary }) {
  return (
    <Link
      href={`/token/${launch.baseMint}`}
      className="flex flex-col gap-2 rounded-lg border border-neutral-850 bg-neutral-925 p-4 transition-colors hover:border-neutral-700"
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <span className="font-semibold">{launch.symbol}</span>{' '}
          <span className="truncate text-sm text-neutral-400">{launch.name}</span>
        </div>
        <span className="shrink-0 rounded-full border border-neutral-750 px-2 py-0.5 text-xs text-neutral-400">
          {presetName(launch.presetId)}
        </span>
      </div>
      <ProgressBar value={launch.progress} />
      <div className="flex justify-between text-xs text-neutral-500">
        <span>
          {formatSol(launch.quoteReserve, 2)} / {formatSol(launch.threshold, 2)} SOL
        </span>
        <span>{launch.migrated ? 'Graduated → DAMM v2' : formatPercent(launch.progress)}</span>
      </div>
    </Link>
  );
}

function Section({ title, hint, launches }: { title: string; hint: string; launches: LaunchSummary[] }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-bold">
          {title} <span className="text-neutral-500">({launches.length})</span>
        </h2>
        <p className="text-sm text-neutral-500">{hint}</p>
      </div>
      {launches.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-850 p-6 text-center text-sm text-neutral-500">
          Nothing here yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {launches.map((l) => (
            <LaunchRow key={l.pool} launch={l} />
          ))}
        </div>
      )}
    </section>
  );
}

export function LaunchBoard() {
  const { data, isLoading, error } = useLaunches();

  if (isLoading) return <p className="p-8 text-center text-neutral-500">Loading launches…</p>;
  if (error) {
    return (
      <p className="p-8 text-center text-rose">
        Couldn&apos;t load launches: {error instanceof Error ? error.message : 'unknown error'}
      </p>
    );
  }

  const launches = data ?? [];
  const near = launches.filter((l) => !l.migrated && l.progress >= NEAR_GRADUATION);
  const live = launches.filter((l) => !l.migrated && l.progress < NEAR_GRADUATION);
  const graduated = launches.filter((l) => l.migrated);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
          Launches where team unlocks only sell into strength
        </h1>
        <p className="max-w-3xl text-neutral-400">
          Every token launches on a Meteora DBC curve, graduates into a locked, fee-compounding
          DAMM v2 pool, and its team allocation is committed as DLMM sell orders above the
          graduation price. Read live from chain.
        </p>
      </div>
      <Section
        title="Near graduation"
        hint={`${Math.round(NEAR_GRADUATION * 100)}%+ of the way to migrating into DAMM v2.`}
        launches={near}
      />
      <Section title="Live on the curve" hint="Trading on the DBC bonding curve." launches={live} />
      <Section
        title="Graduated"
        hint="Trading on DAMM v2, with team unlocks laddered on DLMM."
        launches={graduated}
      />
    </div>
  );
}
