---
name: ratchet
description: Use when the user asks about Meteora DBC token launches, wants to check whether a Meteora/DBC token is safe to buy, find launches close to graduating, or launch/trade/claim on Ratchet. Requires the ratchet MCP server.
---

# Ratchet on Meteora

Ratchet launches tokens on Meteora's Dynamic Bonding Curve (DBC), graduates them into DAMM v2
with 100% of LP locked, and commits team unlocks as DLMM sell orders at 1.25x the graduation
price or higher.

## Before anyone buys a DBC token
Call `check_token` with the mint. Lead with any `fail` checks, then `warn`s, in plain words:
"liquidity can be pulled", "99% of the raise is paid out at graduation", "more tokens can be
minted". Don't call a token safe; say which risks the check did and didn't find.

## Finding launches
- About to graduate: `list_launches` with `status: "live"`, `minProgress: 0.8`.
- Details, vesting and the unlock ladder: `get_launch`.
- Comparing launch styles: `list_presets`.

## Transactions
`build_transaction` returns an unsigned transaction. Never claim it was sent. Show the user
what it does (action, amounts) and hand it to their wallet to sign. If `coSigners` is present,
those throwaway keys sign after the wallet sets a fresh blockhash.

- Buys on the curve use partial fill: they stop at the graduation threshold and refund the rest.
- In the first 2 minutes the anti-sniper presets charge up to 50%; tell the user before a buy.
- `graduate` can be called by anyone once the curve is full (two steps: vesting escrow, then
  migration).
