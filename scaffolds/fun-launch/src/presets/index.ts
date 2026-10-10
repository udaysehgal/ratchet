import registry from './registry.json';

export type Network = 'devnet' | 'mainnet';

export type PresetId = 'anti-sniper' | 'fair-raise';

export type Preset = {
  id: PresetId;
  name: string;
  tagline: string;
  points: string[];
};

/** Display info. On-chain parameters live in /presets/<network>/<id>.jsonc (created with Invent studio). */
export const PRESETS: Preset[] = [
  {
    id: 'anti-sniper',
    name: 'Anti-sniper',
    tagline: 'Launch-block buyers pay up to 50%; fees decay to 1% within minutes.',
    points: [
      'Exponential fee decay + volatility-based dynamic fee',
      'Graduates to a compounding DAMM v2 pool',
      '100% of LP permanently locked',
      'Team allocation vests after graduation',
    ],
  },
  {
    id: 'fair-raise',
    name: 'Fair raise',
    tagline: 'Near-fixed price: the last buyer pays ~5% more than the first.',
    points: [
      'Flat curve for price discovery without a pump',
      'Graduates to a compounding DAMM v2 pool',
      '100% of LP permanently locked',
      'Team allocation vests after graduation',
    ],
  },
];

export const NETWORK: Network =
  process.env.NEXT_PUBLIC_NETWORK === 'mainnet' ? 'mainnet' : 'devnet';

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
