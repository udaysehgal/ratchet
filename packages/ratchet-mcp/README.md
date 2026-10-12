# Ratchet MCP server

Lets AI agents use [Ratchet](https://www.useratchet.xyz) and check any Meteora DBC token.
Holds no keys: it calls Ratchet's public API and returns unsigned transactions.

| Tool | What it does |
|---|---|
| `list_launches` | Ratchet launches with progress to graduation; filter by status and progress |
| `get_launch` | One launch: curve, prices, DAMM v2 pool, Meteora Lock vesting, DLMM unlock ladder |
| `check_token` | Safety check for **any** Meteora DBC token (LP lock, migration fee, mint/freeze authority, team vesting, post-graduation exit drain) |
| `list_presets` | Live on-chain parameters of each launch preset |
| `build_transaction` | Unsigned tx for swap, graduate, claim-vesting, create-dlmm-pair, ladder, claim-fees |

## Use with Claude Code

```bash
claude mcp add ratchet -- npx tsx /path/to/ratchet/packages/ratchet-mcp/src/index.ts
```

Or in any MCP client config:

```json
{ "mcpServers": { "ratchet": { "command": "npx", "args": ["tsx", "/path/to/ratchet/packages/ratchet-mcp/src/index.ts"] } } }
```

`RATCHET_URL` points it at another deployment. [`SKILL.md`](SKILL.md) is an Agent Skill that
tells the model when and how to use the tools.
