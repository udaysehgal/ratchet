# Ratchet: demo video script (~3 min)

Record at https://www.useratchet.xyz on mainnet. Keep the browser at 1440px wide.

## 0:00 – 0:20 · The problem
**Screen:** home page (launch board).
**Say:** "Most launches die at the team unlock: tokens vest, the team market-sells, holders eat it.
Ratchet is a Meteora launchpad where team unlocks can only sell into strength."

## 0:20 – 1:00 · Launch with a preset (DBC)
**Screen:** Launch a token → switch between Anti-sniper and Fair raise; hover the curve chart.
**Say:** "Each preset is a real Meteora DBC config on mainnet; these numbers are read from chain.
Anti-sniper starts at a 50% fee that decays to 1% in two minutes, so bundlers and snipers pay
the creator and the platform. Fair raise is a near-flat curve: the last buyer pays 5% more than
the first. Both graduate at 10 SOL into a DAMM v2 pool with 100% of LP locked and half of all
fees compounding into liquidity. The team gets 10%, vesting through DBC's locker."
**Do:** fill name/symbol/logo → Launch → sign in wallet.

## 1:00 – 1:30 · Trade on the curve
**Screen:** token page → buy 0.05 SOL.
**Say:** "Buys use DBC's partial-fill mode, so the last buyer never overshoots graduation.
Progress, price and graduation price are live from the pool."

## 1:30 – 2:20 · Graduation and the unlock ladder (DAMM v2 + DLMM)
**Screen:** graduated token page (RTST1 on devnet if no mainnet graduation yet; say so).
**Say:** "After graduation the token trades on DAMM v2. Team tokens vest from the Met Lock
escrow DBC created at migration. Ratchet lets the creator commit them only as DLMM limit
orders at 1.25× the graduation price or higher. Here's a ladder from 1.25× to 6×. Anyone can
see it, and the team only sells if price comes up to meet them."
**Do:** show the ladder table; point at the DBC / DAMM v2 / DLMM links.

## 2:20 – 2:40 · Earnings
**Screen:** /earnings.
**Say:** "Creators and the platform claim everything in one transaction: DBC curve fees,
the launch fee, and fees from the locked DAMM v2 LP."

## 2:40 – 3:00 · Feed + what's next
**Screen:** `/api/feed?minProgress=0.8` in a tab, then the README trust-model section.
**Say:** "Terminals can plug into our graduation feed. Next: a vault program. DBC lets us
transfer the creator role to a PDA before graduation, and DLMM limit orders can be owned by
a PDA that only cancels upward. That makes the ladder a hard on-chain guarantee."
