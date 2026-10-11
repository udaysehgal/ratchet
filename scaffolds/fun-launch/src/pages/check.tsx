import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Page from '@/components/ui/Page/Page';
import { Button } from '@/components/ui/button';
import { CheckList, OVERALL_LABEL, StatusIcon, useLaunchCheck } from '@/components/Ratchet/CheckList';
import { explorerUrl } from '@/lib/format/ratchet';

export default function CheckPage() {
  const router = useRouter();
  const mint = typeof router.query.mint === 'string' ? router.query.mint : undefined;
  const [input, setInput] = useState('');
  const { data, isFetching, error } = useLaunchCheck(mint);
  useEffect(() => {
    if (mint) setInput(mint);
  }, [mint]);

  return (
    <Page>
      <Head>
        <title>Launch check - Ratchet</title>
      </Head>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 py-10 md:py-16">
        <div className="flex flex-col gap-4">
          <span className="eyebrow inline-flex items-center gap-2 text-primary">
            <span className="iconify ph--asterisk-bold h-3.5 w-3.5" />
            Any Meteora DBC token
          </span>
          <h1 className="display text-4xl md:text-6xl">Check a launch before you buy</h1>
          <p className="max-w-2xl text-neutral-400 md:text-lg">
            Paste a token address. We read its Meteora DBC config and mint from chain and tell
            you whether liquidity can be pulled, what the team holds, and where the raise goes.
          </p>
        </div>

        <form
          className="flex flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            const value = input.trim();
            if (value) router.push({ pathname: '/check', query: { mint: value } }, undefined, { shallow: true });
          }}
        >
          <label htmlFor="mint" className="sr-only">
            Token address
          </label>
          <input
            id="mint"
            className="num w-full rounded-full border border-neutral-750 bg-neutral-950 px-5 py-3 text-sm text-foreground placeholder:text-neutral-600 focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/40"
            placeholder="Token mint address"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
          />
          <Button type="submit" size="lg" disabled={!input.trim() || isFetching}>
            {isFetching ? 'Reading chain…' : 'Check'}
          </Button>
        </form>

        {error && mint && (
          <p className="text-rose">{error instanceof Error ? error.message : 'Check failed'}</p>
        )}

        {data && (
          <section className="panel flex flex-col gap-2 p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-900 pb-4">
              <div>
                <div className="text-xl font-semibold">
                  {data.symbol} <span className="font-normal text-neutral-500">{data.name}</span>
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-neutral-500">
                  <a className="num hover:text-primary" href={explorerUrl(data.pool)} target="_blank" rel="noreferrer">
                    DBC pool ↗
                  </a>
                  <a className="num hover:text-primary" href={explorerUrl(data.config)} target="_blank" rel="noreferrer">
                    Config ↗
                  </a>
                  {data.isRatchet && (
                    <Link className="hover:text-primary" href={`/token/${data.mint}`}>
                      Ratchet launch →
                    </Link>
                  )}
                </div>
              </div>
              <span className="inline-flex items-center gap-2 font-medium">
                <StatusIcon status={data.overall} />
                {OVERALL_LABEL[data.overall]}
              </span>
            </div>
            <CheckList checks={data.checks} />
          </section>
        )}

        <p className="text-sm text-neutral-500">
          Also available as JSON for bots and terminals:{' '}
          <code className="num text-neutral-300">GET /api/check/&lt;mint&gt;</code>
        </p>
      </div>
    </Page>
  );
}
