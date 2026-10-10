import { useMemo, useState } from 'react';
import { formatSol } from '@/lib/format/ratchet';

type Point = { raisedSol: number; mcapSol: number };

const W = 560;
const H = 200;
const PAD = { top: 16, right: 16, bottom: 30, left: 48 };

function niceMax(value: number) {
  const pow = 10 ** Math.floor(Math.log10(value));
  return [1, 2, 2.5, 5, 10].map((m) => m * pow).find((v) => v >= value) ?? value;
}

/** Market cap (SOL) vs SOL raised along a preset's bonding curve, with a hover readout. */
export function CurveChart({ points, label }: { points: Point[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null);

  const geometry = useMemo(() => {
    const xMax = points[points.length - 1]?.raisedSol ?? 1;
    const yMax = niceMax(Math.max(...points.map((p) => p.mcapSol)) * 1.05);
    const x = (v: number) => PAD.left + (v / xMax) * (W - PAD.left - PAD.right);
    const y = (v: number) => H - PAD.bottom - (v / yMax) * (H - PAD.top - PAD.bottom);
    const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.raisedSol).toFixed(1)},${y(p.mcapSol).toFixed(1)}`).join('');
    const yTicks = [0, yMax / 2, yMax];
    const xTicks = [0, xMax / 2, xMax];
    return { x, y, path, yTicks, xTicks, xMax };
  }, [points]);

  const { x, y, path, yTicks, xTicks, xMax } = geometry;
  const last = points[points.length - 1]!;
  const active = hover !== null ? points[hover]! : null;

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const raised = ((e.clientX - rect.left) / rect.width) * xMax;
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(p.raisedSol - raised) < Math.abs(points[best]!.raisedSol - raised)) best = i;
    });
    setHover(best);
  };

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-xs text-neutral-500">{label}</figcaption>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label}>
          {yTicks.map((t) => (
            <g key={`y${t}`}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="rgb(var(--neutral-850))" />
              <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="rgb(var(--neutral-500))">
                {formatSol(t, 1)}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text key={`x${t}`} x={x(t)} y={H - 10} textAnchor="middle" fontSize="11" fill="rgb(var(--neutral-500))">
              {formatSol(t, 1)} SOL
            </text>
          ))}
          <path d={path} fill="none" stroke="rgb(var(--chart-line))" strokeWidth={2} strokeLinejoin="round" />
          <circle cx={x(last.raisedSol)} cy={y(last.mcapSol)} r={4} fill="rgb(var(--chart-line))" stroke="rgb(var(--background))" strokeWidth={2} />
          <text x={x(last.raisedSol) - 8} y={y(last.mcapSol) - 10} textAnchor="end" fontSize="11" fill="rgb(var(--foreground))">
            Graduates → DAMM v2
          </text>
          {active && (
            <g pointerEvents="none">
              <line x1={x(active.raisedSol)} x2={x(active.raisedSol)} y1={PAD.top} y2={H - PAD.bottom} stroke="rgb(var(--neutral-700))" strokeDasharray="3 3" />
              <circle cx={x(active.raisedSol)} cy={y(active.mcapSol)} r={4} fill="rgb(var(--chart-line))" stroke="rgb(var(--background))" strokeWidth={2} />
            </g>
          )}
          {/* hit area larger than the line */}
          <rect
            x={PAD.left}
            y={PAD.top}
            width={W - PAD.left - PAD.right}
            height={H - PAD.top - PAD.bottom}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
        {active && (
          <div className="pointer-events-none absolute right-2 top-2 rounded-md border border-neutral-750 bg-background px-2 py-1 text-xs">
            <div>Raised: <strong>{formatSol(active.raisedSol, 2)} SOL</strong></div>
            <div>Market cap: <strong>{formatSol(active.mcapSol, 2)} SOL</strong></div>
          </div>
        )}
      </div>
      <details className="text-xs text-neutral-500">
        <summary className="cursor-pointer">Show as table</summary>
        <table className="mt-2 w-full">
          <thead>
            <tr className="text-left">
              <th className="font-normal">SOL raised</th>
              <th className="font-normal">Market cap (SOL)</th>
            </tr>
          </thead>
          <tbody>
            {points.filter((_, i) => i % 8 === 0 || i === points.length - 1).map((p) => (
              <tr key={p.raisedSol}>
                <td>{formatSol(p.raisedSol, 2)}</td>
                <td>{formatSol(p.mcapSol, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
