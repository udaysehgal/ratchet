import { rpcProxy } from '@/server/rpcProxy';
import { DEVNET_RPC_URL } from '@/server/devnet';

/** Devnet RPC proxy for /try. */
export default rpcProxy(() => DEVNET_RPC_URL);
