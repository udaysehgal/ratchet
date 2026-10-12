import { PublicKey } from '@solana/web3.js';

/** A base58 Solana address in canonical form, so it can't smuggle path characters into storage keys. */
export function isAddress(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    return new PublicKey(value).toBase58() === value;
  } catch {
    return false;
  }
}
