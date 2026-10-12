// Regenerates docs/img/preset-curves-{light,dark}.svg from the live presets API.
// Usage: node scripts/make-figures.mjs [baseUrl]
import { writeFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'https://www.useratchet.xyz';
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

// ---------- Unlock study: what DBC teams did with unlocked tokens ----------
import { readFileSync } from 'node:fs';
const study = JSON.parse(readFileSync(new URL('../docs/evidence/unlock-study.json', import.meta.url), 'utf8'));
const big = (x) => BigInt(x);
const unlocked = study.escrows.filter((e) => big(e.vested) > 0n);
const claimed = unlocked.filter((e) => big(e.claimed) > 0n);
const movedMost = claimed.filter((e) => big(e.movedOfClaimed) * 10n >= big(e.claimed) * 9n).length;
const keptMost = claimed.filter((e) => big(e.movedOfClaimed) * 10n <= big(e.claimed)).length;
const bars = [
  { label: 'Claimed, then moved ≥90% out of the team wallet', n: movedMost, highlight: true },
  { label: 'Unlocked but never claimed', n: unlocked.length - claimed.length },
  { label: 'Claimed and kept ≥90%', n: keptMost },
  { label: 'Claimed, partly moved', n: claimed.length - movedMost - keptMost },
];
const SW = 760, SH = 300, LEFT = 330, RIGHT = 90, TOP = 74, ROW = 44;
function studySvg(theme) {
  const t = THEMES[theme];
  const hi = theme === 'light' ? '#eb6834' : '#d95926';
  const lo = theme === 'light' ? '#c4c9cf' : '#4a5058';
  const max = Math.max(...bars.map((b) => b.n));
  const o = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SW} ${SH}" width="${SW}" height="${SH}" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif" role="img" aria-labelledby="st sd">`,
    `<title id="st">What Meteora DBC teams did with unlocked tokens</title>`,
    `<desc id="sd">${esc(bars.map((b) => `${b.label}: ${b.n}`).join('. '))}. Out of ${unlocked.length} unlocked team allocations on mainnet.</desc>`,
    `<rect width="${SW}" height="${SH}" rx="8" fill="${t.surface}"/>`,
    `<text x="24" y="30" font-size="15" font-weight="600" fill="${t.text}">What DBC teams did with unlocked tokens</text>`,
    `<text x="24" y="48" font-size="12" fill="${t.muted}">All ${unlocked.length.toLocaleString('en-US')} team allocations on Meteora DBC mainnet that have started unlocking (${study.generatedAt.slice(0, 10)})</text>`,
  ];
  bars.forEach((b, i) => {
    const y = TOP + i * ROW;
    const w = ((SW - LEFT - RIGHT) * b.n) / max;
    const pct = ((100 * b.n) / unlocked.length).toFixed(0);
    o.push(
      `<text x="${LEFT - 12}" y="${y + 17}" font-size="12" text-anchor="end" fill="${b.highlight ? t.text : t.muted}" font-weight="${b.highlight ? 600 : 400}">${esc(b.label)}</text>`,
      `<rect x="${LEFT}" y="${y + 4}" width="${Math.max(w, 2).toFixed(1)}" height="20" rx="4" fill="${b.highlight ? hi : lo}"/>`,
      `<text x="${LEFT + w + 8}" y="${y + 18}" font-size="12" fill="${t.text}">${b.n.toLocaleString('en-US')} · ${pct}%</text>`
    );
  });
  o.push(`<text x="24" y="${SH - 16}" font-size="11" fill="${t.muted}">Source: every Meteora Lock escrow created by the DBC pool authority, read from mainnet. Data: docs/evidence/unlock-study.json</text>`, '</svg>');
  return o.join('\n');
}
for (const theme of Object.keys(THEMES)) {
  writeFileSync(new URL(`../docs/img/unlock-study-${theme}.svg`, import.meta.url), studySvg(theme));
}
console.log('unlock study:', bars.map((b) => `${b.n}`).join(' / '), 'of', unlocked.length);
console.log(lines.map((l) => `${l.label}: ${fmtMult(l.end)}x`).join(' | '));
