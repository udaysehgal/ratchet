#!/usr/bin/env -S npx tsx
/**
 * Ratchet MCP server (stdio). Gives AI agents read access to Ratchet launches on Meteora,
 * a safety check for any Meteora DBC token, and unsigned transactions for the user's wallet
 * to sign. It never holds keys: everything goes through Ratchet's public API.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BASE_URL = (process.env.RATCHET_URL ?? 'https://ratchet-olive.vercel.app').replace(/\/$/, '');

async function api(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, init);
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(body.error ?? `Ratchet API returned ${res.status}`);
  return body;
}

const text = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
});

const mint = z.string().min(32).max(44).describe('Token mint address (base58)');

const server = new McpServer({ name: 'ratchet', version: '0.1.0' });

server.registerTool(
  'list_launches',
  {
    title: 'List Ratchet launches',
    description:
      'Every token launched on Ratchet (Meteora DBC), with the amount raised (in its quote token: SOL or an xStock like TSLAx), graduation threshold, progress and whether it has graduated to DAMM v2. Filter to find launches about to graduate.',
    inputSchema: {
      status: z.enum(['live', 'graduated']).optional().describe('live = still on the curve'),
      minProgress: z.number().min(0).max(1).optional().describe('e.g. 0.8 for 80%+ of the way to graduation'),
    },
  },
  async ({ status, minProgress }) => {
    const q = new URLSearchParams();
    if (status) q.set('status', status);
    if (minProgress !== undefined) q.set('minProgress', String(minProgress));
    return text(await api(`/api/feed?${q}`));
  }
);

server.registerTool(
  'get_launch',
  {
    title: 'Get a Ratchet launch',
    description:
      'Full state of one Ratchet launch: curve progress, current and graduation price, DAMM v2 pool, team vesting (Meteora Lock) and the DLMM unlock ladder.',
    inputSchema: { mint },
  },
  async ({ mint }) => text(await api(`/api/launch/${mint}`))
);

server.registerTool(
  'check_token',
  {
    title: 'Check any Meteora DBC token',
    description:
      'Safety check for ANY token launched on Meteora DBC (not only Ratchet): whether LP can be pulled, migration fee taken from the raise, mint/freeze authority, supply growth, team vesting, how much of the pool early buyers can drain right after graduation, fees and migration target. Use before buying.',
    inputSchema: { mint },
  },
  async ({ mint }) => text(await api(`/api/check/${mint}`))
);

server.registerTool(
  'list_presets',
  {
    title: 'List launch presets',
    description:
      "Ratchet's launch presets with their live on-chain DBC parameters: graduation threshold, market cap range, fee schedule, creator fee share, team vesting, launch fee.",
    inputSchema: {},
  },
  async () => {
    const { presets } = (await api('/api/presets')) as { presets: Record<string, unknown>[] };
    return text(presets.map(({ points: _points, ...rest }) => rest));
  }
);

server.registerTool(
  'build_transaction',
  {
    title: 'Build an unsigned Ratchet transaction',
    description:
      "Builds a Meteora transaction for the user's wallet to review and sign; nothing is signed or sent. Actions: swap (buy with SOL or sell tokens; routes to the DBC curve or the DAMM v2 pool), graduate (anyone, once the curve is full), claim-vesting, create-dlmm-pair, ladder (creator only; rungs at >= 1.25x the graduation price), claim-fees. Returns base64 tx plus any throwaway co-signer keys that must sign after the blockhash is set.",
    inputSchema: {
      action: z.enum(['swap', 'graduate', 'claim-vesting', 'create-dlmm-pair', 'ladder', 'claim-fees']),
      mint,
      user: z.string().min(32).max(44).describe("The signing wallet's address"),
      side: z.enum(['buy', 'sell']).optional().describe('swap only'),
      amount: z.number().positive().optional().describe('swap only: SOL to spend (buy) or tokens to sell'),
      slippageBps: z.number().int().min(10).max(5000).optional(),
      rungs: z
        .array(z.object({ multiple: z.number().min(1.25), amount: z.number().positive() }))
        .max(8)
        .optional()
        .describe('ladder only: multiples of the graduation price and token amounts'),
    },
  },
  async (args) =>
    text(
      await api('/api/tx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      })
    )
);

await server.connect(new StdioServerTransport());
