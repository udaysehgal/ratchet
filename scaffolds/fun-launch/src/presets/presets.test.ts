import { describe, expect, it } from 'vitest';
import registry from './registry.json';
import { getPresetByConfig, getPresetConfig } from './index';

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

describe('preset registry', () => {
  it('has a valid config address for every mainnet preset', () => {
    for (const id of ['anti-sniper', 'fair-raise', 'micro-raise']) {
      expect(getPresetConfig(id, 'mainnet')).toMatch(BASE58);
    }
  });

  it('never reuses a config across presets or networks', () => {
    const all = Object.values(registry).flatMap((n) => Object.values(n).map((e) => e.config));
    expect(new Set(all).size).toBe(all.length);
  });

  it('maps configs back to presets', () => {
    expect(getPresetByConfig('6tMtkfHkvvSVsCSpXbcCqVCAJYEg7SJQkDmvYH2urYh9', 'mainnet')?.id).toBe('anti-sniper');
    expect(getPresetByConfig('not-a-config', 'mainnet')).toBeNull();
  });
});
