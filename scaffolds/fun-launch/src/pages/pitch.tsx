import Head from 'next/head';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RatchetMark } from '@/components/Ratchet/Logo';
import { GITHUB_URL, X_URL } from '@/lib/links';
import { cn } from '@/lib/utils';

/*
 * The pitch deck. One 16:9 slide per screen, sized in container units so it scales to any window;
 * arrow keys or space move between slides, and printing gives one slide per page (that's the PDF).
 * Every number here is in the repo: docs/UNLOCK-STUDY.md, docs/EVIDENCE.md, docs/VAULT.md.
 */

const SITE = 'useratchet.xyz';

function Slide({
  n,
  children,
  className,
}: {
  n: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className="pitch-slide flex h-screen w-full snap-start items-center justify-center bg-[#050505] p-[2vmin]">
      <div
        className={cn(
          'relative flex aspect-video w-[min(96vw,calc(96vh*16/9))] flex-col overflow-hidden rounded-[1.2cqw] border border-white/10 bg-[#0A0A0B] px-[6cqw] py-[5cqw] text-[#F5F5F5] [container-type:inline-size]',
          className
        )}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(#ffffff07_1px,transparent_1px),linear-gradient(90deg,#ffffff07_1px,transparent_1px)] bg-[size:3.2cqw_3.2cqw]"
        />
        <div className="relative flex h-full flex-col justify-center pb-[2cqw]">{children}</div>
        <div className="absolute bottom-[2.4cqw] left-[6cqw] right-[6cqw] flex items-center justify-between font-mono text-[0.95cqw] tracking-wider text-neutral-500">
          <span className="flex items-center gap-[0.6cqw]">
            <RatchetMark className="h-[1.3cqw] w-[1.3cqw] text-[#F97316]" />
            RATCHET
          </span>
          <span>{String(n).padStart(2, '0')} / 10</span>
        </div>
      </div>
    </section>
  );
}

const Kicker = ({ children }: { children: React.ReactNode }) => (
  <p className="font-mono text-[1.15cqw] uppercase tracking-[0.2em] text-[#F97316]">{children}</p>
);
const Title = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <h2
    className={cn(
      'mt-[1.4cqw] text-[3.9cqw] font-bold leading-[1.08] tracking-[-0.02em]',
      className
    )}
  >
    {children}
  </h2>
);
const O = ({ children }: { children: React.ReactNode }) => (
  <span className="text-[#F97316]">{children}</span>
);

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-[0.6cqw] border-l-2 border-[#F97316] pl-[1.6cqw]">
      <span className="font-mono text-[4.6cqw] font-semibold leading-none tracking-tight">
        {value}
      </span>
      <span className="max-w-[24cqw] text-[1.35cqw] leading-snug text-neutral-400">{label}</span>
    </div>
  );
}

function Refusal({ ok, action, result }: { ok?: boolean; action: string; result: string }) {
  return (
    <div
      className={cn(
        'flex items-center justify-between rounded-[0.8cqw] border px-[1.8cqw] py-[1.25cqw]',
        ok ? 'border-[#10b98166] bg-[#10b98112]' : 'border-[#f43f5e66] bg-[#f43f5e12]'
      )}
    >
      <span className="text-[1.6cqw]">
        {ok ? '✓' : '✕'} {action}
      </span>
      <span className={cn('font-mono text-[1.35cqw]', ok ? 'text-[#34d399]' : 'text-[#fb7185]')}>
        {result}
      </span>
    </div>
  );
}

const STEPS = [
  [
    'Launch',
    'Meteora DBC bonding curve. In the same transaction, the pool’s creator role moves to the vault.',
  ],
  ['Graduate', 'Into a Meteora DAMM v2 pool, with 100% of the LP locked forever.'],
  [
    'Vest',
    'The team allocation vests through Meteora Lock, and claims can only land in the vault.',
  ],
  [
    'Sell into strength',
    'Unlocks leave only as Meteora DLMM limit orders at ≥1.25× the graduation price.',
  ],
];

export default function Pitch() {
  const root = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);

  const go = useCallback((next: number) => {
    const slides = root.current?.querySelectorAll('.pitch-slide');
    if (!slides) return;
    const k = Math.max(0, Math.min(slides.length - 1, next));
    slides[k].scrollIntoView({ behavior: 'smooth' });
    setI(k);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key))
        (e.preventDefault(), go(i + 1));
      if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) (e.preventDefault(), go(i - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, i]);

  useEffect(() => {
    const el = root.current;
    if (!el) return undefined;
    const onScroll = () => setI(Math.round(el.scrollTop / el.clientHeight));
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      <Head>
        <title>Pitch - Ratchet</title>
        <style>{`
          @page { size: 1600px 900px; margin: 0; }
          @media print {
            html, body { background: #0A0A0B !important; }
            .pitch-root { height: auto !important; overflow: visible !important; }
            .pitch-slide { height: 900px !important; width: 1600px !important; padding: 0 !important; break-after: page; }
            .pitch-slide:last-child { break-after: auto; }
            .pitch-slide > div { width: 1600px !important; border: 0 !important; border-radius: 0 !important; }
            .pitch-nav { display: none !important; }
            * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        `}</style>
      </Head>

      <div
        ref={root}
        className="pitch-root h-screen snap-y snap-mandatory overflow-y-auto bg-[#050505] font-sans"
      >
        {/* 1. Title */}
        <Slide n={1}>
          <div
            aria-hidden
            className="pointer-events-none absolute -right-[16cqw] -top-[18cqw] h-[62cqw] w-[62cqw] bg-[radial-gradient(circle,#F9731633,transparent_62%)]"
          />
          <RatchetMark className="pointer-events-none absolute -right-[7cqw] top-1/2 h-[36cqw] w-[36cqw] -translate-y-1/2 text-[#F97316]" />
          <div className="my-auto flex max-w-[56cqw] flex-col">
            <p className="flex items-center gap-[1cqw] text-[1.8cqw] font-extrabold tracking-[0.3em]">
              <RatchetMark className="h-[2.4cqw] w-[2.4cqw] text-[#F97316]" /> RATCHET
            </p>
            <h1 className="mt-[2.4cqw] text-[5.6cqw] font-extrabold leading-[1.02] tracking-[-0.03em]">
              Team tokens that only sell into <O>strength.</O>
            </h1>
            <p className="mt-[2.4cqw] max-w-[46cqw] text-[1.7cqw] leading-relaxed text-neutral-400">
              A Meteora launchpad where the team allocation is held by a program, and can only reach
              the market above the graduation price.
            </p>
            <p className="mt-[3cqw] font-mono text-[1.3cqw] text-[#F97316]">
              {SITE} · Meteora DBC track
            </p>
          </div>
        </Slide>

        {/* 2. Problem */}
        <Slide n={2}>
          <Kicker>The problem</Kicker>
          <Title>
            Vesting doesn’t stop a team dump.
            <br />
            It puts it on a <O>timer.</O>
          </Title>
          <p className="mt-[1.6cqw] max-w-[60cqw] text-[1.55cqw] leading-relaxed text-neutral-400">
            We read every team allocation ever locked on Meteora’s bonding curve, straight from
            mainnet.
          </p>
          <div className="mt-[4.5cqw] grid grid-cols-4 gap-[2.4cqw]">
            <Stat value="1,477" label="team allocations on Meteora DBC" />
            <Stat value="762/818" label="teams that claimed moved 90%+ out of the wallet" />
            <Stat value="98%" label="of all claimed team tokens have left the team wallet" />
            <Stat value="29/40" label="traced by hand sold on a DEX; 17 into the DAMM v2 pool" />
          </div>
        </Slide>

        {/* 3. Our launch */}
        <Slide n={3}>
          <Kicker>We saw it on our own launch</Kicker>
          <Title>A fee can make a dump expensive. It can’t stop one.</Title>
          <ol className="mt-[3cqw] flex flex-col gap-[1.5cqw]">
            {[
              ['19:23:00', 'We launched CHRL on mainnet, on our micro-raise preset.'],
              ['19:23:15', 'A bot bought 15 seconds in and paid 37% in anti-sniper fees.'],
              ['19:28:11', 'Graduated into a Meteora DAMM v2 pool, LP locked forever.'],
              ['19:28:18', 'Seven seconds later the bot sold into that pool, at a profit.', true],
            ].map(([t, text, loud]) => (
              <li key={t as string} className="flex items-baseline gap-[2.4cqw]">
                <span className="w-[10cqw] shrink-0 font-mono text-[1.35cqw] text-neutral-500">
                  {t} UTC
                </span>
                <span
                  className={cn(
                    'text-[1.9cqw]',
                    loud ? 'font-semibold text-[#F97316]' : 'text-neutral-200'
                  )}
                >
                  {text}
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-[4.5cqw] text-[1.7cqw] text-neutral-300">
            Only a program that <O>holds the tokens</O> can refuse a sale.
          </p>
        </Slide>

        {/* 4. How it works */}
        <Slide n={4}>
          <Kicker>How Ratchet works</Kicker>
          <Title>The team’s tokens never touch the team’s wallet.</Title>
          <div className="mt-[4.5cqw] grid grid-cols-4 gap-[1.6cqw]">
            {STEPS.map(([h, body], k) => (
              <div
                key={h}
                className="flex flex-col gap-[1cqw] rounded-[1cqw] border border-white/10 bg-white/[0.02] p-[2cqw]"
              >
                <span className="font-mono text-[1.2cqw] text-[#F97316]">0{k + 1}</span>
                <span className="text-[2cqw] font-semibold">{h}</span>
                <span className="text-[1.35cqw] leading-relaxed text-neutral-400">{body}</span>
              </div>
            ))}
          </div>
        </Slide>

        {/* 5. The vault refuses */}
        <Slide n={5}>
          <div className="grid grid-cols-[1fr_1.1fr] items-center gap-[5cqw]">
            <div className="flex flex-col">
              <Kicker>The vault</Kicker>
              <Title>Everything except selling into strength is refused on-chain.</Title>
              <p className="mt-[2cqw] text-[1.55cqw] leading-relaxed text-neutral-400">
                A native Solana program. The floor starts at 1.25× the graduation price and can only
                go up. A sunset, if any, is fixed at launch and at least 180 days out.
              </p>
              <p className="mt-[4.5cqw] font-mono text-[1.3cqw] text-neutral-300">
                25/25 lifecycle checks on devnet · 30 unit tests + CI
              </p>
            </div>
            <div className="my-auto flex flex-col gap-[1.2cqw]">
              <Refusal action="Sell below 1.25× graduation" result="BelowFloor" />
              <Refusal action="Lower the floor" result="FloorCannotDecrease" />
              <Refusal action="Sell over 10% in a day" result="DailyCapExceeded" />
              <Refusal action="Send tokens to the team wallet" result="impossible before sunset" />
              <Refusal ok action="Ask at ≥1.25×, within the cap" result="order placed" />
            </div>
          </div>
        </Slide>

        {/* 6. Meteora */}
        <Slide n={6}>
          <Kicker>Built on Meteora, end to end</Kicker>
          <Title>Four Meteora programs, called directly.</Title>
          <div className="mt-[4.5cqw] grid grid-cols-2 gap-[1.6cqw]">
            {[
              [
                'Dynamic Bonding Curve',
                'Four launch presets, creator role handed to the vault at launch, xStocks quotes via token badges.',
              ],
              [
                'DAMM v2',
                'Every graduation lands in a DAMM v2 pool with 100% of the LP permanently locked.',
              ],
              ['Meteora Lock', 'Team vesting escrows whose claims can only land in the vault.'],
              [
                'DLMM',
                'The only exit for team tokens: limit-order asks the vault places, at or above the floor.',
              ],
            ].map(([h, body]) => (
              <div
                key={h}
                className="flex flex-col gap-[0.8cqw] rounded-[1cqw] border border-white/10 bg-white/[0.02] p-[2cqw]"
              >
                <span className="text-[2cqw] font-semibold">{h}</span>
                <span className="text-[1.4cqw] leading-relaxed text-neutral-400">{body}</span>
              </div>
            ))}
          </div>
        </Slide>

        {/* 7. Live today */}
        <Slide n={7}>
          <Kicker>Live today</Kicker>
          <Title>Not a mockup. Try every piece of it.</Title>
          <div className="mt-[4.5cqw] grid grid-cols-3 gap-x-[3cqw] gap-y-[2.2cqw]">
            {[
              [
                'Launchpad on mainnet',
                'CHRL went from curve to a locked DAMM v2 pool in 5 minutes.',
              ],
              ['Equity raises', 'Curves priced in tokenized TSLA, NVDA, AAPL and GOOGL (xStocks).'],
              ['Vault on devnet', 'Launch a vaulted token at /try and try to dump it yourself.'],
              ['Unlock radar', 'Every upcoming DBC team unlock, and what that team did last time.'],
              ['Launch check + badge', 'Grade any DBC token. Embeddable SVG badge, public API.'],
              ['For agents', 'MCP server and Agent Skill; a keeper cranks the vault every 30 min.'],
            ].map(([h, body]) => (
              <div
                key={h}
                className="flex flex-col gap-[0.6cqw] border-t border-white/10 pt-[1.2cqw]"
              >
                <span className="text-[1.8cqw] font-semibold">{h}</span>
                <span className="text-[1.35cqw] leading-relaxed text-neutral-400">{body}</span>
              </div>
            ))}
          </div>
        </Slide>

        {/* 8. Why it matters */}
        <Slide n={8}>
          <Kicker>Why it matters</Kicker>
          <Title className="max-w-[70cqw]">
            Holders get a floor the team can’t break. Teams get a way to prove it.
          </Title>
          <div className="mt-[4.5cqw] grid grid-cols-3 gap-[3cqw]">
            {[
              [
                'Holders',
                'Team supply can only enter the market as resting asks above graduation. No surprise dump into your pool.',
              ],
              [
                'Teams',
                'A verifiable commitment, shown by the launch check and badge, instead of a promise in a Telegram chat.',
              ],
              [
                'Launchpads',
                'One instruction, adopt_launch, in the launch transaction. Works with any DBC config.',
              ],
            ].map(([h, body]) => (
              <div key={h} className="flex flex-col gap-[1cqw]">
                <span className="text-[2cqw] font-semibold text-[#F97316]">{h}</span>
                <span className="text-[1.45cqw] leading-relaxed text-neutral-300">{body}</span>
              </div>
            ))}
          </div>
        </Slide>

        {/* 9. Roadmap */}
        <Slide n={9}>
          <Kicker>What’s next</Kicker>
          <Title>From devnet to every Meteora launch.</Title>
          <ol className="mt-[4.5cqw] flex flex-col gap-[1.4cqw]">
            {[
              ['Audit', 'Get the vault program audited, then deploy it to mainnet.'],
              [
                'Vault by default',
                'Every Ratchet launch adopts a vault in its launch transaction.',
              ],
              [
                'Launchpad integrations',
                'Offer adopt_launch to other DBC launchpads, with the MCP server and API.',
              ],
              ['Unlock alerts', 'Push the radar to holders before an unlock lands.'],
            ].map(([h, body], k) => (
              <li
                key={h}
                className="flex items-baseline gap-[2.4cqw] border-t border-white/10 pt-[1.4cqw]"
              >
                <span className="w-[3cqw] font-mono text-[1.3cqw] text-[#F97316]">0{k + 1}</span>
                <span className="w-[22cqw] text-[1.9cqw] font-semibold">{h}</span>
                <span className="text-[1.5cqw] text-neutral-400">{body}</span>
              </li>
            ))}
          </ol>
        </Slide>

        {/* 10. Close */}
        <Slide n={10}>
          <RatchetMark className="pointer-events-none absolute -right-[7cqw] top-1/2 h-[36cqw] w-[36cqw] -translate-y-1/2 text-[#F97316]/90" />
          <div className="my-auto flex max-w-[56cqw] flex-col">
            <h2 className="text-[5cqw] font-extrabold leading-[1.04] tracking-[-0.03em]">
              Make your team sell into <O>strength.</O>
            </h2>
            <div className="mt-[3.4cqw] flex flex-col gap-[1cqw] font-mono text-[1.5cqw] text-neutral-300">
              <span>
                <O>Try it</O> · {SITE}/try
              </span>
              <span>
                <O>Code</O> · {GITHUB_URL.replace('https://', '')}
              </span>
              {X_URL && (
                <span>
                  <O>X</O> · {X_URL.replace('https://', '')}
                </span>
              )}
            </div>
          </div>
        </Slide>
      </div>

      <div className="pitch-nav fixed bottom-4 right-4 flex items-center gap-2 font-mono text-xs text-neutral-500">
        <button
          className="rounded border border-white/10 px-2 py-1 hover:text-white"
          onClick={() => go(i - 1)}
          aria-label="Previous slide"
        >
          ←
        </button>
        <span>{i + 1}/10</span>
        <button
          className="rounded border border-white/10 px-2 py-1 hover:text-white"
          onClick={() => go(i + 1)}
          aria-label="Next slide"
        >
          →
        </button>
        <a
          className="rounded border border-white/10 px-2 py-1 hover:text-white"
          href="/ratchet-pitch.pdf"
        >
          PDF
        </a>
      </div>
    </>
  );
}
