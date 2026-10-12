# What Meteora DBC teams do when their tokens unlock

Ratchet exists because of one claim: when a launch's team tokens unlock, the team sells. This is
the measurement, from mainnet, for every DBC launch that has a team allocation.

## Headline (mainnet, 2026-10-12)

- **1,477** DBC launches have a team allocation in a Meteora Lock escrow. **1,413** have started
  unlocking.
- **818** teams have claimed. They claim fast: 92% of them have claimed everything that vested.
- **98.3% of all team tokens ever claimed have left the team wallet.** 762 of the 818 teams
  (93%) moved at least 90% of what they claimed.
- Where it went, in a sample of 40 of those teams: **29 sold through a DEX** (17 straight into
  the Meteora DAMM v2 pool the launch graduated into, 11 via Jupiter, 1 on OKX DEX), 4 only
  transferred, 7 undetermined. Of the ones we could classify, **88% were sold**.
- Only **49 teams (3% of unlocked allocations) kept** their claimed tokens.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="img/unlock-study-dark.svg">
  <img alt="Of 1,413 unlocked DBC team allocations: 762 claimed then moved out, 595 never claimed, 49 kept, 7 partly moved" src="img/unlock-study-light.svg" width="760">
</picture>

## Method

1. **Find every team allocation.** DBC creates a Meteora Lock vesting escrow at graduation, with
   DBC's pool authority (`FhVo3m…HLuM`) as the escrow's `creator`. One filtered query on the
   Lock program (`LocpQg…Qqjn`, account size 296, `creator` at offset 72) returns all of them.
   We verified the layout on our own mainnet launch, CHRL.
2. **Vested and claimed** come from each escrow: cliff time, cliff amount, amount per period,
   frequency, number of periods, total claimed. Vested is computed at chain time.
3. **Moved** = claimed minus what the recipient wallet still holds in its token account for that
   mint. It's a lower bound on what left (a team that also bought on the market would look like
   it moved less).
4. **Where it went**: for a deterministic sample of 40 teams that moved ≥90%, the first
   transaction that reduced the team's balance, classified by the programs it touched (Meteora,
   Jupiter, Raydium, Orca, PumpSwap, OKX DEX) or as a plain transfer.
5. **Markets today** come from DexScreener (most liquid pair per token).

Scripts: [`unlock-study.ts`](../scaffolds/fun-launch/scripts/unlock-study.ts),
[`unlock-study-sample.ts`](../scaffolds/fun-launch/scripts/unlock-study-sample.ts). Data:
[`unlock-study.json`](evidence/unlock-study.json) (every escrow), [`unlock-study-sample.json`](evidence/unlock-study-sample.json)
(the sample, with example transactions). Figure: [`scripts/make-figures.mjs`](../scripts/make-figures.mjs).

## What it doesn't show

- **Price impact.** 97% of these tokens (1,373 of 1,413) no longer have a market with $1k+ liquidity,
  whether or not their teams sold, and only 49 teams held. That sample is too small and too
  confounded to say selling *caused* worse outcomes, so we don't claim it.
- **Intent.** Moving tokens isn't always dumping: a team can fund a treasury or a market maker.
  The DEX sample is there so the "sold" claim rests on transactions, not inference.

## Why it matters for Ratchet

Team vesting on DBC today delays the dump; it doesn't change it. The unlock is claimed the moment
it vests and sold, often into the very pool holders are trading in. Ratchet's
[vault](VAULT.md) changes what an unlock *can* do: the tokens can only reach the market as DLMM
sell orders at ≥ 1.25× the graduation price, with a floor that only rises. Selling into
strength is the only way out.
