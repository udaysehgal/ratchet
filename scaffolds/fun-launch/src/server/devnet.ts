/** Devnet access for the vault demo and /try. Mainnet stays on RPC_URL. */
import { Connection } from '@solana/web3.js';
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk';

/** DEVNET_RPC_URL if set; else the same Helius key on its devnet host; else the public endpoint. */
export const DEVNET_RPC_URL =
  process.env.DEVNET_RPC_URL ??
  (process.env.RPC_URL?.includes('mainnet.helius-rpc.com')
    ? process.env.RPC_URL.replace('mainnet.helius-rpc.com', 'devnet.helius-rpc.com')
    : 'https://api.devnet.solana.com');

export const devnet = new Connection(DEVNET_RPC_URL, 'confirmed');
export const devnetDbc = new DynamicBondingCurveClient(devnet, 'confirmed');
