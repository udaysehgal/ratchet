# Ratchet: hackathon submission

**Meteora DBC track, Colosseum Crypto World's Fair.**

A Meteora launchpad where team tokens can only sell into strength. Team unlocks go to a vault
program, not a wallet, and reach the market only as DLMM sell orders at ≥ 1.25× the graduation
price, at most 10% a day.

## Links

- **Live app (Solana mainnet):** https://www.useratchet.xyz
- **Demo video (2:06):** https://www.youtube.com/watch?v=8AmXQZ5kaMc
- **Pitch deck:** https://www.useratchet.xyz/pitch
- **Code:** https://github.com/udaysehgal/ratchet
- **Try the vault (free):** https://www.useratchet.xyz/try
- **X:** https://x.com/ratchetxyz

## The problem

We read all 1,477 team allocations on Meteora DBC ([study](UNLOCK-STUDY.md)):

- **762 of 818** teams that claimed moved ≥ 90% out; **98%** of claimed team tokens have left team wallets.
- In a sample, **14 of 14** teams we could price sold below 1.25× graduation. **None of their 32 sales reached even 1×.**
- On our own launch, a bot paid ~37% in fees and still dumped 7 seconds after graduation.

Vesting schedules the dump. Fees tax it. Only a program holding the tokens can refuse it.

## What we built

**On mainnet:** a launchpad with four DBC presets, including equity raises priced in tokenized
TSLA, NVDA, AAPL and GOOGL; graduation into DAMM v2 with 100% of LP locked; an unlock radar for
every DBC team unlock; a launch check for any DBC token; and an MCP server for agents.

**The vault (devnet, unaudited):** takes the DBC creator role at launch, receives Meteora Lock
vesting, and only lets team tokens out as DLMM asks above a floor that can only rise. It refuses
cheap sales (`BelowFloor`), floor cuts (`FloorCannotDecrease`) and dumps (`DailyCapExceeded`).

## Proof ([every transaction](EVIDENCE.md))

- **Mainnet:** 7 preset configs, 2 launches, 1 graduation (CHRL, curve to locked pool in 5 min), 9 trading wallets.
- **Vault:** 25/25 lifecycle checks, live asks at 1.25× and 2× on [/vault](https://www.useratchet.xyz/vault), keeper every 30 min.
- **Engineering:** 30 unit tests and CI on every push.

## Meteora integration

DBC (presets, launches, creator handoff, xStock badges) · DAMM v2 (locked LP, trading, fee claims) ·
Meteora Lock (vesting into the vault) · DLMM (limit-order unlocks). Details in
[ARCHITECTURE.md](ARCHITECTURE.md#meteora-integration).

## Next

Audit the vault and deploy it to mainnet, make it the default for every launch, and offer
`adopt_launch` to other DBC launchpads.
