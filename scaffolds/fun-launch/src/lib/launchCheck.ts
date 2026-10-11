/**
 * Launch safety check for any Meteora DBC token. Pure: takes numbers read from the pool's
 * DBC config and mint, returns plain-language checks. Chain reads live in server/check.ts.
 */

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'info';

export type Check = {
  id: string;
  title: string;
  status: CheckStatus;
  detail: string;
};

/** DBC `tokenUpdateAuthority` options. */
export const TokenAuthority = {
  CreatorUpdate: 0,
  Immutable: 1,
  PartnerUpdate: 2,
  CreatorUpdateAndMint: 3,
  PartnerUpdateAndMint: 4,
} as const;

export type LaunchFacts = {
  /** % of post-graduation LP, by owner (all four sum to 100). */
  lp: {
    partnerLocked: number;
    creatorLocked: number;
    partnerUnlocked: number;
    creatorUnlocked: number;
    /** % of each side's unlocked LP that vests instead of being claimable at once. */
    partnerVestingPct: number;
    creatorVestingPct: number;
  };
  /** % of the raise taken at graduation instead of going into the pool, and the creator's cut of it. */
  migrationFeePct: number;
  creatorMigrationFeePct: number;
  tokenUpdateAuthority: number;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  /** Token amounts in whole tokens. */
  preMigrationSupply: number;
  postMigrationSupply: number;
  curveSupply: number;
  graduationPoolSupply: number;
  teamVesting: { total: number; cliffSeconds: number; durationSeconds: number };
  fees: {
    startPct: number;
    endPct: number;
    decaySeconds: number;
    /** 0 linear scheduler, 1 exponential scheduler, 2 rate limiter */
    mode: number;
    dynamic: boolean;
    creatorSharePct: number;
  };
  /** 0 DAMM v1, 1 DAMM v2 */
  migrationOption: number;
  migratedPoolFeeBps: number;
  compoundingFeeBps: number;
  /** Set for Ratchet launches: number of DLMM ladder rungs committed (0 if none yet). */
  ratchetLadderRungs: number | null;
  migrated: boolean;
  /** Symbol of the token the curve raises in (SOL, TSLAx, ...) */
  quoteSymbol: string;
};

/**
 * Share of the graduated pool's SOL that curve buyers can pull out by selling everything into
 * it right after graduation (constant product: S / (B + S)). Seen on mainnet: on a 94% pool a
 * sniper took 85% of the SOL within 7 s of graduation. Above this, we warn.
 */
export const MAX_EXIT_DRAIN = 0.9;

export function exitDrain(curveSupply: number, poolSupply: number): number {
  return curveSupply + poolSupply > 0 ? curveSupply / (curveSupply + poolSupply) : 0;
}

const pct = (n: number) => `${Number(n.toFixed(2))}%`;

function formatSeconds(s: number) {
  if (s >= 86400) return `${Number((s / 86400).toFixed(1))} days`;
  if (s >= 3600) return `${Number((s / 3600).toFixed(1))} h`;
  if (s >= 60) return `${Number((s / 60).toFixed(1))} min`;
  return `${s} s`;
}

export function assessLaunch(f: LaunchFacts): Check[] {
  const checks: Check[] = [];

  // Liquidity: can anyone pull it after graduation?
  const locked = f.lp.partnerLocked + f.lp.creatorLocked;
  const vesting =
    (f.lp.partnerUnlocked * f.lp.partnerVestingPct + f.lp.creatorUnlocked * f.lp.creatorVestingPct) / 100;
  const withdrawable = f.lp.partnerUnlocked + f.lp.creatorUnlocked - vesting;
  checks.push(
    withdrawable <= 0 && vesting <= 0
      ? {
          id: 'lp',
          title: 'Liquidity is locked forever',
          status: 'pass',
          detail: `${pct(locked)} of the graduated pool's LP is permanently locked. Nobody can pull liquidity.`,
        }
      : withdrawable <= 0
        ? {
            id: 'lp',
            title: 'Some liquidity unlocks over time',
            status: 'warn',
            detail: `${pct(locked)} of LP is permanently locked; ${pct(vesting)} vests to the partner or creator and can be withdrawn as it unlocks.`,
          }
        : {
            id: 'lp',
            title: 'Liquidity can be pulled at graduation',
            status: 'fail',
            detail: `${pct(withdrawable)} of the graduated pool's LP goes to the partner or creator unlocked and can be withdrawn immediately.`,
          }
  );

  // Raise: does it go into the pool?
  checks.push(
    f.migrationFeePct > 0
      ? {
          id: 'migration-fee',
          title: `${pct(f.migrationFeePct)} of the raise is taken at graduation`,
          status: f.migrationFeePct >= 25 ? 'fail' : 'warn',
          detail: `At graduation ${pct(f.migrationFeePct)} of the ${f.quoteSymbol} raised is paid out (${pct(f.creatorMigrationFeePct)} of that to the creator, the rest to the partner) instead of backing the pool.`,
        }
      : {
          id: 'migration-fee',
          title: 'The whole raise backs the pool',
          status: 'pass',
          detail: `No migration fee: everything raised on the curve goes into the graduated pool.`,
        }
  );

  // Supply: can more tokens be minted?
  const canMint =
    f.mintAuthority !== null ||
    f.tokenUpdateAuthority === TokenAuthority.CreatorUpdateAndMint ||
    f.tokenUpdateAuthority === TokenAuthority.PartnerUpdateAndMint;
  const inflates = f.postMigrationSupply > f.preMigrationSupply;
  checks.push(
    canMint
      ? {
          id: 'mint',
          title: 'More tokens can be minted',
          status: 'fail',
          detail: f.mintAuthority
            ? `Mint authority is still set (${f.mintAuthority.slice(0, 4)}…${f.mintAuthority.slice(-4)}).`
            : 'The config hands mint authority to the creator or partner after graduation.',
        }
      : inflates
        ? {
            id: 'mint',
            title: 'Supply grows at graduation',
            status: 'warn',
            detail: `Supply goes from ${f.preMigrationSupply.toLocaleString('en-US')} to ${f.postMigrationSupply.toLocaleString('en-US')} tokens at graduation.`,
          }
        : {
            id: 'mint',
            title: 'Fixed supply',
            status: 'pass',
            detail: 'No mint authority: the supply can never grow.',
          }
  );
  if (f.freezeAuthority) {
    checks.push({
      id: 'freeze',
      title: 'Token accounts can be frozen',
      status: 'fail',
      detail: `Freeze authority ${f.freezeAuthority.slice(0, 4)}…${f.freezeAuthority.slice(-4)} can freeze any holder's tokens.`,
    });
  }
  if (
    f.tokenUpdateAuthority === TokenAuthority.CreatorUpdate ||
    f.tokenUpdateAuthority === TokenAuthority.PartnerUpdate
  ) {
    checks.push({
      id: 'metadata',
      title: 'Metadata can be changed',
      status: 'info',
      detail: `The ${f.tokenUpdateAuthority === TokenAuthority.CreatorUpdate ? 'creator' : 'partner'} can update the token's name, symbol and image.`,
    });
  }

  // Team allocation
  const teamPct = f.preMigrationSupply > 0 ? (f.teamVesting.total / f.preMigrationSupply) * 100 : 0;
  checks.push(
    f.teamVesting.total > 0
      ? {
          id: 'team',
          title: `Team allocation: ${pct(teamPct)}, vested`,
          status: teamPct > 30 ? 'warn' : 'pass',
          detail: `Held in a Meteora Lock escrow: unlocks start ${formatSeconds(f.teamVesting.cliffSeconds)} after graduation and finish over ${formatSeconds(f.teamVesting.durationSeconds)}.`,
        }
      : {
          id: 'team',
          title: 'No vested team allocation',
          status: 'info',
          detail: 'The config sets aside no locked team tokens.',
        }
  );

  // Post-graduation exit risk (thin pool)
  const drain = exitDrain(f.curveSupply, f.graduationPoolSupply);
  const drainText = `If curve buyers sell right after graduation, they can pull up to ${pct(drain * 100)} of the pool's ${f.quoteSymbol}.`;
  checks.push(
    drain > MAX_EXIT_DRAIN
      ? { id: 'pool-depth', title: 'Thin pool at graduation', status: 'warn', detail: `${drainText} Early buyers can exit at later buyers' expense.` }
      : { id: 'pool-depth', title: 'Pool depth at graduation', status: 'info', detail: drainText }
  );

  // Fees
  const decaying = f.fees.mode !== 2 && f.fees.decaySeconds > 0 && f.fees.startPct > f.fees.endPct;
  checks.push({
    id: 'fees',
    title: decaying
      ? `Anti-sniper fee: ${pct(f.fees.startPct)} → ${pct(f.fees.endPct)}`
      : `Trading fee: ${pct(f.fees.startPct)}`,
    status: 'info',
    detail: [
      decaying ? `Decays over ${formatSeconds(f.fees.decaySeconds)} after launch.` : null,
      f.fees.mode === 2 ? 'Rate limiter: large buys pay more.' : null,
      f.fees.dynamic ? 'Plus a volatility fee.' : null,
      `Creator earns ${pct(f.fees.creatorSharePct)} of curve fees.`,
    ]
      .filter(Boolean)
      .join(' '),
  });

  // Where it graduates
  checks.push({
    id: 'migration',
    title: `Graduates to Meteora ${f.migrationOption === 1 ? 'DAMM v2' : 'DAMM v1'}`,
    status: 'info',
    detail:
      f.migrationOption === 1
        ? `Pool fee ${pct(f.migratedPoolFeeBps / 100)}${f.compoundingFeeBps > 0 ? `, ${pct(f.compoundingFeeBps / 100)} of fees compound into liquidity` : ''}.`
        : 'Legacy DAMM v1 pool.',
  });

  // Ratchet unlock ladder
  if (f.ratchetLadderRungs !== null) {
    checks.push(
      f.ratchetLadderRungs > 0
        ? {
            id: 'ladder',
            title: 'Team unlocks committed above graduation',
            status: 'pass',
            detail: `${f.ratchetLadderRungs} DLMM sell orders at 1.25× the graduation price or higher.`,
          }
        : {
            id: 'ladder',
            title: f.migrated ? 'Unlock ladder not placed yet' : 'Unlock ladder comes after graduation',
            status: 'info',
            detail: 'Ratchet launches commit team unlocks as DLMM sell orders at 1.25× the graduation price or higher.',
          }
    );
  }

  return checks;
}

/** One-word summary: the worst status across checks. */
export function overallStatus(checks: Check[]): CheckStatus {
  if (checks.some((c) => c.status === 'fail')) return 'fail';
  if (checks.some((c) => c.status === 'warn')) return 'warn';
  return 'pass';
}
