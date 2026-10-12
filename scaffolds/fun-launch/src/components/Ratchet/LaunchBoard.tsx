import Link from 'next/link';
import { PRESETS } from '@/presets';
import { useLaunches, type LaunchSummary } from '@/hooks/useRatchet';
import { formatPercent, formatSol } from '@/lib/format/ratchet';
import { buttonVariants } from '@/components/ui/button';
import { ProgressBar } from './ProgressBar';
import { TokenAvatar } from './TokenAvatar';
import { MeteorField } from './MeteorField';
import { BeforeAfter, HomeFooter, LaunchTimeline, StorySection } from './HomeStory';
import { ClosingBand, FaqSection, NumbersRow, RadarStrip, RaiseStrip } from './HomeExtras';
import { NetworkStatus } from './NetworkStatus';
import { VIDEO_URL } from '@/lib/links';

const NEAR_GRADUATION = 0.8;

const PROGRAMS = [
  ['DBC', 'dbcij3…aqN'],
  ['DAMM v2', 'cpamdp…1sGG'],
  ['DLMM', 'LBUZKh…Pwxo'],
  ['Met Lock', 'LocpQg…Qqjn'],
];

function presetName(id: LaunchSummary['presetId']) {
  return PRESETS.find((p) => p.id === id)?.name ?? 'Custom';
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
          <span className="flex w-fit items-center gap-2 rounded-full border border-neutral-800 bg-background/60 px-3 py-1 text-xs text-neutral-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald" />
            Live on Solana mainnet
          </span>
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
            <a href={VIDEO_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium hover:text-primary">
              Watch the demo
              <span className="iconify ph--play-fill h-3.5 w-3.5" />
            </a>
            <a href="/pitch" className="inline-flex items-center gap-1 text-sm font-medium hover:text-primary">
              Pitch deck
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
        <NetworkStatus />
        <NumbersRow />
        <StorySection />
        <LaunchTimeline />
        <RaiseStrip />
        <RadarStrip />
        {/* Board */}
        <section id="launches" className="flex scroll-mt-24 flex-col gap-10">
          <div className="flex flex-col gap-3">
            <h2 className="display text-3xl leading-tight md:text-[2.75rem]">Launches on Ratchet right now</h2>
            <p className="max-w-[56ch] text-neutral-400">
              Read straight from Solana mainnet. Click one to trade it or to check its team’s unlocks.
            </p>
          </div>
          {isLoading ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="panel h-32 animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <p className="text-neutral-400">
              Solana is slow to answer right now, so we couldn&apos;t load launches. They&apos;ll appear here
              in a few seconds.
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

        <BeforeAfter />

        <FaqSection />
      </div>

      <ClosingBand />

      <div className="mx-auto w-full max-w-6xl py-12">
        <HomeFooter />
      </div>
    </div>
  );
}
