import { cn } from '@/lib/utils';

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const done = pct >= 100;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={cn(
        'relative h-2 w-full overflow-hidden rounded-full bg-neutral-850',
        className
      )}
    >
      <div
        className={cn(
          'relative h-full overflow-hidden rounded-full transition-[width] duration-700 ease-out',
          done
            ? 'bg-emerald'
            : 'bg-gradient-to-r from-primary-500 to-primary'
        )}
        style={{ width: `${Math.max(pct, pct > 0 ? 2 : 0)}%` }}
      >
        {!done && pct > 0 && (
          <span className="absolute inset-y-0 left-0 w-1/3 animate-bar-shine bg-gradient-to-r from-transparent via-white/40 to-transparent motion-reduce:hidden" />
        )}
      </div>
    </div>
  );
}
