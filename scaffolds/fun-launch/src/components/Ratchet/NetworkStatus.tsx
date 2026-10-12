import Link from 'next/link';

const MAINNET = [
  { title: 'The launchpad', body: 'Launch from four presets on a Meteora bonding curve. Our first token graduated in 5 minutes.', href: '/create-pool', cta: 'Launch a token' },
  { title: 'Equity raises', body: 'Curves priced in tokenized Tesla, NVIDIA, Apple and Alphabet stock (xStocks).', href: '/create-pool', cta: 'See the presets' },
  { title: 'Unlock radar', body: 'Every team unlock coming up on Meteora, and what each team did with its last one.', href: '/unlocks', cta: 'Open the radar' },
  { title: 'Launch check', body: 'Grade any Meteora DBC token: locked liquidity, team vesting, past unlock sales.', href: '/check', cta: 'Check a token' },
];

/** What runs where, said plainly: mainnet first, then the devnet vault. */
export function NetworkStatus() {
  return (
    <section className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-neutral-850 bg-neutral-850 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-6 bg-neutral-950 p-6 md:p-8">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald" />
          <span className="text-sm font-medium text-foreground">Live on Solana mainnet</span>
          <span className="text-sm text-neutral-500">· real tokens, real SOL</span>
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {MAINNET.map((m) => (
            <div key={m.title} className="flex flex-col gap-1.5">
              <span className="text-lg font-medium">{m.title}</span>
              <p className="text-sm leading-relaxed text-neutral-400">{m.body}</p>
              <Link href={m.href} className="mt-1 w-fit text-sm text-neutral-300 hover:text-primary">
                {m.cta} →
              </Link>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4 bg-neutral-950 p-6 md:p-8">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-amber" />
          <span className="text-sm font-medium text-foreground">On Solana devnet</span>
          <span className="text-sm text-neutral-500">· test network</span>
        </div>
        <span className="text-lg font-medium">The team-token vault</span>
        <p className="text-sm leading-relaxed text-neutral-400">
          Devnet is Solana’s public test network. It runs the same Meteora programs as mainnet, but with free
          test SOL, so nothing real is at stake.
        </p>
        <p className="text-sm leading-relaxed text-neutral-400">
          Our vault program, which holds team tokens and refuses cheap sales, lives there until it has been
          audited. You can launch a token with it and try to break it yourself.
        </p>
        <Link href="/try" className="mt-auto w-fit text-sm text-neutral-300 hover:text-primary">
          Try the vault on devnet →
        </Link>
      </div>
    </section>
  );
}
