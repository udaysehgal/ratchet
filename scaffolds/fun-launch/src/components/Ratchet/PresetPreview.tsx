import { useQuery } from '@tanstack/react-query';
import type { PresetPreview as Preview } from '@/server/meteora';
import { formatDuration, formatSol } from '@/lib/format/ratchet';
import { CurveChart } from './CurveChart';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-t border-neutral-850 py-2 text-sm">
      <span className="shrink-0 text-neutral-400">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

/** Live, on-chain parameters of the selected preset's DBC config, plus its curve. */
export function PresetPreview({ presetId }: { presetId: string }) {
  const { data, isLoading, error } = useQuery(['presets'], async () => {
    const res = await fetch('/api/presets');
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? 'Failed to load presets');
    return body.presets as Preview[];
  });

  if (isLoading) return <p className="text-sm text-neutral-500">Reading preset from chain…</p>;
  if (error || !data) return <p className="text-sm text-rose">Couldn&apos;t load preset details.</p>;
  const p = data.find((x) => x.id === presetId);
  if (!p) return null;

  const fee =
    p.feeDecaySeconds > 0
      ? `${p.startFeePct.toFixed(0)}% → ${p.endFeePct.toFixed(1)}% over ${formatDuration(p.feeDecaySeconds)}`
      : `${p.startFeePct.toFixed(1)}% flat`;

  return (
    <div className="flex flex-col gap-5">
      <CurveChart
        points={p.points}
        label="Market cap (SOL) as SOL is raised on the curve"
      />
      <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
        <Row label="Raise to graduate" value={`${formatSol(p.thresholdSol, 2)} SOL`} />
        <Row
          label="Market cap: start → graduation"
          value={`${formatSol(p.startMcapSol, 1)} → ${formatSol(p.graduationMcapSol, 1)} SOL`}
        />
        <Row label="Trading fee" value={`${fee}${p.dynamicFee ? ' + volatility fee' : ''}`} />
        <Row label="Your share of curve fees" value={`${p.creatorFeeSharePct}%`} />
        <Row
          label="Team allocation (vested)"
          value={`${p.teamAllocationPct.toFixed(0)}%: ${p.teamCliffUnlockPct.toFixed(0)}% ${formatDuration(p.teamCliffSeconds)} after graduation, rest every ${formatDuration(p.teamPeriodSeconds)} × ${p.teamPeriods}`}
        />
        <Row label="After graduation" value="DAMM v2, 100% LP locked, fees compound" />
        <Row label="Launch fee" value={`${formatSol(p.launchFeeSol, 3)} SOL`} />
        <a
          href={`https://solscan.io/account/${p.config}${process.env.NEXT_PUBLIC_NETWORK === 'mainnet' ? '' : '?cluster=devnet'}`}
          target="_blank"
          rel="noreferrer"
          className="mt-2 text-xs text-neutral-500 hover:text-foreground sm:col-span-2"
        >
          DBC config {p.config.slice(0, 4)}…{p.config.slice(-4)} ↗
        </a>
      </div>
    </div>
  );
}
