import Link from 'next/link';
import { PRESETS, NETWORK } from '@/presets';
import { useLaunches, type LaunchSummary } from '@/hooks/useRatchet';
import { formatPercent, formatSol } from '@/lib/format/ratchet';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ProgressBar } from './ProgressBar';
import { TokenAvatar } from './TokenAvatar';

const NEAR_GRADUATION = 0.8;

const STAGES = [
  {
    step: '01',
    program: 'Meteora DBC',
    title: 'Launch on a curve',
    body: 'Anti-sniper fee decay or a near-flat fair raise. Team tokens locked in vesting.',
    icon: 'ph--chart-line-up-bold',
  },
  {
    step: '02',
    program: 'Meteora DAMM v2',
    title: 'Graduate, locked forever',
    body: '100% of LP permanently locked. Half of all fees compound back into liquidity.',
    icon: 'ph--lock-key-bold',
  },
  {
    step: '03',
    program: 'Meteora DLMM',
    title: 'Unlocks sell into strength',
    body: 'Team unlocks become limit asks at 1.25× the graduation price or higher. Never dumped.',
    icon: 'ph--stairs-bold',
  },
];

function presetName(id: LaunchSummary['presetId']) {
  return PRESETS.find((p) => p.id === id)?.name ?? 'Custom';
}

function LaunchCard({ launch }: { launch: LaunchSummary }) {
  const near = !launch.migrated && launch.progress >= NEAR_GRADUATION;
  return (
    <Link
      href={`/token/${launch.baseMint}`}
      className={cn(
        'panel group flex flex-col gap-4 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-[0_0_32px_-8px_rgb(var(--primary)/0.45)]',
        near && 'panel-glow'
      )}
    >
      <div className="flex items-center gap-3">
        <TokenAvatar uri={launch.uri} symbol={launch.symbol} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-lg font-bold leading-tight">{launch.symbol}</span>
            {near && <span className="iconify ph--fire-fill h-4 w-4 shrink-0 text-amber" />}
          </div>
          <div className="truncate text-sm text-neutral-400">{launch.name}</div>
        </div>
        <span className="num text-2xl font-bold leading-none text-foreground">
          {launch.migrated ? '100%' : formatPercent(launch.progress)}
        </span>
      </div>
      <ProgressBar value={launch.progress} />
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="num text-neutral-400">
          {formatSol(launch.quoteReserve, 2)} / {formatSol(launch.threshold, 2)} SOL
        </span>
        {launch.migrated ? (
          <span className="rounded-full bg-emerald/15 px-2 py-0.5 font-medium text-emerald">
            DAMM v2 ✓
          </span>
        ) : (
          <span className="rounded-full border border-neutral-750 px-2 py-0.5 text-neutral-400">
            {presetName(launch.presetId)}
          </span>
        )}
      </div>
    </Link>
  );
}

function Section({
  title,
  hint,
  icon,
  launches,
}: {
  title: string;
  hint: string;
  icon: string;
  launches: LaunchSummary[];
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3 border-b border-neutral-850 pb-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/25">
            <span className={cn('iconify h-5 w-5', icon)} />
          </span>
          <div>
            <h2 className="text-xl font-bold tracking-tight">{title}</h2>
            <p className="text-sm text-neutral-500">{hint}</p>
          </div>
        </div>
        <span className="num text-sm text-neutral-500">{launches.length}</span>
      </div>
      {launches.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-neutral-800 p-6 text-center text-sm text-neutral-500">
          Nothing here yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {launches.map((l) => (
            <LaunchCard key={l.pool} launch={l} />
          ))}
        </div>
      )}
    </section>
  );
}

function Hero({ launches }: { launches: LaunchSummary[] | undefined }) {
  const raised = launches?.reduce((sum, l) => sum + l.quoteReserve, 0);
  const graduated = launches?.filter((l) => l.migrated).length;
  const stats = [
    { label: 'Launches', value: launches ? String(launches.length) : '–' },
    { label: 'SOL on curves', value: raised !== undefined ? formatSol(raised, 2) : '–' },
    { label: 'Graduated', value: graduated !== undefined ? String(graduated) : '–' },
  ];

  return (
    <div className="flex flex-col gap-8 pt-4 md:pt-10">
      <div className="flex flex-col items-start gap-5">
        <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-primary">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:hidden" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          Live on Solana {NETWORK}
        </span>
        <h1 className="max-w-4xl text-4xl font-bold leading-[1.02] tracking-tight sm:text-5xl md:text-7xl">
          Team unlocks only sell into <span className="text-glow">strength.</span>
        </h1>
        <p className="max-w-2xl text-base text-neutral-400 md:text-lg">
          A launchpad wired end-to-end through Meteora. Tokens launch on DBC, graduate into a
          locked, fee-compounding DAMM v2 pool, and team unlocks can only hit the market as DLMM
          sell orders above the graduation price.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/create-pool" className={buttonVariants({ size: 'lg' })}>
            <span className="iconify ph--rocket-launch-bold h-5 w-5" />
            Launch a token
          </Link>
          <a href="#board" className={buttonVariants({ size: 'lg', variant: 'outline' })}>
            Browse launches
          </a>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-800">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col gap-1 bg-neutral-925/90 p-4 md:p-5">
            <span className="eyebrow">{s.label}</span>
            <span className="num text-2xl font-bold md:text-3xl">{s.value}</span>
          </div>
        ))}
      </div>

      <ol className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {STAGES.map((stage, i) => (
          <li key={stage.step} className="panel relative flex flex-col gap-3 p-5">
            {i < STAGES.length - 1 && (
              <span
                aria-hidden
                className="absolute -right-3 top-1/2 z-10 hidden h-0.5 w-3 animate-flow-dash bg-[length:6px_2px] bg-repeat-x md:block"
                style={{
                  backgroundImage:
                    'linear-gradient(90deg, rgb(var(--primary)) 50%, transparent 50%)',
                }}
              />
            )}
            <div className="flex items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-950">
                <span className={cn('iconify h-5 w-5', stage.icon)} />
              </span>
              <span className="num text-3xl font-bold text-neutral-800">{stage.step}</span>
            </div>
            <div>
              <span className="eyebrow text-primary">{stage.program}</span>
              <h3 className="mt-1 text-lg font-bold">{stage.title}</h3>
              <p className="mt-1 text-sm text-neutral-400">{stage.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function LaunchBoard() {
  const { data, isLoading, error } = useLaunches();

  const launches = data ?? [];
  const near = launches.filter((l) => !l.migrated && l.progress >= NEAR_GRADUATION);
  const live = launches.filter((l) => !l.migrated && l.progress < NEAR_GRADUATION);
  const graduated = launches.filter((l) => l.migrated);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-12">
      <Hero launches={data} />
      <div id="board" className="flex scroll-mt-20 flex-col gap-10">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="panel h-36 animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <p className="panel p-6 text-center text-rose">
            Couldn&apos;t load launches: {error instanceof Error ? error.message : 'unknown error'}
          </p>
        ) : (
          <>
            <Section
              title="Near graduation"
              icon="ph--fire-bold"
              hint={`${Math.round(NEAR_GRADUATION * 100)}%+ of the way to migrating into DAMM v2.`}
              launches={near}
            />
            <Section
              title="Live on the curve"
              icon="ph--chart-line-up-bold"
              hint="Trading on the Meteora DBC bonding curve."
              launches={live}
            />
            <Section
              title="Graduated"
              icon="ph--graduation-cap-bold"
              hint="Trading on DAMM v2, with team unlocks laddered on DLMM."
              launches={graduated}
            />
          </>
        )}
      </div>
    </div>
  );
}
