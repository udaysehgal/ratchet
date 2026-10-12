import { describe, expect, it } from 'vitest';
import { MAX_EXIT_DRAIN, TokenAuthority, assessLaunch, exitDrain, overallStatus, type LaunchFacts } from './launchCheck';

/** Ratchet's anti-sniper preset as deployed on mainnet (6tMtkf…YhH9). */
const ratchetAntiSniper: LaunchFacts = {
  lp: { partnerLocked: 50, creatorLocked: 50, partnerUnlocked: 0, creatorUnlocked: 0, partnerVestingPct: 0, creatorVestingPct: 0 },
  migrationFeePct: 0,
  creatorMigrationFeePct: 0,
  tokenUpdateAuthority: TokenAuthority.Immutable,
  mintAuthority: null,
  freezeAuthority: null,
  preMigrationSupply: 1_000_000_000,
  postMigrationSupply: 1_000_000_000,
  curveSupply: 700_000_000,
  graduationPoolSupply: 200_000_000,
  teamVesting: { total: 100_000_000, cliffSeconds: 3600, durationSeconds: 3600 + 30 * 86400 },
  fees: { startPct: 50, endPct: 1, decaySeconds: 120, mode: 1, dynamic: true, creatorSharePct: 50 },
  migrationOption: 1,
  migratedPoolFeeBps: 100,
  compoundingFeeBps: 5000,
  ratchetLadderRungs: 0,
  migrated: false,
  quoteSymbol: 'SOL',
};

const byId = (facts: LaunchFacts, id: string) => assessLaunch(facts).find((c) => c.id === id);

describe('assessLaunch', () => {
  it('passes Ratchet presets on every safety check', () => {
    const checks = assessLaunch(ratchetAntiSniper);
    expect(checks.filter((c) => c.status === 'fail' || c.status === 'warn')).toEqual([]);
    expect(overallStatus(checks)).toBe('pass');
  });

  it('fails when LP is handed out unlocked', () => {
    const c = byId({ ...ratchetAntiSniper, lp: { ...ratchetAntiSniper.lp, creatorLocked: 0, creatorUnlocked: 50 } }, 'lp');
    expect(c?.status).toBe('fail');
    expect(c?.detail).toContain('50%');
  });

  it('warns, not fails, when unlocked LP fully vests', () => {
    const lp = { ...ratchetAntiSniper.lp, creatorLocked: 0, creatorUnlocked: 50, creatorVestingPct: 100 };
    expect(byId({ ...ratchetAntiSniper, lp }, 'lp')?.status).toBe('warn');
  });

  it('grades migration fees by size', () => {
    expect(byId({ ...ratchetAntiSniper, migrationFeePct: 10 }, 'migration-fee')?.status).toBe('warn');
    // Seen on mainnet: configs that pay out 99% of the raise at graduation
    expect(byId({ ...ratchetAntiSniper, migrationFeePct: 99, creatorMigrationFeePct: 100 }, 'migration-fee')?.status).toBe('fail');
  });

  it('fails when tokens can still be minted or frozen', () => {
    expect(byId({ ...ratchetAntiSniper, mintAuthority: 'Mint1111111111111111111111111111111111111111' }, 'mint')?.status).toBe('fail');
    expect(byId({ ...ratchetAntiSniper, tokenUpdateAuthority: TokenAuthority.PartnerUpdateAndMint }, 'mint')?.status).toBe('fail');
    expect(byId({ ...ratchetAntiSniper, freezeAuthority: 'Frz11111111111111111111111111111111111111111' }, 'freeze')?.status).toBe('fail');
  });

  it('warns when supply grows at graduation', () => {
    expect(byId({ ...ratchetAntiSniper, postMigrationSupply: 1_200_000_000 }, 'mint')?.status).toBe('warn');
  });

  it('flags the thin-pool exit that hit CHRL on mainnet', () => {
    // micro-raise preset: 850M sold on the curve, 50M seeded into DAMM v2
    const c = byId({ ...ratchetAntiSniper, curveSupply: 850_000_000, graduationPoolSupply: 50_000_000 }, 'pool-depth');
    expect(c?.status).toBe('warn');
    expect(c?.detail).toContain('94.44%');
  });

  it('only reports the unlock ladder for Ratchet launches', () => {
    expect(byId({ ...ratchetAntiSniper, ratchetLadderRungs: null }, 'ladder')).toBeUndefined();
    expect(byId({ ...ratchetAntiSniper, ratchetLadderRungs: 3, migrated: true }, 'ladder')?.status).toBe('pass');
  });
});

describe('team unlocks', () => {
  type TeamUnlock = NonNullable<LaunchFacts['teamUnlock']>;
  const unlock = (over: Partial<TeamUnlock>): LaunchFacts => {
    const base: TeamUnlock = { vaulted: false, verdict: 'held', movedShare: 0, claimedShare: 0.2, nextUnlockAt: null };
    return { ...ratchetAntiSniper, teamUnlock: { ...base, ...over } };
  };

  it('fails a launch whose team sold its unlocks', () => {
    const c = byId(unlock({ verdict: 'sold', movedShare: 0.97 }), 'team-unlocks');
    expect(c?.status).toBe('fail');
    expect(c?.detail).toContain('97%');
  });

  it('passes vaulted launches whatever the history', () => {
    expect(byId(unlock({ vaulted: true, verdict: 'sold', movedShare: 1 }), 'team-unlocks')?.status).toBe('pass');
  });

  describe('vault sunset', () => {
    const now = 1_700_000_000;
    const day = 86_400;
    const check = (sunsetTs: number | null) =>
      assessLaunch(unlock({ vaulted: true, sunsetTs }), now).find((c) => c.id === 'team-unlocks');

    it('passes a vault with no sunset', () => {
      expect(check(null)?.status).toBe('pass');
    });

    it('fails a vault whose sunset has passed', () => {
      expect(check(1)?.status).toBe('fail');
      expect(check(now)?.status).toBe('fail');
    });

    it('warns when the sunset is under 180 days away', () => {
      expect(check(now + 179 * day)?.status).toBe('warn');
    });

    it('passes a distant sunset but names its date', () => {
      const c = check(now + 365 * day);
      expect(c?.status).toBe('pass');
      expect(c?.title).toContain('until 2024-11-13');
    });
  });

  it('only adds the check when unlock data is known', () => {
    expect(byId(ratchetAntiSniper, 'team-unlocks')).toBeUndefined();
  });
});

describe('exitDrain', () => {
  it('is the constant-product share curve buyers can withdraw', () => {
    expect(exitDrain(700, 200)).toBeCloseTo(0.7778, 4);
    expect(exitDrain(850, 50)).toBeCloseTo(0.9444, 4);
    expect(exitDrain(0, 0)).toBe(0);
  });

  it('puts Ratchet anti-sniper below the warning line', () => {
    expect(exitDrain(700, 200)).toBeLessThan(MAX_EXIT_DRAIN);
  });
});
