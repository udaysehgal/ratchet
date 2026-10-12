import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { UnlockRadar } from '@/pages/api/unlocks';
import { cn } from '@/lib/utils';
import { GITHUB_URL, X_URL } from '@/lib/links';

const STUDY_URL = 'https://github.com/udaysehgal/ratchet/blob/main/docs/UNLOCK-STUDY.md';
const solscan = (tx: string) => `https://solscan.io/tx/${tx}`;

export function useUnlockRadar() {
  return useQuery(
    ['unlock-radar'],
    async () => {
      const res = await fetch('/api/unlocks');
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Failed to load');
      return body as UnlockRadar;
    },
    { staleTime: 10 * 60_000 }
  );
}

const n = (x: number | undefined) => (x === undefined ? '…' : x.toLocaleString('en-US'));

/** What we found when we looked at every team allocation on Meteora DBC. */
export function StorySection() {
  const { data } = useUnlockRadar();
  const s = data?.stats;
  const unlocked = s ? s.allocations - s.locked : undefined;
  const moved = s ? Math.round(s.movedShareOfClaimed * 100) : undefined;

  const rows = s
    ? [
        { label: 'claimed it, then moved it out', value: s.sold, strong: true },
        { label: 'haven’t claimed it yet', value: s.unclaimed },
        { label: 'claimed it and kept it', value: s.held },
        { label: 'moved some of it', value: s.mixed },
      ]
    : [];
  const max = Math.max(1, ...rows.map((r) => r.value));

  return (
    <section className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
      <div className="flex flex-col gap-6">
        <h2 className="display text-3xl leading-tight md:text-[2.75rem]">
          So what does a team do when its tokens unlock?
        </h2>
        <div className="flex max-w-[62ch] flex-col gap-5 text-lg leading-relaxed text-neutral-300">
          <p>
            We wanted a real answer, so we read every team allocation that has ever been locked on
            Meteora’s bonding curve. There are {n(s?.allocations)} of them.
          </p>
          <p>
            Most teams claim the moment their tokens vest. Of the {n(s?.claimedTeams)} that have,{' '}
            <span className="text-foreground">{n(s?.sold)} moved almost all of it out of their wallet</span>.
            When we traced 40 of them by hand, 29 had sold on a DEX, most often straight into the pool
            their own holders were trading in.
          </p>
          <p>Vesting doesn’t stop a team dumping. It just puts the dump on a timer.</p>
        </div>
        <a href={STUDY_URL} className="w-fit text-sm text-neutral-500 underline-offset-4 hover:text-foreground hover:underline">
          How we counted, and the raw data
        </a>
      </div>

      <div className="flex flex-col gap-8">
        <blockquote className="border-l-2 border-primary pl-6">
          <p className="display text-3xl leading-tight md:text-4xl">
            <span className="num text-primary">{moved === undefined ? '…' : `${moved}%`}</span> of the team
            tokens ever claimed on Meteora DBC have already left the team’s wallet.
          </p>
        </blockquote>

        <figure className="flex flex-col gap-4">
          <figcaption className="text-sm text-neutral-500">
            Of {n(unlocked)} team allocations that have started unlocking, the team…
          </figcaption>
          {!s ? (
            <div className="flex flex-col gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-5 animate-pulse rounded bg-neutral-900" />
              ))}
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {rows.map((r) => (
                <li key={r.label} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className={r.strong ? 'text-foreground' : 'text-neutral-400'}>{r.label}</span>
                    <span className="num text-neutral-300">{n(r.value)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-neutral-900">
                    <div
                      className={cn('h-full rounded-full', r.strong ? 'bg-primary' : 'bg-neutral-600')}
                      style={{ width: `${Math.max(1, (r.value / max) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Link href="/unlocks" className="w-fit text-sm font-medium hover:text-primary">
            See which unlocks are coming up →
          </Link>
        </figure>
      </div>
    </section>
  );
}

/** Our own first mainnet launch, as it happened (docs/EVIDENCE.md). */
const CHRL = [
  { t: '19:23:00', text: 'We launched CHRL from this site, on the micro-raise preset.', tx: '5QtsRSgsNbieQQg2H6sYaZmJxCP3Xk2o9Mm3CXJety78Yz62uqyiyNbD79s6hMViKftqH2b4WKimKHvA6FoUwrB5' },
  { t: '19:23:15', text: 'Fifteen seconds in, a bot bought. The anti-sniper fee took 37% of what it paid.', tx: '47YZnUa2ERKiU9NRx2dNVbqGdhQmCAUxLHWrKKkZGv4bkFgRyNgyUSPuksV9zvpqUEBSxDc7xW7uoxeKsAef9aZf' },
  { t: '19:26:44', text: 'We filled the rest of the curve ourselves.', tx: '4uCDvw4hoALUG7TaqJs132fYe2K89BGgYBk2yMD2fqnkU6nTVRfMBAeiGWehWHNycSvLYcN8bzQcXPe2yiHxF25b' },
  { t: '19:28:11', text: 'It graduated into a Meteora DAMM v2 pool, with the liquidity locked for good.', tx: 'u4xUbeU8oRsEHutFfQ5V51wSQDfBEPxdaPpuCgJU5bGCmxKQmYEnNVoxwLKJzZFsVwpkca6JUgv5fWqCu7ExpbF' },
  { t: '19:28:18', text: 'Seven seconds later the bot sold into that new pool and took out most of its SOL, at a profit.', tx: 'kvekUvcL8WnZkfdcu9PyN4VrkTxPeYoQyFJ7oKzq7tkdZGewiG7UNnNCSDva2ZpFVKDdfG5eCeMXCE24tjRgutS', loud: true },
  { t: '19:31:20', text: 'Our first team unlock arrived. We claimed it and kept it.', tx: '3wzFtSMR8qBxUgk3fi51fjT71HJrYH9FWXrTPV1mZAUDyXCVXi9CNMRCuK8Aj4V4erDJEvLefPwf7WTV6NXxfjUg' },
];

export function LaunchTimeline() {
  return (
    <section className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
      <div className="flex flex-col gap-5">
        <h2 className="display text-3xl leading-tight md:text-[2.75rem]">Our first launch, minute by minute</h2>
        <p className="max-w-[48ch] text-lg leading-relaxed text-neutral-300">
          On 11 October we launched a token on mainnet to see what really happens. It took eight
          minutes and taught us the most important thing in this project.
        </p>
        <p className="max-w-[48ch] text-lg leading-relaxed text-neutral-300">
          A fee can make a dump expensive. It can’t stop one. Only a program holding the tokens can.
        </p>
      </div>

      <ol className="relative flex flex-col">
        {CHRL.map((e, i) => (
          <li key={e.t} className="relative flex gap-5 pb-7 last:pb-0">
            {i < CHRL.length - 1 && <span aria-hidden className="absolute left-[5px] top-3 h-full w-px bg-neutral-800" />}
            <span
              aria-hidden
              className={cn('relative mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full border-2', e.loud ? 'border-primary bg-primary' : 'border-neutral-600 bg-background')}
            />
            <div className="flex flex-col gap-1">
              <span className="num text-xs text-neutral-500">{e.t} UTC</span>
              <p className={cn('text-base leading-relaxed', e.loud ? 'text-foreground' : 'text-neutral-300')}>{e.text}</p>
              <a href={solscan(e.tx)} target="_blank" rel="noreferrer" className="num w-fit text-xs text-neutral-600 hover:text-primary">
                {e.tx.slice(0, 8)}… ↗
              </a>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** What changes for a team's tokens, said plainly. */
export function BeforeAfter() {
  return (
    <section className="flex flex-col gap-10">
      <h2 className="display max-w-3xl text-3xl leading-tight md:text-[2.75rem]">
        So we took the team’s tokens out of the team’s hands
      </h2>
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-neutral-850 bg-neutral-850 md:grid-cols-2">
        <div className="flex flex-col gap-3 bg-neutral-950 p-6 md:p-8">
          <span className="text-sm text-neutral-500">On most launches</span>
          <p className="text-lg leading-relaxed text-neutral-300">
            Team tokens vest into a wallet. The day they unlock, the team can sell every one of them, at
            any price, into the same pool you bought from.
          </p>
        </div>
        <div className="flex flex-col gap-3 bg-neutral-950 p-6 md:p-8">
          <span className="text-sm text-primary">With the Ratchet vault (on devnet until audited)</span>
          <p className="text-lg leading-relaxed text-foreground">
            Team tokens vest into a vault no one holds the keys to. They can only be sold as limit orders
            at 1.25× the graduation price or higher, at most 10% a day, and that price floor can only go up.
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-[56ch] text-neutral-400">
          It’s a real Solana program, running on devnet (Solana’s test network, with free test SOL) until it
          has been audited. Launch a token with it in about five minutes and try to sell the team’s tokens too
          cheap yourself.
        </p>
        <Link
          href="/try"
          className="inline-flex shrink-0 items-center justify-center rounded-full bg-primary px-6 py-3 font-medium text-white hover:bg-primary-400"
        >
          Try to break it
        </Link>
      </div>
    </section>
  );
}

export function HomeFooter() {
  return (
    <footer className="flex flex-col gap-6 border-t border-neutral-900 pt-10 text-sm text-neutral-500 md:flex-row md:items-start md:justify-between">
      <p className="max-w-[56ch] leading-relaxed">
        Built by Uday Sehgal for Colosseum’s Crypto World’s Fair, on Meteora’s DBC, DAMM v2, DLMM and Lock
        programs. The launchpad runs on Solana mainnet. The vault program runs on devnet and hasn’t been
        audited, so it isn’t on mainnet yet.
      </p>
      <nav className="flex flex-wrap gap-x-6 gap-y-2">
        <a className="hover:text-foreground" href={GITHUB_URL}>GitHub</a>
        {X_URL && <a className="hover:text-foreground" href={X_URL}>X</a>}
        <a className="hover:text-foreground" href={STUDY_URL}>The study</a>
        <Link className="hover:text-foreground" href="/unlocks">Unlock radar</Link>
        <Link className="hover:text-foreground" href="/vault">Vault</Link>
        <Link className="hover:text-foreground" href="/check">Check a token</Link>
        <Link className="hover:text-foreground" href="/pitch">Pitch deck</Link>
      </nav>
    </footer>
  );
}
