import { Connection } from '@solana/web3.js';

export type Cluster = 'mainnet' | 'devnet';

const connections: Partial<Record<Cluster, Connection>> = {};
const PROXY: Record<Cluster, string> = { mainnet: '/api/rpc', devnet: '/api/try/rpc' };

/**
 * Browser-side connection through our RPC proxy (public RPCs reject browser requests).
 * Used by the wallet flow to fetch fresh blockhashes and submit. Devnet is only for /try.
 */
export function getClientConnection(cluster: Cluster = 'mainnet'): Connection {
  if (!connections[cluster]) {
    connections[cluster] = new Connection(`${window.location.origin}${PROXY[cluster]}`, {
      commitment: 'confirmed',
      disableRetryOnRateLimit: false,
    });
  }
  return connections[cluster]!;
}
