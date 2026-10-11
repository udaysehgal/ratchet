# Ratchet: hackathon submission

**One line:** A Meteora launchpad where team unlocks only sell into strength: DBC presets →
locked, compounding DAMM v2 → team allocation committed as DLMM limit orders above the
graduation price.

**Live (mainnet):** https://ratchet-olive.vercel.app
**Code:** https://github.com/udaysehgal/ratchet
**Demo video:** <link>

## What it does
- **Launch** from DBC preset configs on mainnet: *Anti-sniper* (exponential fee decay 50% → 1%
  in 2 min, dynamic fee), *Fair raise* (near-flat curve, +5% start → graduation) and *Micro
  raise* (anti-sniper fees, 0.1 SOL graduation) and *Equity raise*, a near-flat curve **priced
  and raised in tokenized Tesla stock (TSLAx)** that graduates into a TSLAx DAMM v2 pool. 50/50
  curve-fee split, 10% team allocation vesting through DBC's locker.
- **Graduate** into DAMM v2 with 100% of LP permanently locked and compounding fees. Anyone can
  trigger graduation from the token page once the curve is full.
- **Unlock ladder:** vested team tokens are committed as DLMM ask-side limit orders at
  ≥ 1.25× the graduation price, visible to everyone on the token page.
- **Trade** on the curve (PartialFill buys) and on DAMM v2 after graduation, from the same box.
- **Earnings:** one transaction claims DBC creator/partner fees, the launch fee, and locked-LP
  DAMM v2 fees.
- **Launch check for any Meteora DBC token** (`/check`, `/api/check/<mint>`): LP lock, migration
  fee, mint/freeze authority, supply growth, team vesting and post-graduation exit drain, read
  from chain. Flags real mainnet configs that pay out 99% of the raise at graduation.
- **For agents:** an MCP server (`list_launches`, `get_launch`, `check_token`, `list_presets`,
  `build_transaction`) plus an Agent Skill.
- **Graduation feed** (`/api/feed`) for terminals: pools by curve progress, CORS-open.
- Unit tests (vitest) and CI (typecheck, tests, build) on every push.

## Meteora depth
Uses DBC, DAMM v2, DLMM and Met Lock end to end, plus the Invent studio CLI and the
fun-launch scaffold. Every call is listed in the README's integration table.

## Originality
Launchpads compete on curves; nobody handles what happens at unlock. Ratchet uses DLMM's
native limit orders as an unlock-commitment primitive, and lays out a verified path to make
it trustless: DBC `transfer_pool_creator` to a vault PDA before graduation, plus PDA-owned DLMM
limit orders that only the vault can cancel.

Mainnet backed this up: on CHRL a sniper paid ~37% in anti-sniper fees to get in and still
profited by selling into the fresh DAMM v2 pool 7 s after graduation. Fees tax unwanted supply;
only a program can hold it back. That is what the vault does for team unlocks.

## Impact
Every launchpad on DBC can adopt the pattern: a preset plus a post-graduation unlock ladder.
It's a better default for any asset class with a team or treasury allocation (memes, ICM, RWAs).

## Traction
All on mainnet, through the live app (full tx table in the README, "Proof: verified on mainnet"):
- **4 DBC preset configs** created with Invent studio (anti-sniper, fair raise, micro raise, and a
  TSLAx-quoted equity raise using Meteora's xStock token badge).
- **2 launches**, **1 graduation**: CHRL went from launch to a locked DAMM v2 pool in 5 minutes.
- **9 distinct wallets** traded CHRL across DBC and DAMM v2; 7 of them bought the DAMM v2 pool
  within 15 seconds of graduation.
- A **sniper bot hit CHRL 15 s after launch and paid ~37% in anti-sniper fees**, which went to
  the creator and partner. It then sold 7 s after graduation, a finding that shaped our roadmap
  (see Originality).
- Met Lock vesting claim and a one-transaction fee claim (DBC creator + partner + locked-LP
  DAMM v2 fees) on mainnet.
- The DLMM unlock ladder ran end to end on devnet (tx table in the README).

## Built in 3 days
Day 1: presets + full devnet lifecycle. Day 2: app (board, token page, ladder, DAMM v2 trading,
earnings). Day 3: mainnet configs, deploy, preview chart, feed, graduation action, mainnet
launches and graduation, docs.
