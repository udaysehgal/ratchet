import type { Keypair, Transaction } from '@solana/web3.js';
import type { ConfirmResponse } from '@/pages/api/confirm';
import { getClientConnection } from './clientConnection';

/** How long to keep checking after the wallet submits; a blockhash is valid for ~60-90s. */
const CONFIRM_TIMEOUT_MS = 90_000;

/**
 * Give a transaction a fresh blockhash right before the wallet sees it, so time spent on wallet
 * warning screens doesn't expire it. Skipped when the server already co-signed it (changing the
 * blockhash would invalidate that signature).
 */
export async function withFreshBlockhash(tx: Transaction): Promise<Transaction> {
  if (tx.signatures.some((s) => s.signature !== null)) return tx;
  const { blockhash, lastValidBlockHeight } = await getClientConnection().getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  return tx;
}

/** Poll the server until the signature confirms, fails, or the blockhash window has passed. */
export async function confirmSignature(signature: string): Promise<void> {
  const deadline = Date.now() + CONFIRM_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const res = await fetch('/api/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signature }),
    });
    const body = (await res.json().catch((): null => null)) as ConfirmResponse | null;
    if (body?.status === 'confirmed') return;
    if (body?.status === 'failed') throw new Error(`Transaction failed on-chain: ${body.error}`);
    // pending, or a transient server error: keep polling
  }
  throw new Error(
    'Transaction expired before it landed. Please try again and approve in your wallet within about a minute.'
  );
}

type SignTransaction = (tx: Transaction) => Promise<Transaction>;

/** Pull the wallet's inner error out of adapter wrappers like "Unexpected error". */
export function walletErrorMessage(error: unknown): string {
  const e = error as { message?: string; error?: { message?: string }; cause?: { message?: string } };
  return e?.error?.message || e?.cause?.message || e?.message || 'Transaction failed';
}

/**
 * Fresh blockhash → optional co-signers → wallet signs → submit via our RPC proxy → confirm.
 * Uses signTransaction rather than signAndSendTransaction: Phantom's sign-and-send path failed
 * opaquely ("Unexpected error") on this domain, while signing works.
 */
export async function signSubmitConfirm(
  tx: Transaction,
  signTransaction: SignTransaction,
  coSigners: Keypair[] = []
): Promise<string> {
  const fresh = await withFreshBlockhash(tx);
  if (coSigners.length) fresh.partialSign(...coSigners);
  let signed: Transaction;
  try {
    signed = await signTransaction(fresh);
  } catch (error) {
    throw new Error(walletErrorMessage(error));
  }
  const signature = await getClientConnection().sendRawTransaction(signed.serialize(), {
    preflightCommitment: 'confirmed',
  });
  await confirmSignature(signature);
  return signature;
}
