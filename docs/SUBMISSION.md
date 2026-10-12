# Ratchet: hackathon submission

**Meteora DBC track, Colosseum Crypto World's Fair.**

> A Meteora launchpad where team tokens can only sell into strength. Team unlocks go to a vault
> program, not a wallet, and reach the market only as DLMM sell orders at ≥ 1.25× the graduation
> price, at most 10% a day, behind a floor that only rises.

## Links

- **Live app (Solana mainnet):** https://www.useratchet.xyz
- **Demo video (2:06):** https://www.youtube.com/watch?v=8AmXQZ5kaMc
- **Pitch deck:** https://www.useratchet.xyz/pitch ([PDF](https://www.useratchet.xyz/ratchet-pitch.pdf))
- **Code:** https://github.com/udaysehgal/ratchet
- **Try the vault yourself (free, test network):** https://www.useratchet.xyz/try
- **X:** https://x.com/ratchetxyz
- **Vault program (devnet, unaudited):** [`BrwQHe…NzWB`](https://solscan.io/account/BrwQHeRJWXDbXgUVi1TKdoDbnfB5kcRTcieYmSH2NzWB?cluster=devnet)

## 1. The problem, measured on mainnet

We read every team allocation ever locked on Meteora DBC ([study](UNLOCK-STUDY.md)):

- **1,477** team allocations; 1,413 have started unlocking.
- Of the **818** teams that claimed, **762 moved ≥ 90%** of it out of the wallet (93%). **98%** of all
  claimed team tokens have left team wallets. Only 49 teams kept theirs.
- Traced by hand, **29 of 40** sold through a DEX, **17** straight into the token's DAMM v2 pool.
- **Would Ratchet have stopped them?** In an evenly spaced sample of 41 of those teams, all **14 of
  14** whose sales we could price sold below the 1.25× floor. **None of their 32 sales reached even
  the graduation price** (best 0.54×, typical 0.10×), and all 14 sold more than 10% in a day.

Our own launch showed it too: on CHRL a bot paid ~37% in anti-sniper fees and still sold into the
fresh DAMM v2 pool 7 seconds after graduation. Fees tax a dump. Only a program holding the tokens
can refuse one.

## 2. What we built

**Live on Solana mainnet**
- **Launchpad** with four DBC presets made in Invent studio: *Anti-sniper* (fee decays 50% → 1% in
  2 min), *Fair raise* (near-flat curve), *Micro raise* (0.1 SOL graduation) and *Equity raise*,
  priced and raised in tokenized **TSLAx, NVDAx, AAPLx or GOOGLx** (Meteora xStock token badges).
- **Graduation** into DAMM v2 with 100% of LP permanently locked; anyone can trigger it.
- **Trading** on the curve and on DAMM v2 from one box; **earnings** claimed in one transaction.
- **Unlock radar** (`/unlocks`): every upcoming DBC team unlock, and what that team did last time.
- **Launch check** for any DBC token (`/check`, API, embeddable badge): LP lock, raise payout,
  mint authority, team vesting, past unlock sales.
- **For agents:** MCP server and Agent Skill; public CORS-open APIs and a graduation feed.

**The ratchet-vault program** (native Solana, devnet until audited)
- Takes the DBC creator role in the launch transaction (`adopt_launch` → `transfer_pool_creator`).
- Meteora Lock vesting can only be claimed into the vault.
- Team tokens leave only as Meteora DLMM limit orders the vault places: refused below the floor
  (`BelowFloor`), floor can't drop (`FloorCannotDecrease`), max 10% a day (`DailyCapExceeded`).
- Anyone can try it at `/try`: launch a vaulted token in ~5 minutes and watch a cheap sale get refused.

## 3. Proof

All transactions are in [EVIDENCE.md](EVIDENCE.md).

| Mainnet | |
|---|---|
| Preset configs | 7 (anti-sniper, fair, micro, and 4 xStock equity raises) |
| Launches / graduations | 2 / 1. CHRL: launch to locked DAMM v2 pool in 5 minutes |
| Wallets that traded CHRL | 9 across DBC and DAMM v2; 7 bought within 15 s of graduation |
| On-chain claims | Meteora Lock vesting claim; one-transaction fee claim (DBC + locked-LP DAMM v2) |

| Vault (devnet) | |
|---|---|
| End-to-end lifecycle | 25/25 checks, also run against Meteora's mainnet binaries locally |
| Live vault | [/vault](https://www.useratchet.xyz/vault): asks resting at 1.25× and 2× graduation |
| Automation | Keeper on GitHub Actions every 30 minutes |
| Engineering | 30 unit tests; CI (typecheck, tests, build, `cargo test`) on every push |

## 4. How it uses Meteora

| Program | Used for |
|---|---|
| Dynamic Bonding Curve | Preset configs (Invent studio), launches, PartialFill buys, creator role handed to the vault, xStock token badges |
| DAMM v2 | Graduation with permanently locked, fee-compounding LP; post-graduation trading; locked-LP fee claims |
| Meteora Lock | Team vesting escrows, claimed into the vault |
| DLMM | Unlocks sold only as limit orders (`place_limit_order`) the vault owns |

Every call is listed in [ARCHITECTURE.md](ARCHITECTURE.md#meteora-integration).

## 5. Why it matters

- **Holders** get a floor the team can't break: team supply enters the market only as resting asks
  above graduation, never as a dump into their pool.
- **Teams** get a verifiable commitment, shown by the launch check and badge, instead of a promise.
- **Launchpads** can adopt it with one instruction in the launch transaction, on any DBC config.

## 6. What's next

1. Audit the vault program, then deploy it to mainnet.
2. Make the vault the default for every Ratchet launch.
3. Offer `adopt_launch` to other DBC launchpads, with the MCP server and API.
4. Unlock alerts for holders, from the radar.

## Honest limits

- The vault program is **unaudited** and runs on **devnet**; the launchpad, presets, radar and
  check run on mainnet.
- The "would Ratchet have stopped them" result is a **sample** (41 teams, 14 with priced sales),
  reading each wallet's latest 30 transactions. Method and data are in
  [UNLOCK-STUDY.md](UNLOCK-STUDY.md#would-ratchet-have-stopped-them-sample-2026-10-13).
