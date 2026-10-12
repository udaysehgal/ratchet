import { rpcProxy } from '@/server/rpcProxy';

export default rpcProxy(() => process.env.RPC_URL as string);
