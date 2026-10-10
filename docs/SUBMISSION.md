# Ratchet: hackathon submission

**One line:** A Meteora launchpad where team unlocks only sell into strength: DBC presets →
locked, compounding DAMM v2 → team allocation committed as DLMM limit orders above the
graduation price.

**Live (mainnet):** https://ratchet-olive.vercel.app
**Code:** https://github.com/udaysehgal/ratchet
**Demo video:** <link>

## What it does
- **Launch** from DBC preset configs on mainnet: *Anti-sniper* (exponential fee decay 50% → 1%
  in 2 min, dynamic fee) and *Fair raise* (near-flat curve, +5% start → graduation). 0.02 SOL
  launch fee, 50/50 curve-fee split, 10% team allocation vesting through DBC's locker.
- **Graduate** at 10 SOL into DAMM v2 with 100% of LP permanently locked and compounding fees.
- **Unlock ladder:** vested team tokens are committed as DLMM ask-side limit orders at
  ≥ 1.25× the graduation price, visible to everyone on the token page.
- **Trade** on the curve (PartialFill buys) and on DAMM v2 after graduation, from the same box.
- **Earnings:** one transaction claims DBC creator/partner fees, the launch fee, and locked-LP
  DAMM v2 fees.
- **Graduation feed** (`/api/feed`) for terminals: pools by curve progress, CORS-open.

## Meteora depth
Uses DBC, DAMM v2, DLMM and Met Lock end to end, plus the Invent studio CLI and the
fun-launch scaffold. Every call is listed in the README's integration table.

## Originality
Launchpads compete on curves; nobody handles what happens at unlock. Ratchet uses DLMM's
native limit orders as an unlock-commitment primitive, and lays out a verified path to make
it trustless: DBC `transfer_pool_creator` to a vault PDA before graduation, plus PDA-owned DLMM
limit orders that only the vault can cancel.

## Impact
Every launchpad on DBC can adopt the pattern: a preset plus a post-graduation unlock ladder.
It's a better default for any asset class with a team or treasury allocation (memes, ICM, RWAs).

## Traction
<fill in: launches, volume, graduations, unique wallets at submission time>

## Built in 3 days
Day 1: presets + full devnet lifecycle. Day 2: app (board, token page, ladder, DAMM v2 trading,
earnings). Day 3: mainnet configs, deploy, preview chart, feed, docs.
