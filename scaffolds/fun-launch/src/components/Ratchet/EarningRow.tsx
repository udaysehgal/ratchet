import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useRatchetTx, type Earning } from '@/hooks/useRatchet';
import { formatSol, formatTokens } from '@/lib/format/ratchet';

export function earningTotalSol(e: Earning) {
  return e.dbcQuote + e.creationFee + e.dammQuote;
}

/** One launch's claimable fees for the connected wallet, with a single claim button. */
export function EarningRow({ earning, showToken = true }: { earning: Earning; showToken?: boolean }) {
  const { run, pending } = useRatchetTx(earning.baseMint);
  const totalSol = earningTotalSol(earning);
  const totalTokens = earning.dbcBase + earning.dammBase;
  const nothing = totalSol <= 0 && totalTokens <= 0;

  const lines = [
    { label: 'Curve trading fees (DBC)', value: earning.dbcQuote },
    { label: 'Launch fee (90% partner share)', value: earning.creationFee },
    { label: 'Locked LP fees (DAMM v2)', value: earning.dammQuote },
  ].filter((l) => l.value > 0);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-neutral-850 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        {showToken ? (
          <Link href={`/token/${earning.baseMint}`} className="font-semibold hover:underline">
            {earning.symbol}
          </Link>
        ) : (
          <span className="font-semibold">Your fees</span>
        )}
        <span className="text-xs text-neutral-500">as {earning.roles.join(' + ')}</span>
      </div>
      {lines.length > 0 && (
        <ul className="space-y-1 text-sm">
          {lines.map((l) => (
            <li key={l.label} className="flex justify-between gap-3">
              <span className="text-neutral-400">{l.label}</span>
              <span>{formatSol(l.value, 6)} SOL</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm">
          Total: <strong>{formatSol(totalSol, 6)} SOL</strong>
          {totalTokens > 0 && ` + ${formatTokens(totalTokens)} ${earning.symbol}`}
        </span>
        <Button
          disabled={nothing || pending !== null}
          onClick={() => run({ action: 'claim-fees' })}
        >
          {pending === 'claim-fees' ? 'Confirm in wallet…' : nothing ? 'Nothing to claim' : 'Claim all'}
        </Button>
      </div>
    </div>
  );
}
