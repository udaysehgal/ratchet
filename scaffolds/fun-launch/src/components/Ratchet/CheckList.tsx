import { useQuery } from '@tanstack/react-query';
import type { Check, CheckStatus } from '@/lib/launchCheck';
import type { LaunchCheck } from '@/server/check';
import { cn } from '@/lib/utils';

const STATUS: Record<CheckStatus, { icon: string; className: string; label: string }> = {
  pass: { icon: 'ph--check-circle-fill', className: 'text-emerald', label: 'Pass' },
  warn: { icon: 'ph--warning-fill', className: 'text-amber', label: 'Caution' },
  fail: { icon: 'ph--x-circle-fill', className: 'text-rose', label: 'Risk' },
  info: { icon: 'ph--info-fill', className: 'text-neutral-500', label: 'Info' },
};

export const OVERALL_LABEL: Record<CheckStatus, string> = {
  pass: 'No red flags',
  warn: 'Check the cautions',
  fail: 'Red flags found',
  info: 'Info',
};

export function useLaunchCheck(mint: string | undefined) {
  return useQuery(
    ['check', mint],
    async () => {
      const res = await fetch(`/api/check/${mint}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Check failed');
      return body as LaunchCheck;
    },
    { enabled: !!mint, staleTime: 30_000, retry: false }
  );
}

export function StatusIcon({ status, className }: { status: CheckStatus; className?: string }) {
  const s = STATUS[status];
  return (
    <span
      role="img"
      aria-label={s.label}
      className={cn('iconify h-5 w-5 shrink-0', s.icon, s.className, className)}
    />
  );
}

export function CheckList({ checks }: { checks: Check[] }) {
  return (
    <ul className="flex flex-col divide-y divide-neutral-900">
      {checks.map((c) => (
        <li key={c.id} className="flex gap-3 py-3">
          <StatusIcon status={c.status} className="mt-0.5" />
          <div>
            <div className="font-medium">{c.title}</div>
            <p className="text-sm text-neutral-400">{c.detail}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
