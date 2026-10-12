import registry from './registry.json';

export type Network = 'devnet' | 'mainnet';

/** Registry key, e.g. 'anti-sniper' or 'equity-raise-nvdax' (one per xStock). */
export type PresetId = string;

export type Preset = {
  id: PresetId;
  name: string;
  tagline: string;
  points: string[];
  /** Token the curve raises in: SOL, or an xStock */
  quoteSymbol: string;
  /** Presets that share a card in the picker (the equity raise has one per stock). */
  group: string;
  /** Short label inside a group, e.g. the company name */
  variantLabel?: string;
};

/** xStocks with Meteora token badges on DBC and DAMM v2 that Ratchet has equity-raise configs for. */
export const EQUITY_STOCKS = [
  { id: 'equity-raise', symbol: 'TSLAx', company: 'Tesla' },
  { id: 'equity-raise-nvdax', symbol: 'NVDAx', company: 'NVIDIA' },
  { id: 'equity-raise-aaplx', symbol: 'AAPLx', company: 'Apple' },
  { id: 'equity-raise-googlx', symbol: 'GOOGLx', company: 'Alphabet' },
  { id: 'equity-raise-spyx', symbol: 'SPYx', company: 'S&P 500 ETF' },
  { id: 'equity-raise-qqqx', symbol: 'QQQx', company: 'Nasdaq-100 ETF' },
];

/** Display info. On-chain parameters live in /presets/<network>/<id>.jsonc (created with Invent studio). */
const ALL_PRESETS: Preset[] = [
  {
    id: 'anti-sniper',
    group: 'anti-sniper',
    name: 'Anti-sniper',
    tagline: 'Launch-block buyers pay up to 50%; fees decay to 1% within minutes.',
    points: [
      'Exponential fee decay + volatility-based dynamic fee',
      'Graduates to a compounding DAMM v2 pool',
      '100% of LP permanently locked',
      'Team allocation vests after graduation',
    ],
    quoteSymbol: 'SOL',
  },
  {
    id: 'fair-raise',
    group: 'fair-raise',
    name: 'Fair raise',
    tagline: 'Near-fixed price: the last buyer pays ~5% more than the first.',
    points: [
      'Flat curve for price discovery without a pump',
      'Graduates to a compounding DAMM v2 pool',
      '100% of LP permanently locked',
      'Team allocation vests after graduation',
    ],
    quoteSymbol: 'SOL',
  },
  {
    id: 'micro-raise',
    group: 'micro-raise',
    name: 'Micro raise',
    tagline: 'Anti-sniper fees with a 0.1 SOL graduation, for small communities.',
    points: [
      'Graduates at 0.1 SOL into a compounding DAMM v2 pool',
      'Same 50% → 1% anti-sniper fee decay',
      '100% of LP permanently locked',
      'Team allocation unlocks minute by minute after graduation',
    ],
    quoteSymbol: 'SOL',
  },
  ...EQUITY_STOCKS.map((stock) => ({
    id: stock.id,
    name: `Equity raise (${stock.symbol})`,
    tagline: 'Raise in tokenized stock on a near-flat curve: price discovery without a pump.',
    points: [
      `Priced and raised in ${stock.symbol} (${stock.company} xStock), not SOL`,
      'Last buyer pays ~5% more than the first',
      `Graduates to a compounding ${stock.symbol} DAMM v2 pool, LP locked`,
      'Team allocation vests after graduation',
    ],
    quoteSymbol: stock.symbol,
    group: 'equity-raise',
    variantLabel: stock.symbol,
  })),
];

export const NETWORK: Network =
  process.env.NEXT_PUBLIC_NETWORK === 'mainnet' ? 'mainnet' : 'devnet';

/** Presets that have a config deployed on the current network. */
export const PRESETS: Preset[] = ALL_PRESETS.filter((p) => getPresetConfig(p.id) !== null);

/** One entry per picker card: each group's presets, in order. */
export const PRESET_GROUPS: { group: string; presets: Preset[] }[] = PRESETS.reduce<{ group: string; presets: Preset[] }[]>(
  (groups, p) => {
    const existing = groups.find((g) => g.group === p.group);
    if (existing) existing.presets.push(p);
    else groups.push({ group: p.group, presets: [p] });
    return groups;
  },
  []
);

export function getPresetConfig(id: string, network: Network = NETWORK): string | null {
  const entry = (registry as Record<Network, Record<string, { config: string }>>)[network]?.[id];
  return entry?.config ?? null;
}

export function getPresetByConfig(config: string, network: Network = NETWORK): Preset | null {
  const byNetwork = (registry as Record<Network, Record<string, { config: string }>>)[network] ?? {};
  const id = Object.keys(byNetwork).find((k) => byNetwork[k]?.config === config);
  return PRESETS.find((p) => p.id === id) ?? null;
}

export function getAllPresetConfigs(network: Network = NETWORK): string[] {
  return Object.values(
    (registry as Record<Network, Record<string, { config: string }>>)[network] ?? {}
  ).map((e) => e.config);
}
