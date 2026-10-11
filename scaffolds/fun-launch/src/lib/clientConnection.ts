import { clusterApiUrl, Connection } from '@solana/web3.js';

/**
 * Browser-side connection, used by the wallet adapter only to prepare transactions.
 * Wallets that support signAndSendTransaction (e.g. Phantom) broadcast through their own RPC.
 */
export const clientConnection = new Connection(
  process.env.NEXT_PUBLIC_RPC_URL ??
    clusterApiUrl(process.env.NEXT_PUBLIC_NETWORK === 'mainnet' ? 'mainnet-beta' : 'devnet'),
  'confirmed'
);
