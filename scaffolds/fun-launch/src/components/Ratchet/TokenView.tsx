import { useMemo, useState } from 'react';
import { useWallet } from '@jup-ag/wallet-adapter';
import { PRESETS } from '@/presets';
import { Button } from '@/components/ui/button';
import { useLaunch, useRatchetTx, type LaunchDetail } from '@/hooks/useRatchet';
import {
  explorerUrl,
  formatDuration,
  formatPercent,
  formatSol,
  formatTokens,
} from '@/lib/format/ratchet';
import { ProgressBar } from './ProgressBar';

const inputClassName =
  'w-full rounded-lg border border-neutral-750 bg-background p-2.5 text-sm text-foreground placeholder:text-neutral-500 focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/40';

// Must match LADDER_MIN_MULTIPLE on the server
const MIN_MULTIPLE = 1.25;
const DEFAULT_MULTIPLES = [1.25, 1.5, 2, 3];

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-neutral-850 bg-neutral-925 p-5">
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-neutral-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function ChainLink({ label, address }: { label: string; address: string | null }) {
  if (!address) return null;
  return (
    <a
      href={explorerUrl(address)}
      target="_blank"
      rel="noreferrer"
      className="rounded-full border border-neutral-750 px-3 py-1 text-xs text-neutral-300 hover:border-neutral-600"
    >
      {label} ↗
    </a>
  );
}

function TradeCard({ launch }: { launch: LaunchDetail }) {
  const { run, pending } = useRatchetTx(launch.baseMint);
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');

  if (launch.migrated) {
    return (
      <Card title="Trade">
        <p className="text-sm text-neutral-400">
          This token graduated. It now trades on its Meteora DAMM v2 pool, where 100% of LP is
          permanently locked and fees compound into liquidity.
        </p>
        <ChainLink label="DAMM v2 pool" address={launch.dammV2Pool} />
      </Card>
    );
  }

  const value = Number(amount);
  return (
    <Card title="Trade on the curve">
      <div className="grid grid-cols-2 gap-2" role="tablist">
        {(['buy', 'sell'] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={side === s}
            onClick={() => setSide(s)}
            className={`rounded-lg border py-2 text-sm font-medium capitalize ${
              side === s ? 'border-primary/70 bg-primary/10' : 'border-neutral-750'
            }`}
          >
            {s}
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-neutral-400">
          {side === 'buy' ? 'Amount (SOL)' : `Amount (${launch.symbol})`}
        </span>
        <input
          className={inputClassName}
          inputMode="decimal"
          placeholder="0.0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </label>
      {side === 'buy' && (
        <p className="text-xs text-neutral-500">
          Buys fill up to the graduation threshold and refund the rest.
        </p>
      )}
      <Button
        disabled={!(value > 0) || pending !== null}
        onClick={async () => {
          if (await run({ action: 'swap', side, amount: value })) setAmount('');
        }}
      >
        {pending === 'swap' ? 'Confirm in wallet…' : side === 'buy' ? 'Buy' : 'Sell'}
      </Button>
    </Card>
  );
}

function LadderTable({ launch }: { launch: LaunchDetail }) {
  if (launch.ladder.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-neutral-850 p-4 text-sm text-neutral-500">
        No unlocks committed to DLMM yet.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-neutral-500">
          <tr>
            <th className="py-1.5 pr-3 font-normal">Rung</th>
            <th className="py-1.5 pr-3 font-normal">Price (SOL)</th>
            <th className="py-1.5 pr-3 font-normal">Unfilled</th>
            <th className="py-1.5 font-normal">Sold for</th>
          </tr>
        </thead>
        <tbody>
          {launch.ladder.map((rung) => (
            <tr key={rung.binId} className="border-t border-neutral-850">
              <td className="py-1.5 pr-3">{rung.multiple.toFixed(2)}× grad</td>
              <td className="py-1.5 pr-3">{formatSol(rung.price)}</td>
              <td className="py-1.5 pr-3">{formatTokens(rung.unfilled)}</td>
              <td className="py-1.5">{formatSol(rung.filledSol)} SOL</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CreatorUnlockControls({ launch }: { launch: LaunchDetail }) {
  const { run, pending } = useRatchetTx(launch.baseMint);
  const [multiples, setMultiples] = useState(DEFAULT_MULTIPLES.map(String));
  const [total, setTotal] = useState('');

  const rungs = useMemo(() => {
    const parsed = multiples.map(Number).filter((m) => m > 0);
    const totalAmount = Number(total);
    if (!(totalAmount > 0) || parsed.length === 0) return [];
    return parsed.map((multiple) => ({ multiple, amount: totalAmount / parsed.length }));
  }, [multiples, total]);
  const invalid = rungs.some((r) => r.multiple < MIN_MULTIPLE);

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <p className="text-sm font-medium">You created this token. Commit your unlocks:</p>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          disabled={!launch.vesting || launch.vesting.claimable <= 0 || pending !== null}
          onClick={() => run({ action: 'claim-vesting' })}
        >
          {pending === 'claim-vesting'
            ? 'Confirm in wallet…'
            : `1. Claim ${formatTokens(launch.vesting?.claimable ?? 0)} vested`}
        </Button>
        <Button
          variant="secondary"
          disabled={!!launch.dlmmPair || pending !== null}
          onClick={() => run({ action: 'create-dlmm-pair' })}
        >
          {launch.dlmmPair
            ? '2. DLMM pair ready ✓'
            : pending === 'create-dlmm-pair'
              ? 'Confirm in wallet…'
              : '2. Create DLMM pair'}
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        <span className="text-sm">3. Ladder: split evenly across rungs (multiples of graduation price)</span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {multiples.map((m, i) => (
            <label key={i} className="flex flex-col gap-1 text-xs text-neutral-400">
              Rung {i + 1} (×)
              <input
                className={inputClassName}
                inputMode="decimal"
                value={m}
                onChange={(e) =>
                  setMultiples((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))
                }
              />
            </label>
          ))}
        </div>
        <label className="flex flex-col gap-1 text-xs text-neutral-400">
          Total tokens to commit
          <input
            className={inputClassName}
            inputMode="decimal"
            placeholder="e.g. 10000000"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
          />
        </label>
        {invalid && (
          <p className="text-xs text-rose">Every rung must be at least {MIN_MULTIPLE}× the graduation price.</p>
        )}
        <Button
          disabled={!launch.dlmmPair || rungs.length === 0 || invalid || pending !== null}
          onClick={async () => {
            if (await run({ action: 'ladder', rungs })) setTotal('');
          }}
        >
          {pending === 'ladder' ? 'Confirm in wallet…' : 'Place ladder on DLMM'}
        </Button>
      </div>
    </div>
  );
}

function UnlocksCard({ launch }: { launch: LaunchDetail }) {
  const { publicKey } = useWallet();
  const isCreator = publicKey?.toBase58() === launch.creator;
  const vesting = launch.vesting;

  return (
    <Card title="Team unlocks">
      {!launch.migrated ? (
        <p className="text-sm text-neutral-400">
          The team allocation stays locked in a Meteora vesting escrow until this token
          graduates. After that, unlocks are committed as DLMM sell orders at{' '}
          {MIN_MULTIPLE}× the graduation price or higher.
        </p>
      ) : (
        <>
          {vesting && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Team allocation" value={formatTokens(vesting.total)} />
              <Stat label="Claimed" value={formatTokens(vesting.claimed)} />
              <Stat label="Claimable now" value={formatTokens(vesting.claimable)} />
              <Stat
                label="Schedule"
                value={`${vesting.periods} × every ${formatDuration(vesting.frequency)}`}
              />
            </div>
          )}
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Committed sell ladder (DLMM)</h3>
            <LadderTable launch={launch} />
          </div>
          {isCreator && <CreatorUnlockControls launch={launch} />}
        </>
      )}
    </Card>
  );
}

export function TokenView({ mint }: { mint: string }) {
  const { data: launch, isLoading, error } = useLaunch(mint);

  if (isLoading) return <p className="p-8 text-center text-neutral-500">Loading from chain…</p>;
  if (error || !launch) {
    return (
      <p className="p-8 text-center text-rose">
        {error instanceof Error ? error.message : 'Token not found'}
      </p>
    );
  }

  const preset = PRESETS.find((p) => p.id === launch.presetId);
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-3xl font-bold tracking-tight">{launch.symbol}</h1>
          <span className="text-neutral-400">{launch.name}</span>
          {preset && (
            <span className="rounded-full border border-neutral-750 px-2 py-0.5 text-xs text-neutral-400">
              {preset.name}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <ChainLink label="Mint" address={launch.baseMint} />
          <ChainLink label="DBC pool" address={launch.pool} />
          <ChainLink label="DAMM v2 pool" address={launch.dammV2Pool} />
          <ChainLink label="DLMM pair" address={launch.dlmmPair} />
        </div>
      </div>

      <Card title={launch.migrated ? 'Graduated' : 'Bonding curve'}>
        <ProgressBar value={launch.progress} className="h-3" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat
            label="Raised"
            value={`${formatSol(launch.quoteReserve, 3)} / ${formatSol(launch.threshold, 3)} SOL`}
          />
          <Stat label="Progress" value={formatPercent(launch.progress)} />
          <Stat label="Price (SOL)" value={formatSol(launch.currentPrice)} />
          <Stat label="Graduation price" value={formatSol(launch.graduationPrice)} />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <UnlocksCard launch={launch} />
        <TradeCard launch={launch} />
      </div>
    </div>
  );
}
