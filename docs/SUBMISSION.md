# Ratchet: hackathon submission

**One line:** A Meteora launchpad where team unlocks only sell into strength: DBC presets →
locked, compounding DAMM v2 → team allocation committed as DLMM limit orders above the
graduation price.

**Live (mainnet):** https://www.useratchet.xyz
**Code:** https://github.com/udaysehgal/ratchet
**Vault program (devnet):** https://solscan.io/account/BrwQHeRJWXDbXgUVi1TKdoDbnfB5kcRTcieYmSH2NzWB?cluster=devnet
**Demo video:** <link>

## What it does
- **Launch** from DBC preset configs on mainnet: *Anti-sniper* (exponential fee decay 50% → 1%
  in 2 min, dynamic fee), *Fair raise* (near-flat curve, +5% start → graduation) and *Micro
  raise* (anti-sniper fees, 0.1 SOL graduation) and *Equity raise*, a near-flat curve **priced
  and raised in tokenized stock (TSLAx, NVDAx, AAPLx or GOOGLx)** that graduates into a DAMM v2
  pool in that stock. 50/50
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
fun-launch scaffold. Every call is listed in [ARCHITECTURE.md](ARCHITECTURE.md#meteora-integration).

## Originality
Launchpads compete on curves; nobody handles what happens at unlock. Ratchet uses DLMM's
native limit orders as an unlock-commitment primitive, and makes it trustless with its own
program: DBC `transfer_pool_creator` to a vault PDA at launch, Meteora Lock vesting claimed by
that PDA, and PDA-owned DLMM limit orders that only the vault can cancel.

Mainnet backed this up: on CHRL a sniper paid ~37% in anti-sniper fees to get in and still
profited by selling into the fresh DAMM v2 pool 7 s after graduation. Fees tax unwanted supply;
only a program can hold it back. So we built it: the **ratchet-vault program** takes the DBC
creator role at launch and lets team tokens leave only as DLMM asks at ≥ 1.25× the graduation
price, with a floor that only rises. It runs on devnet and passes 20/20 end-to-end checks
against Meteora's deployed programs (docs/VAULT.md, docs/EVIDENCE.md).

## Impact
We measured the problem on mainnet: of 1,413 DBC team allocations that have started unlocking,
762 teams claimed and moved ≥90% of their tokens out (98.3% of all claimed team tokens have left
team wallets), and in a sample, 88% of those sold through a DEX, most often straight into the
graduated DAMM v2 pool (docs/UNLOCK-STUDY.md).
Every launchpad on DBC can adopt the pattern: a preset plus a post-graduation unlock ladder.
It's a better default for any asset class with a team or treasury allocation (memes, ICM, RWAs).

## Traction
All on mainnet, through the live app (every transaction in [EVIDENCE.md](EVIDENCE.md)):
- **7 DBC preset configs** created with Invent studio: anti-sniper, fair raise, micro raise, and
  equity raises priced in TSLAx, NVDAx, AAPLx and GOOGLx (Meteora's xStock token badges).
- **2 launches**, **1 graduation**: CHRL went from launch to a locked DAMM v2 pool in 5 minutes.
- **9 distinct wallets** traded CHRL across DBC and DAMM v2; 7 of them bought the DAMM v2 pool
  within 15 seconds of graduation.
- A **sniper bot hit CHRL 15 s after launch and paid ~37% in anti-sniper fees**, which went to
  the creator and partner. It then sold 7 s after graduation, a finding that shaped our roadmap
  (see Originality).
- Met Lock vesting claim and a one-transaction fee claim (DBC creator + partner + locked-LP
  DAMM v2 fees) on mainnet.
- The DLMM unlock ladder ran end to end on devnet ([txs](EVIDENCE.md#devnet-full-lifecycle-including-the-dlmm-unlock-ladder)).
- The ratchet-vault program is deployed on devnet and enforced the ladder in a 20/20 lifecycle run ([txs](EVIDENCE.md#devnet-the-vault-enforcing-the-ladder-on-chain)).

## Built in 3 days
Day 1: presets + full devnet lifecycle. Day 2: app (board, token page, ladder, DAMM v2 trading,
earnings). Day 3: mainnet configs, deploy, preview chart, feed, graduation action, mainnet
launches and graduation, docs.
