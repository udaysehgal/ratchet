import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { TeamUnlock } from '@/server/unlocks';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useUnlockRadar } from './HomeStory';
import { MeteorField } from './MeteorField';

/** A slowly scrolling row. Content is rendered twice so the loop is seamless; pauses on hover. */
function Marquee({ children, seconds = 45 }: { children: React.ReactNode; seconds?: number }) {
  return (
    <div
      className="group relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]"
      style={{ ['--marquee-duration' as string]: `${seconds}s` }}
    >
      <div className="flex w-max animate-marquee group-hover:[animation-play-state:paused] motion-reduce:animate-none">
        <div className="flex shrink-0">{children}</div>
        <div className="flex shrink-0" aria-hidden>
          {children}
        </div>
      </div>
    </div>
  );
}

function StripItem({
  icon,
  title,
  sub,
  tag,
  value,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  tag: React.ReactNode;
  value: React.ReactNode;
}) {
  return (
    <div className="flex w-[230px] shrink-0 flex-col gap-2 border-l border-neutral-850 px-5 py-4">
      <div className="flex items-center justify-between gap-2 text-[11px] text-neutral-500">
        <span className="flex items-center gap-2">
          {icon}
          <span className="font-medium text-neutral-300">{title}</span>
        </span>
        <span className="truncate">{tag}</span>
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm text-neutral-400">{sub}</span>
        <span className="num text-sm text-foreground">{value}</span>
      </div>
    </div>
  );
}

type Quote = { symbol: string; name: string; icon: string; label: string; usd: number | null };

/** What a Ratchet launch can raise in, with live prices. */
export function RaiseStrip() {
  const { data } = useQuery(['quotes'], async () => (await (await fetch('/api/quotes')).json()) as Quote[], {
    staleTime: 60_000,
  });
  const items = data ?? [];
  return (
    <section className="flex flex-col gap-3">
      <p className="text-sm text-neutral-500">Raise in SOL, or in tokenized stocks with a Meteora token badge.</p>
      <div className="border-y border-neutral-900">
        {items.length === 0 ? (
          <div className="h-[74px]" />
        ) : (
          <Marquee seconds={35}>
            {[...items, ...items].map((q, i) => (
              <StripItem
                key={`${q.symbol}-${i}`}
                // eslint-disable-next-line @next/next/no-img-element
                icon={<img src={q.icon} alt="" className="h-5 w-5 rounded-full" />}
                title={q.symbol}
                tag={q.label}
                sub={q.name}
                value={q.usd ? `$${q.usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
              />
            ))}
          </Marquee>
        )}
      </div>
    </section>
  );
}

const VERDICT_TAG: Record<TeamUnlock['verdict'], { text: string; className: string }> = {
  sold: { text: 'sold its last unlock', className: 'text-rose' },
  mixed: { text: 'sold some last time', className: 'text-amber' },
  held: { text: 'kept its last unlock', className: 'text-emerald' },
  unclaimed: { text: 'never claimed', className: 'text-neutral-500' },
  locked: { text: 'first unlock', className: 'text-neutral-500' },
};

function inTime(ts: number) {
  const s = ts - Date.now() / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min`;
  if (s < 86400) return `${Math.round(s / 3600)} h`;
  return `${Math.round(s / 86400)} d`;
}

/** Upcoming team unlocks across Meteora DBC, from the unlock radar. */
export function RadarStrip() {
  const { data } = useUnlockRadar();
  const items = (data?.upcoming ?? []).slice(0, 24);
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-neutral-500">Team unlocks coming up on Meteora DBC, live.</p>
        <Link href="/unlocks" className="text-sm text-neutral-400 hover:text-foreground">
          Unlock radar →
        </Link>
      </div>
      <div className="border-y border-neutral-900">
        {items.length === 0 ? (
          <div className="h-[74px]" />
        ) : (
          <Marquee seconds={70}>
            {items.map((u) => {
              const v = VERDICT_TAG[u.verdict];
              const name = u.symbol !== '???' ? u.symbol : `${u.mint.slice(0, 4)}…`;
              return (
                <StripItem
                  key={u.escrow}
                  icon={
                    <span className="num flex h-5 w-5 items-center justify-center rounded-full bg-neutral-850 text-[9px] text-neutral-400">
                      {name.slice(0, 2)}
                    </span>
                  }
                  title={name}
                  tag={<span className={v.className}>{v.text}</span>}
                  sub="team unlock in"
                  value={u.nextUnlockAt ? inTime(u.nextUnlockAt) : '—'}
                />
              );
            })}
          </Marquee>
        )}
      </div>
    </section>
  );
}

/** A few numbers, said big. */
export function NumbersRow() {
  const { data } = useUnlockRadar();
  const s = data?.stats;
  const numbers = [
    { value: s ? s.allocations.toLocaleString('en-US') : '1,477', label: 'Meteora team allocations we read' },
    { value: s ? `${Math.round(s.movedShareOfClaimed * 100)}%` : '98%', label: 'of claimed team tokens left the wallet' },
    { value: '5 min', label: 'from launch to a locked pool, on mainnet' },
    { value: '37%', label: 'anti-sniper fee a bot paid on our mainnet launch' },
  ];
  return (
    <section className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-4">
      {numbers.map((x) => (
        <div key={x.label} className="flex flex-col gap-1.5">
          <span className="display text-4xl md:text-5xl">{x.value}</span>
          <span className="text-sm text-neutral-500">{x.label}</span>
        </div>
      ))}
    </section>
  );
}

const FAQS: { q: string; a: React.ReactNode }[] = [
  {
    q: 'What is Ratchet?',
    a: 'A token launchpad built on Meteora. Your token starts on a bonding curve, graduates into a pool whose liquidity is locked forever, and the team’s own tokens can only be sold above the price the curve finished at.',
  },
  {
    q: 'What happens to the team’s tokens?',
    a: 'They vest into a vault: an account controlled by a Solana program, not by a person. The team can’t send them anywhere. The only way out is a limit order on Meteora DLMM at 1.25× the graduation price or higher.',
  },
  {
    q: 'Can the team still dump on holders?',
    a: 'Not below the floor. The program refuses any sell order under 1.25× the graduation price, the floor can only be raised, and at most 10% of the vault can be offered per day. The team could buy its own orders, but that means paying above the floor with its own money.',
  },
  {
    q: 'Is the liquidity safe?',
    a: 'All of the liquidity in the graduated Meteora DAMM v2 pool is permanently locked, so no one can pull it. Half of every trading fee is added back to the pool.',
  },
  {
    q: 'How do I try it without spending money?',
    a: (
      <>
        Go to <Link href="/try" className="text-primary hover:underline">Try the vault</Link>. It runs on Solana devnet with
        free test SOL: you launch a token, graduate it, and try to sell the team’s tokens too cheap. It takes about five
        minutes.
      </>
    ),
  },
  {
    q: 'Is the vault on mainnet?',
    a: 'Not yet. The launchpad runs on mainnet; the vault program runs on devnet. It hasn’t had an independent audit, and it shouldn’t hold real money until it has.',
  },
  {
    q: 'Can I raise in stocks instead of SOL?',
    a: 'Yes. The equity raise preset prices the curve in Tesla, NVIDIA, Apple or Alphabet xStocks, and the token graduates into a pool in that stock.',
  },
  {
    q: 'What are the launch presets?',
    a: 'Anti-sniper (buyers in the first block pay up to 50%, falling to 1% within two minutes), Fair raise (the last buyer pays about 5% more than the first), Micro raise (graduates at 0.1 SOL) and Equity raise (priced in a stock).',
  },
  {
    q: 'What does it cost to launch?',
    a: 'About 0.02 SOL of Solana rent, plus a 0.02 SOL launch fee on the anti-sniper and fair-raise presets. The creator earns half of all trading fees on the curve.',
  },
  {
    q: 'Where does the unlock data come from?',
    a: (
      <>
        Every team allocation on Meteora DBC sits in a Meteora Lock escrow created by the same program account, so we read
        all of them in one query and compare what was claimed with what’s still in the team’s wallet. The method and
        raw data are{' '}
        <a href="https://github.com/udaysehgal/ratchet/blob/main/docs/UNLOCK-STUDY.md" className="text-primary hover:underline">
          on GitHub
        </a>
        .
      </>
    ),
  },
  {
    q: 'Can I check a token that wasn’t launched on Ratchet?',
    a: (
      <>
        Yes. <Link href="/check" className="text-primary hover:underline">Check a token</Link> works for any Meteora DBC
        token: it shows whether liquidity can be pulled, how much of the raise is paid out, and whether the team sold its
        last unlock.
      </>
    ),
  },
  {
    q: 'Is it open source?',
    a: (
      <>
        Yes, everything: the app, the vault program and the study.{' '}
        <a href="https://github.com/udaysehgal/ratchet" className="text-primary hover:underline">
          github.com/udaysehgal/ratchet
        </a>
      </>
    ),
  },
];

export function FaqSection() {
  const [open, setOpen] = useState<number | null>(0);
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? FAQS : FAQS.slice(0, 5);
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-sm text-neutral-500">FAQs</h2>
      <div className="flex max-w-4xl flex-col gap-2">
        {shown.map((f, i) => {
          const isOpen = open === i;
          return (
            <div key={f.q} className={cn('rounded-xl transition-colors', isOpen ? 'bg-neutral-900' : 'bg-neutral-950 hover:bg-neutral-925')}>
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left md:px-8"
              >
                <span className="text-base font-medium md:text-lg">{f.q}</span>
                <span className={cn('iconify h-4 w-4 shrink-0 text-neutral-400 transition-transform', isOpen ? 'ph--x-bold' : 'ph--plus-bold')} />
              </button>
              {isOpen && <div className="max-w-[70ch] px-6 pb-6 leading-relaxed text-neutral-400 md:px-8">{f.a}</div>}
            </div>
          );
        })}
      </div>
      {!showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="flex w-fit items-center gap-3 rounded-xl bg-neutral-900 px-5 py-3 text-sm font-medium hover:bg-neutral-850"
        >
          More questions <span className="iconify ph--plus-bold h-3.5 w-3.5" />
        </button>
      )}
    </section>
  );
}

/** The closing call to action, bookending the hero. */
export function ClosingBand() {
  return (
    <section className="relative -mx-2 overflow-hidden border-y border-neutral-900 md:-mx-4">
      <MeteorField className="pointer-events-none absolute inset-0 h-full w-full opacity-60" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-background via-background/60 to-transparent" />
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-24 md:py-32">
        <h2 className="display max-w-3xl text-5xl leading-[1.02] md:text-7xl">Make your team sell into strength.</h2>
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/create-pool" className={buttonVariants({ size: 'lg' })}>
            Launch a token
          </Link>
          <Link href="/try" className={buttonVariants({ size: 'lg', variant: 'outline' })}>
            Try the vault
          </Link>
        </div>
      </div>
    </section>
  );
}
