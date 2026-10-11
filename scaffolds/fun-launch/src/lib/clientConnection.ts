import { Connection } from '@solana/web3.js';

let connection: Connection | null = null;

/**
 * Browser-side connection through our /api/rpc proxy (public RPCs reject browser requests).
 * Used by the wallet adapter to prepare/submit transactions and to fetch fresh blockhashes.
 */
export function getClientConnection(): Connection {
  if (!connection) {
    connection = new Connection(`${window.location.origin}/api/rpc`, {
      commitment: 'confirmed',
      disableRetryOnRateLimit: false,
    });
  }
  return connection;
}
