// Regenerates docs/img/preset-curves-{light,dark}.svg from the live presets API.
// Usage: node scripts/make-figures.mjs [baseUrl]
import { writeFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'https://ratchet-olive.vercel.app';
const { presets } = await (await fetch(`${BASE}/api/presets`)).json();
const byId = Object.fromEntries(presets.map((p) => [p.id, p]));

// Fair raise and equity raise share one curve shape (equity is the same curve priced in TSLAx)
const SERIES = [
  { id: 'micro-raise', label: 'Micro raise' },
  { id: 'anti-sniper', label: 'Anti-sniper' },
  { id: 'fair-raise', label: 'Fair & equity raise' },
];
// dataviz reference palette, slots 1-3, validated against GitHub's light and dark surfaces
const THEMES = {
  light: { surface: '#ffffff', text: '#1f2328', muted: '#59636e', grid: '#d1d9e0', series: ['#2a78d6', '#eb6834', '#1baf7a'] },
  dark: { surface: '#0d1117', text: '#f0f6fc', muted: '#9198a1', grid: '#3d444d', series: ['#3987e5', '#d95926', '#199e70'] },
};

const W = 760;
const H = 380;
const PAD = { top: 56, right: 160, bottom: 56, left: 64 };
const Y_MAX_LOG = 3; // 1000x
const x = (pct) => PAD.left + (pct / 100) * (W - PAD.left - PAD.right);
const y = (mult) => H - PAD.bottom - (Math.log10(Math.max(mult, 1)) / Y_MAX_LOG) * (H - PAD.top - PAD.bottom);

const lines = SERIES.map((s) => {
  const pts = byId[s.id].points;
  const total = pts[pts.length - 1].raisedSol;
  const m0 = pts[0].mcapSol;
  return {
    ...s,
    xy: pts.map((pt) => [x((pt.raisedSol / total) * 100), y(pt.mcapSol / m0)]),
    end: pts[pts.length - 1].mcapSol / m0,
  };
});
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmtMult = (m) => (m < 2 ? m.toFixed(2) : Math.round(m).toString());

function svg(theme) {
  const t = THEMES[theme];
  const o = [];
  o.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif" role="img" aria-labelledby="t d">`,
    `<title id="t">How far price moves on each Ratchet preset</title>`,
    `<desc id="d">Price relative to the opening price as the curve fills to graduation. ${esc(lines.map((l) => `${l.label}: ${fmtMult(l.end)}x at graduation`).join('. '))}.</desc>`,
    `<rect width="${W}" height="${H}" rx="8" fill="${t.surface}"/>`,
    `<text x="${PAD.left}" y="26" font-size="15" font-weight="600" fill="${t.text}">How far price moves before graduation</text>`,
    `<text x="${PAD.left}" y="44" font-size="12" fill="${t.muted}">Price vs. opening price (log scale) as the curve fills. Read live from each preset's DBC config.</text>`
  );
  for (const [m, label] of [[1, '1×'], [10, '10×'], [100, '100×'], [1000, '1000×']]) {
    o.push(
      `<line x1="${PAD.left}" x2="${W - PAD.right}" y1="${y(m)}" y2="${y(m)}" stroke="${t.grid}" stroke-width="1"/>`,
      `<text x="${PAD.left - 10}" y="${y(m) + 4}" font-size="11" text-anchor="end" fill="${t.muted}">${label}</text>`
    );
  }
  for (const pct of [0, 25, 50, 75, 100]) {
    o.push(`<text x="${x(pct)}" y="${H - PAD.bottom + 20}" font-size="11" text-anchor="middle" fill="${t.muted}">${pct}%</text>`);
  }
  o.push(
    `<text x="${(PAD.left + W - PAD.right) / 2}" y="${H - 12}" font-size="12" text-anchor="middle" fill="${t.muted}">Share of the graduation raise filled</text>`
  );
  lines.forEach((l, i) => {
    const c = t.series[i];
    const d = l.xy.map(([px, py], j) => `${j ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join('');
    const [ex, ey] = l.xy[l.xy.length - 1];
    o.push(
      `<path d="${d}" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`,
      `<circle cx="${ex}" cy="${ey}" r="4.5" fill="${c}" stroke="${t.surface}" stroke-width="2"/>`,
      `<text x="${ex + 12}" y="${ey - 2}" font-size="12" font-weight="600" fill="${t.text}">${esc(l.label)}</text>`,
      `<text x="${ex + 12}" y="${ey + 13}" font-size="11" fill="${t.muted}">${fmtMult(l.end)}× at graduation</text>`
    );
  });
  o.push('</svg>');
  return o.join('\n');
}

for (const theme of Object.keys(THEMES)) {
  writeFileSync(new URL(`../docs/img/preset-curves-${theme}.svg`, import.meta.url), svg(theme));
}
console.log(lines.map((l) => `${l.label}: ${fmtMult(l.end)}x`).join(' | '));
