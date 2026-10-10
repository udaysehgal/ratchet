import { cn } from '@/lib/utils';

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-neutral-850', className)}
    >
      <div
        className={cn('h-full rounded-full', pct >= 100 ? 'bg-emerald' : 'bg-primary')}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
