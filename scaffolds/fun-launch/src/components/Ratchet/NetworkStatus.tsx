import Link from 'next/link';

const MAINNET = [
  {
    title: 'The launchpad',
    body: 'Four presets on a Meteora bonding curve. Launch in one signature.',
    href: '/create-pool',
    cta: 'Launch a token',
  },
  {
    title: 'A real graduation',
    body: 'Our token CHRL went from launch to a locked Meteora DAMM v2 pool in 5 minutes.',
    href: '/token/CrUN9NbRPTFeVJqeh8ytqDgAKUGHp3CN1pVXZeMKifx5',
    cta: 'See CHRL',
  },
  {
    title: 'Equity raises',
    body: 'Curves priced in tokenized Tesla, NVIDIA, Apple and Alphabet stock (xStocks).',
    href: '/create-pool',
    cta: 'See the presets',
  },
  {
    title: 'Locked liquidity',
    body: 'Every graduation lands in DAMM v2 with 100% of the LP locked forever.',
    href: '/token/CrUN9NbRPTFeVJqeh8ytqDgAKUGHp3CN1pVXZeMKifx5',
    cta: 'See the pool',
  },
  {
    title: 'Unlock radar',
    body: 'Every team unlock coming up on Meteora, and what each team did with its last one.',
    href: '/unlocks',
    cta: 'Open the radar',
  },
  {
    title: 'Launch check',
    body: 'Grade any Meteora DBC token: locked liquidity, team vesting, past unlock sales.',
    href: '/check',
    cta: 'Check a token',
  },
];

/** What is live on mainnet today, with the vault demo as a footnote. */
export function NetworkStatus() {
  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-col gap-8">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald" />
          <span className="text-sm font-medium text-foreground">Live on Solana mainnet</span>
          <span className="text-sm text-neutral-500">· real tokens, real SOL</span>
        </div>
        <div className="grid grid-cols-1 gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {MAINNET.map((m) => (
            <div key={m.title} className="flex flex-col gap-2 border-t border-neutral-850 pt-5">
              <span className="text-lg font-medium">{m.title}</span>
              <p className="text-sm leading-relaxed text-neutral-400">{m.body}</p>
              <Link
                href={m.href}
                className="mt-1 w-fit text-sm text-neutral-300 hover:text-primary"
              >
                {m.cta} →
              </Link>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2 rounded-xl border border-neutral-850 px-5 py-4 text-sm text-neutral-400 sm:flex-row sm:items-center sm:justify-between">
        <span>
          The team-token vault is in testing on Solana’s test network until it’s audited. You can
          try it free.
        </span>
        <Link href="/try" className="shrink-0 text-neutral-300 hover:text-primary">
          Try the vault →
        </Link>
      </div>
    </section>
  );
}
