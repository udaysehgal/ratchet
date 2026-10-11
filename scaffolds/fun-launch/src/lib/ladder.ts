/**
 * Unlock ladder rules, shared by the API (which refuses to build anything else) and the UI.
 * Today this is a soft commitment enforced by Ratchet's API; a vault program would enforce it
 * on-chain.
 */
export const LADDER_MIN_MULTIPLE = 1.25; // lowest rung: 1.25x the graduation price
export const LADDER_MAX_RUNGS = 8;

export type Rung = { multiple: number; amount: number };

/** Returns an error message, or null if the ladder is valid. */
export function validateLadder(rungs: Rung[]): string | null {
  if (rungs.length === 0 || rungs.length > LADDER_MAX_RUNGS) {
    return `Ladder needs 1-${LADDER_MAX_RUNGS} rungs`;
  }
  for (const rung of rungs) {
    if (!(rung.multiple >= LADDER_MIN_MULTIPLE)) {
      return `Every rung must be at least ${LADDER_MIN_MULTIPLE}x the graduation price`;
    }
    if (!(rung.amount > 0)) return 'Rung amounts must be positive';
  }
  return null;
}

/** Split a total evenly across rung multiples, dropping blank or non-positive entries. */
export function splitEvenly(multiples: number[], total: number): Rung[] {
  const valid = multiples.filter((m) => m > 0);
  if (!(total > 0) || valid.length === 0) return [];
  return valid.map((multiple) => ({ multiple, amount: total / valid.length }));
}
