import { describe, expect, it } from 'vitest';
import { LADDER_MAX_RUNGS, LADDER_MIN_MULTIPLE, splitEvenly, validateLadder } from './ladder';

describe('validateLadder', () => {
  it('accepts rungs at or above the minimum multiple', () => {
    expect(validateLadder([{ multiple: LADDER_MIN_MULTIPLE, amount: 1 }, { multiple: 2, amount: 1 }])).toBeNull();
  });

  it('rejects any rung below the minimum: unlocks only sell into strength', () => {
    expect(validateLadder([{ multiple: 1.24, amount: 1 }])).toMatch(/at least 1.25x/);
    expect(validateLadder([{ multiple: 2, amount: 1 }, { multiple: 1, amount: 1 }])).toMatch(/at least/);
  });

  it('rejects NaN multiples and non-positive amounts', () => {
    expect(validateLadder([{ multiple: Number.NaN, amount: 1 }])).not.toBeNull();
    expect(validateLadder([{ multiple: 2, amount: 0 }])).toMatch(/positive/);
  });

  it('bounds the number of rungs', () => {
    expect(validateLadder([])).toMatch(/1-8/);
    const tooMany = Array.from({ length: LADDER_MAX_RUNGS + 1 }, () => ({ multiple: 2, amount: 1 }));
    expect(validateLadder(tooMany)).toMatch(/1-8/);
  });
});

describe('splitEvenly', () => {
  it('splits the total across valid multiples', () => {
    expect(splitEvenly([1.25, 1.5, 2], 30)).toEqual([
      { multiple: 1.25, amount: 10 },
      { multiple: 1.5, amount: 10 },
      { multiple: 2, amount: 10 },
    ]);
  });

  it('drops blank inputs and returns nothing without a total', () => {
    expect(splitEvenly([2, 0, Number.NaN], 10)).toEqual([{ multiple: 2, amount: 10 }]);
    expect(splitEvenly([2], 0)).toEqual([]);
  });
});
