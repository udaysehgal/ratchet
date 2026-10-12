import Link from 'next/link';
import { PRESETS, NETWORK } from '@/presets';
import { useLaunches, type LaunchSummary } from '@/hooks/useRatchet';
import { formatPercent, formatSol } from '@/lib/format/ratchet';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ProgressBar } from './ProgressBar';
import { TokenAvatar } from './TokenAvatar';
import { MeteorField } from './MeteorField';
import { StackHub } from './StackHub';
import { ProblemSection } from './ProblemSection';

const NEAR_GRADUATION = 0.8;

const PROGRAMS = [
  ['DBC', 'dbcij3…aqN'],
  ['DAMM v2', 'cpamdp…1sGG'],
  ['DLMM', 'LBUZKh…Pwxo'],
  ['Met Lock', 'LocpQg…Qqjn'],
];

const GUARANTEES = [
  ['Liquidity can’t be pulled.', '100% of the graduated pool’s LP is permanently locked.'],
  ['Fees deepen the pool.', 'Half of every DAMM v2 fee compounds back into liquidity.'],
  ['Team tokens can’t be dumped.', 'Unlocks only reach the market as DLMM asks at 1.25× the graduation price or higher.'],
];

function presetName(id: LaunchSummary['presetId']) {
  return PRESETS.find((p) => p.id === id)?.name ?? 'Custom';
}

function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('eyebrow inline-flex items-center gap-2 text-primary', className)}>
      <span className="iconify ph--asterisk-bold h-3.5 w-3.5" />
      {children}
    </span>
  );
}

function LaunchCard({ launch }: { launch: LaunchSummary }) {
  return (
    <Link
      href={`/token/${launch.baseMint}`}
      className="panel group flex flex-col gap-4 p-4 transition-colors hover:border-neutral-700"
    >
      <div className="flex items-center gap-3">
        <TokenAvatar uri={launch.uri} symbol={launch.symbol} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold leading-tight">{launch.symbol}</div>
          <div className="truncate text-sm text-neutral-500">{launch.name}</div>
        </div>
        <span className="num text-xl text-foreground">
          {launch.migrated ? '100%' : formatPercent(launch.progress)}
        </span>
      </div>
      <ProgressBar value={launch.progress} className="h-1.5" />
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="num text-neutral-500">
          {formatSol(launch.quoteReserve, 2)} / {formatSol(launch.threshold, 2)} {launch.quoteSymbol}
        </span>
        <span className={launch.migrated ? 'text-emerald' : 'text-neutral-500'}>
          {launch.migrated ? 'Graduated to DAMM v2' : presetName(launch.presetId)}
        </span>
      </div>
    </Link>
  );
}

function Section({ title, hint, launches }: { title: string; hint: string; launches: LaunchSummary[] }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3 border-b border-neutral-900 pb-3">
        <div className="flex items-baseline gap-3">
          <h3 className="text-lg font-medium">{title}</h3>
          <span className="hidden text-sm text-neutral-500 sm:inline">{hint}</span>
        </div>
        <span className="num text-sm text-neutral-500">{launches.length}</span>
      </div>
      {launches.length === 0 ? (
        <p className="py-4 text-sm text-neutral-600">None right now.</p>
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

function LiveCard({ launches }: { launches: LaunchSummary[] | undefined }) {
  // SOL-quoted launches only; xStock-quoted raises are shown per launch
  const raised = launches?.reduce((sum, l) => sum + (l.quoteSymbol === 'SOL' ? l.quoteReserve : 0), 0);
  const recent = (launches ?? []).slice(0, 4);
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl bg-gradient-to-br from-primary-500 via-primary-600 to-primary-700 p-2">
        <div className="flex flex-col items-center gap-1 rounded-xl border border-white/15 bg-black/20 px-4 py-6">
          <span className="eyebrow text-white/70">SOL raised on Ratchet curves</span>
          <span className="num text-4xl text-white md:text-5xl">
            {raised !== undefined ? formatSol(raised, 3) : '—'}
          </span>
        </div>
      </div>
      {recent.map((l, i) => (
        <Link
          key={l.pool}
          href={`/token/${l.baseMint}`}
          className="flex items-center gap-3 rounded-2xl border border-neutral-850 bg-neutral-950 px-4 py-3 transition-colors hover:border-neutral-700"
          style={{ opacity: 1 - i * 0.18 }}
        >
          <TokenAvatar uri={l.uri} symbol={l.symbol} className="h-9 w-9 rounded-full" />
          <div className="min-w-0 flex-1">
            <div className="num truncate text-sm">
              {formatSol(l.quoteReserve, 3)} {l.quoteSymbol} · {l.symbol}
            </div>
            <div className="eyebrow">{l.migrated ? 'Graduated' : 'On curve'}</div>
          </div>
          <span className="num text-sm text-neutral-400">
            {l.migrated ? '100%' : formatPercent(l.progress)}
          </span>
        </Link>
      ))}
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
    <div className="flex w-full flex-col">
      {/* Hero */}
      <section className="relative -mx-2 -mt-3 overflow-hidden md:-mx-4">
        <MeteorField className="pointer-events-none absolute inset-0 h-full w-full opacity-90" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-background via-background/40 to-transparent" />
        <div className="relative mx-auto flex min-h-[520px] w-full max-w-6xl flex-col justify-center gap-6 px-4 py-20 md:min-h-[620px]">
          <h1 className="display max-w-2xl text-5xl leading-[1.02] sm:text-6xl md:text-7xl">
            Launches where the team can only sell into strength.
          </h1>
          <p className="max-w-lg text-lg text-neutral-300">
            Launch on a Meteora bonding curve, graduate into a pool whose liquidity is locked
            forever, and commit team unlocks as sell orders above the graduation price.
          </p>
          <div className="flex flex-wrap items-center gap-6">
            <Link href="/create-pool" className={buttonVariants({ size: 'lg' })}>
              Launch a token
            </Link>
            <a href="#launches" className="inline-flex items-center gap-1 text-sm font-medium hover:text-primary">
              Browse launches
              <span className="iconify ph--caret-right-bold h-4 w-4" />
            </a>
          </div>
        </div>
      </section>

      {/* Program strip */}
      <section className="-mx-2 border-y border-neutral-900 md:-mx-4">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-y-6 px-4 py-8 md:grid-cols-4">
          {PROGRAMS.map(([name, id]) => (
            <div key={name} className="flex flex-col gap-1">
              <span className="text-2xl font-medium tracking-tight text-neutral-200">{name}</span>
              <span className="font-mono text-xs text-neutral-600">{id}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-28 py-24">
        {/* The problem, with live data */}
        <ProblemSection />

        {/* Stack */}
        <section className="flex flex-col items-center gap-4 text-center">
          <Eyebrow>The whole stack</Eyebrow>
          <h2 className="display text-4xl md:text-5xl">Every step of a launch runs on Meteora</h2>
          <p className="max-w-2xl text-neutral-400">
            One token, four Meteora programs. No custodial contracts in between: every
            transaction is built from Meteora&apos;s own SDKs and signed by your wallet.
          </p>
          <div className="mt-10 w-full">
            <StackHub />
          </div>
        </section>

        {/* Live */}
        <section className="grid grid-cols-1 items-start gap-12 md:grid-cols-2">
          <div className="flex flex-col gap-5">
            <Eyebrow>Live on Solana {NETWORK}</Eyebrow>
            <h2 className="display text-4xl md:text-5xl">What every launch guarantees</h2>
            <ul className="flex flex-col gap-4">
              {GUARANTEES.map(([title, body]) => (
                <li key={title} className="flex gap-3">
                  <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15">
                    <span className="iconify ph--check-bold h-2.5 w-2.5 text-primary" />
                  </span>
                  <span className="text-neutral-400">
                    <span className="text-foreground">{title}</span> {body}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-6 pt-2">
              <Link href="/create-pool" className={buttonVariants()}>
                Get started
              </Link>
              <Link
                href="/api/feed"
                className="inline-flex items-center gap-1 text-sm font-medium hover:text-primary"
              >
                Public launch feed API
                <span className="iconify ph--caret-right-bold h-4 w-4" />
              </Link>
            </div>
          </div>
          <LiveCard launches={data} />
        </section>

        {/* Board */}
        <section id="launches" className="flex scroll-mt-24 flex-col gap-10">
          <div className="flex flex-col gap-4">
            <Eyebrow>Launches</Eyebrow>
            <h2 className="display text-4xl md:text-5xl">Read live from chain</h2>
          </div>
          {isLoading ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="panel h-32 animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <p className="text-rose">
              Couldn&apos;t load launches: {error instanceof Error ? error.message : 'unknown error'}
            </p>
          ) : (
            <>
              <Section
                title="Near graduation"
                hint={`${Math.round(NEAR_GRADUATION * 100)}%+ of the way to DAMM v2`}
                launches={near}
              />
              <Section title="On the curve" hint="Trading on Meteora DBC" launches={live} />
              <Section title="Graduated" hint="Trading on DAMM v2, unlocks on DLMM" launches={graduated} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
