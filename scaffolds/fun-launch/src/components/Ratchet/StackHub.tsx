const NODES = [
  { x: 120, y: 70, name: 'DBC', role: 'Launch curve', icon: 'ph--chart-line-up-bold' },
  { x: 120, y: 250, name: 'Met Lock', role: 'Team vesting', icon: 'ph--lock-key-bold' },
  { x: 680, y: 70, name: 'DAMM v2', role: 'Graduated pool, LP locked', icon: 'ph--drop-bold' },
  { x: 680, y: 250, name: 'DLMM', role: 'Unlock sell ladder', icon: 'ph--stairs-bold' },
];
const CENTER = { x: 400, y: 160 };

/** The token at the center, wired to the four Meteora programs it lives on. */
export function StackHub() {
  return (
    <div className="relative mx-auto w-full max-w-4xl">
      <svg viewBox="0 0 800 320" className="w-full" aria-hidden>
        {NODES.map((n, i) => {
          const d = `M${n.x},${n.y} L${CENTER.x},${CENTER.y}`;
          return (
            <g key={n.name}>
              <path d={d} stroke="rgb(var(--neutral-700))" strokeWidth="1" strokeDasharray="3 5" fill="none" />
              <circle r="3" fill="rgb(var(--primary))" className="motion-reduce:hidden">
                <animateMotion dur={`${2.6 + i * 0.4}s`} repeatCount="indefinite" path={d} />
              </circle>
            </g>
          );
        })}
        <circle cx={CENTER.x} cy={CENTER.y} r="64" fill="rgb(var(--primary) / 0.08)" />
        <circle cx={CENTER.x} cy={CENTER.y} r="44" fill="rgb(var(--neutral-900))" stroke="rgb(var(--primary) / 0.5)" />
      </svg>
      {/* HTML overlays keep text crisp and icons from the shared icon set */}
      <div
        className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
        style={{ left: `${(CENTER.x / 800) * 100}%`, top: `${(CENTER.y / 320) * 100}%` }}
      >
        <span className="iconify ph--arrow-fat-lines-up-fill h-7 w-7 text-primary sm:h-9 sm:w-9" />
      </div>
      {NODES.map((n) => (
        <div
          key={n.name}
          className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 text-center"
          style={{ left: `${(n.x / 800) * 100}%`, top: `${(n.y / 320) * 100}%` }}
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-800 bg-neutral-925 text-neutral-200 sm:h-14 sm:w-14">
            <span className={`iconify h-5 w-5 sm:h-6 sm:w-6 ${n.icon}`} />
          </span>
          <span className="whitespace-nowrap text-xs font-medium sm:text-sm">{n.name}</span>
          <span className="hidden whitespace-nowrap text-xs text-neutral-500 sm:block">{n.role}</span>
        </div>
      ))}
    </div>
  );
}
