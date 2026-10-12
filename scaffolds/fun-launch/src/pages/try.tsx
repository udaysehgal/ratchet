import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import { Keypair, Transaction } from '@solana/web3.js';
import { useUnifiedWalletContext, useWallet } from '@jup-ag/wallet-adapter';
import { toast } from 'sonner';
import Page from '@/components/ui/Page/Page';
import { Button } from '@/components/ui/button';
import { ProgressBar } from '@/components/Ratchet/ProgressBar';
import { signSubmitConfirm } from '@/lib/walletTx';
import type { TryState } from '@/server/try';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'ratchet-try-pool';
const NEEDED_SOL = 0.7;
const devnet = (kind: 'account' | 'tx', id: string) => `https://solscan.io/${kind}/${id}?cluster=devnet`;
const tokens = (raw: number) => (raw / 1e6).toLocaleString('en-US', { maximumFractionDigits: 0 });

type Action = 'launch' | 'buy' | 'graduate' | 'claim-vested' | 'create-pair' | 'ask';
type Refusal = { refused: boolean; error: string | null; log: string[] };

function Step({
  n,
  title,
  done,
  active,
  children,
}: {
  n: number;
  title: string;
  done: boolean;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className={cn('panel flex gap-4 p-5 transition-opacity sm:p-6', !active && !done && 'opacity-50')}>
      <span
        className={cn(
          'num flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold',
          done ? 'bg-emerald/15 text-emerald' : active ? 'bg-primary text-white' : 'bg-neutral-900 text-neutral-500'
        )}
      >
        {done ? <span className="iconify ph--check-bold h-4 w-4" /> : n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </li>
  );
}

export default function TryPage() {
  const router = useRouter();
  const { publicKey, signTransaction } = useWallet();
  const { setShowModal } = useUnifiedWalletContext();
  const user = publicKey?.toBase58();
  const [pool, setPool] = useState<string | null>(null);
  const [pending, setPending] = useState<Action | null>(null);
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [refusals, setRefusals] = useState<Record<string, Refusal>>({});

  // Resume from ?pool= or the last launch in this browser
  useEffect(() => {
    if (!router.isReady) return;
    const fromUrl = typeof router.query.pool === 'string' ? router.query.pool : null;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {
      // storage unavailable: start fresh
    }
    setPool(fromUrl ?? saved);
  }, [router.isReady, router.query.pool]);

  const { data, refetch } = useQuery(
    ['try-state', pool, user],
    async () => {
      const q = new URLSearchParams();
      if (pool) q.set('pool', pool);
      if (user) q.set('user', user);
      const res = await fetch(`/api/try/state?${q}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Failed to read devnet');
      return body as { sol: number | null; state: TryState | null };
    },
    { enabled: router.isReady, refetchInterval: 6_000 }
  );
  const s = data?.state ?? null;
  const sol = data?.sol ?? null;

  const run = useCallback(
    async (action: Action, extra: Record<string, string> = {}) => {
      if (!publicKey || !signTransaction) {
        setShowModal(true);
        return;
      }
      setPending(action);
      try {
        const res = await fetch('/api/try/tx', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, user: publicKey.toBase58(), pool, ...extra }),
        });
        const built = await res.json();
        if (!res.ok) throw new Error(built.error ?? 'Failed to build transaction');
        await signSubmitConfirm(
          Transaction.from(Buffer.from(built.tx, 'base64')),
          signTransaction,
          (built.coSigners ?? []).map((k: string) => Keypair.fromSecretKey(Buffer.from(k, 'base64'))),
          'devnet'
        );
        if (built.pool) {
          setPool(built.pool);
          try {
            localStorage.setItem(STORAGE_KEY, built.pool);
          } catch {
            // storage unavailable: the URL still carries it
          }
          router.replace({ pathname: '/try', query: { pool: built.pool } }, undefined, { shallow: true });
        }
        toast.success(`Done: ${built.description}`);
        await refetch();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Transaction failed');
      } finally {
        setPending(null);
      }
    },
    [publicKey, signTransaction, setShowModal, pool, router, refetch]
  );

  const tryRefusal = async (kind: 'below-floor' | 'over-cap'): Promise<void> => {
    if (!user || !pool) {
      setShowModal(true);
      return;
    }
    const res = await fetch('/api/try/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user, pool, kind }),
    });
    const body = await res.json();
    if (!res.ok) {
      toast.error(body.error ?? 'Simulation failed');
      return;
    }
    setRefusals((r) => ({ ...r, [kind]: body as Refusal }));
  };

  const startOver = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // nothing to clear
    }
    setPool(null);
    setRefusals({});
    router.replace('/try', undefined, { shallow: true });
  };

  const launched = !!s;
  const filled = !!s && s.raised >= s.threshold;
  const graduated = !!s?.graduated;
  const claimed = (s?.vaultHolds ?? 0) > 0;
  const paired = !!s?.pair;
  const asked = (s?.orders ?? 0) > 0;
  const busy = pending !== null;

  return (
    <Page>
      <Head>
        <title>Try the vault - Ratchet</title>
      </Head>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 py-10 md:py-16">
        <header className="flex flex-col gap-4">
          <span className="eyebrow inline-flex items-center gap-2 text-primary">
            <span className="iconify ph--asterisk-bold h-3.5 w-3.5" />
            Devnet · free test SOL · your own wallet
          </span>
          <h1 className="display text-4xl md:text-6xl">Launch a vaulted token yourself</h1>
          <p className="text-neutral-400 md:text-lg">
            Seven steps, about five minutes. You launch a token whose team allocation goes into a
            ratchet-vault, take it to graduation, then try to sell the team’s tokens below the floor
            and watch the program refuse.
          </p>
        </header>

        <section className="panel flex flex-col gap-3 p-5 sm:p-6">
          <h2 className="font-semibold">Before you start</h2>
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm text-neutral-400">
            <li>
              Switch your wallet to <span className="text-foreground">Devnet</span> (Phantom: Settings → Developer
              settings → Testnet mode → Solana Devnet).
            </li>
            <li>
              Get about {NEEDED_SOL} devnet SOL from{' '}
              <a className="text-primary hover:underline" href="https://faucet.solana.com" target="_blank" rel="noreferrer">
                faucet.solana.com
              </a>
              . It’s free and has no value.
            </li>
          </ol>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {user ? (
              <span className="num text-neutral-300">
                Your devnet balance: {sol === null ? '…' : `${sol.toFixed(3)} SOL`}
                {sol !== null && sol < NEEDED_SOL && <span className="text-amber"> (top up first)</span>}
              </span>
            ) : (
              <Button onClick={() => setShowModal(true)}>Connect wallet</Button>
            )}
            {pool && (
              <button type="button" onClick={startOver} className="text-neutral-500 hover:text-foreground">
                Start a new launch
              </button>
            )}
          </div>
        </section>

        <ol className="flex flex-col gap-4">
          <Step n={1} title="Launch, with the team allocation going to a vault" done={launched} active={!launched}>
            {launched ? (
              <p className="text-sm text-neutral-400">
                Token and vault created in one transaction. The DBC pool’s creator is now the vault, so the team
                allocation will never touch your wallet.{' '}
                <a className="text-primary hover:underline" href={devnet('account', s!.vault)} target="_blank" rel="noreferrer">
                  Vault ↗
                </a>
              </p>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  className="w-full rounded-xl border border-neutral-750 bg-neutral-950 p-3 text-sm placeholder:text-neutral-600 focus:border-primary/60 focus:outline-none"
                  placeholder="Token name"
                  value={name}
                  maxLength={32}
                  onChange={(e) => setName(e.target.value)}
                />
                <input
                  className="num w-full rounded-xl border border-neutral-750 bg-neutral-950 p-3 text-sm uppercase placeholder:text-neutral-600 focus:border-primary/60 focus:outline-none sm:w-40"
                  placeholder="TICKER"
                  value={symbol}
                  maxLength={10}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                />
                <Button disabled={busy} onClick={() => run('launch', { name, symbol })}>
                  {pending === 'launch' ? 'Confirm in wallet…' : 'Launch'}
                </Button>
              </div>
            )}
          </Step>

          <Step n={2} title="Fill the bonding curve" done={filled} active={launched && !filled}>
            {s && (
              <>
                <ProgressBar value={Math.min(1, s.raised / s.threshold)} />
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <span className="num text-neutral-400">
                    {s.raised.toFixed(3)} / {s.threshold} SOL raised
                  </span>
                  {!filled && (
                    <Button disabled={busy} onClick={() => run('buy')}>
                      {pending === 'buy' ? 'Confirm in wallet…' : `Buy ${(s.threshold * 1.1).toFixed(2)} SOL`}
                    </Button>
                  )}
                </div>
              </>
            )}
          </Step>

          <Step n={3} title="Graduate to Meteora DAMM v2" done={graduated} active={filled && !graduated}>
            <p className="text-sm text-neutral-400">
              Two transactions: Meteora Lock creates the team vesting escrow (recipient: the vault), then the pool
              migrates into DAMM v2 with its LP locked forever.
            </p>
            {filled && !graduated && (
              <Button className="w-fit" disabled={busy} onClick={() => run('graduate')}>
                {pending === 'graduate' ? 'Confirm in wallet…' : s?.escrow ? 'Migrate to DAMM v2' : 'Create the vesting escrow'}
              </Button>
            )}
          </Step>

          <Step n={4} title="Claim the vested team tokens" done={claimed} active={graduated && !claimed}>
            {s && graduated && (
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-neutral-850 bg-neutral-850 text-sm">
                <div className="bg-neutral-950 p-3">
                  <div className="eyebrow">Vault holds</div>
                  <div className="num text-lg">{tokens(s.vaultHolds)}</div>
                </div>
                <div className="bg-neutral-950 p-3">
                  <div className="eyebrow">Team tokens in your wallet</div>
                  <div className="num text-lg">0</div>
                </div>
              </div>
            )}
            <p className="text-sm text-neutral-400">
              You’re the team. Claiming is permissionless, but the tokens can only land in the vault.
            </p>
            {graduated && !claimed && (
              <Button className="w-fit" disabled={busy} onClick={() => run('claim-vested')}>
                {pending === 'claim-vested' ? 'Confirm in wallet…' : 'Claim into the vault'}
              </Button>
            )}
          </Step>

          <Step n={5} title="Open the DLMM market for unlocks" done={paired} active={claimed && !paired}>
            <p className="text-sm text-neutral-400">
              Creates the token’s Meteora DLMM pair at the graduation price. DLMM asks the creator to hold some of the
              token, and you do: you bought on the curve.
            </p>
            {claimed && !paired && (
              <Button className="w-fit" disabled={busy} onClick={() => run('create-pair')}>
                {pending === 'create-pair' ? 'Confirm in wallet…' : 'Create the DLMM pair'}
              </Button>
            )}
          </Step>

          <Step n={6} title="Try to dump below the floor" done={!!refusals['below-floor']?.refused} active={paired}>
            <p className="text-sm text-neutral-400">
              Ask the vault to sell team tokens one price step under 1.25× the graduation price. We simulate it, so
              nothing is signed.
            </p>
            {paired && (
              <div className="flex flex-col gap-2">
                <Button variant="outline" className="w-fit" onClick={() => tryRefusal('below-floor')}>
                  Sell just under 1.25×
                </Button>
                {refusals['below-floor'] && (
                  <div className="rounded-xl border border-rose/40 bg-rose/10 p-3 text-sm">
                    <div className="font-medium text-rose">
                      {refusals['below-floor'].refused ? `Refused by the program: ${refusals['below-floor'].error}` : 'Unexpectedly accepted'}
                    </div>
                    {refusals['below-floor'].log.map((l) => (
                      <div key={l} className="num break-all text-xs text-neutral-400">{l}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Step>

          <Step n={7} title="Sell into strength" done={asked} active={paired && !asked}>
            <p className="text-sm text-neutral-400">
              Place asks at 1.25× and 2× the graduation price. The vault allows at most 10% of its balance per day, so
              this uses today’s whole allowance.
            </p>
            {paired && !asked && (
              <Button className="w-fit" disabled={busy} onClick={() => run('ask')}>
                {pending === 'ask' ? 'Confirm in wallet…' : 'Place the asks'}
              </Button>
            )}
            {asked && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="outline" className="w-fit" onClick={() => tryRefusal('over-cap')}>
                    Try to sell more today
                  </Button>
                  {refusals['over-cap'] && (
                    <span className="text-sm text-rose">Refused: {refusals['over-cap'].error}</span>
                  )}
                </div>
                <Link href={`/vault?address=${s!.vault}`} className="w-fit text-sm font-medium text-primary hover:underline">
                  See your vault live →
                </Link>
              </div>
            )}
          </Step>
        </ol>
      </div>
    </Page>
  );
}
