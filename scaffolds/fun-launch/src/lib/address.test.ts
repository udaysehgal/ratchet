import { describe, expect, it } from 'vitest';
import { isAddress } from './address';

describe('isAddress', () => {
  it('accepts canonical base58 addresses', () => {
    expect(isAddress('BrwQHeRJWXDbXgUVi1TKdoDbnfB5kcRTcieYmSH2NzWB')).toBe(true);
    expect(isAddress('11111111111111111111111111111111')).toBe(true);
  });

  it('rejects anything that could become a different storage path', () => {
    for (const bad of ['../metadata/x', 'images/a', 'abc', '', ' BrwQHeRJWXDbXgUVi1TKdoDbnfB5kcRTcieYmSH2NzWB', 42, null, undefined]) {
      expect(isAddress(bad)).toBe(false);
    }
  });
});
