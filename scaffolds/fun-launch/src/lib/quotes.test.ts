import { describe, expect, it } from 'vitest';
import { quoteToken } from './quotes';

describe('quoteToken', () => {
  it('knows SOL and the TSLAx xStock with their decimals', () => {
    expect(quoteToken('So11111111111111111111111111111111111111112')).toMatchObject({ symbol: 'SOL', decimals: 9 });
    expect(quoteToken('XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB')).toMatchObject({ symbol: 'TSLAx', decimals: 8 });
  });

  it('refuses quote tokens Ratchet has no preset for', () => {
    expect(() => quoteToken('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')).toThrow(/Unsupported quote token/);
  });
});
