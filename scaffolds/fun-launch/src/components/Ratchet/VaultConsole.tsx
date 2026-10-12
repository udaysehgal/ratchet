import Link from 'next/link';
import { cn } from '@/lib/utils';

/** The vault's answers, taken from its real program errors (docs/EVIDENCE.md). */
const ROWS = [
  { ask: 'Sell 1M team tokens at 1.24×', ok: false, answer: 'BelowFloor' },
  { ask: 'Lower the floor to 1.10×', ok: false, answer: 'FloorCannotDecrease' },
  { ask: 'Sell 15% of the vault today', ok: false, answer: 'DailyCapExceeded' },
  { ask: 'Ask 1M at 1.25×, fills on the way up', ok: true, answer: 'Order placed' },
];

export function VaultConsole({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950/85 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] backdrop-blur-md',
        className
      )}
    >
      <div className="flex items-center justify-between border-b border-neutral-850 px-5 py-3.5">
        <span className="font-mono text-xs text-neutral-400">ratchet-vault</span>
        <span className="rounded-full border border-primary/40 px-2.5 py-0.5 font-mono text-[11px] text-primary">
          floor 1.25× · rises only
        </span>
      </div>
      <ul className="divide-y divide-neutral-850">
        {ROWS.map((r) => (
          <li key={r.ask} className="flex items-center justify-between gap-4 px-5 py-3.5">
            <span className="text-sm text-neutral-200">{r.ask}</span>
            <span
              className={cn(
                'flex shrink-0 items-center gap-1.5 font-mono text-xs',
                r.ok ? 'text-emerald' : 'text-rose'
              )}
            >
              <span className={cn('iconify h-3.5 w-3.5', r.ok ? 'ph--check-bold' : 'ph--x-bold')} />
              {r.answer}
            </span>
          </li>
        ))}
      </ul>
      <Link
        href="/vault"
        className="flex items-center justify-between border-t border-neutral-850 px-5 py-3 text-xs text-neutral-400 hover:text-foreground"
      >
        Real answers from the vault program
        <span className="iconify ph--arrow-right h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
