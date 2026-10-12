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

## Would Ratchet have stopped them? (sample, 2026-10-13)

We took an evenly spaced sample of **41 teams** (every 19th of the 762 that moved ≥90% of their
claimed unlocks). For each, we read the latest 30 transactions on the team wallet's token account
and priced every DEX sale (quote token received ÷ tokens sold) against that token's graduation
price (the DBC config's migration price).

- **14** teams had DEX sales we could price (32 sales, in SOL or USDC). The other 27 moved their
  tokens by plain transfer, or sold into a different token, so we left them unpriced.
- **14 of 14** sold below 1.25× the graduation price, the vault's floor. **None of the 32 sales
  reached even the graduation price**: the best was 0.54×, and the typical team's typical sale was
  at **0.10×**.
- **14 of 14** sold more than 10% of their claimed unlock within 24 hours, above the vault's daily cap.
- For the 6 SOL-quoted teams, all 57 SOL they took out came from sales below the floor.

A Ratchet vault would have refused every one of these sales. Data, with every transaction:
[evidence/unlock-counterfactual.json](evidence/unlock-counterfactual.json). Script:
[scripts/unlock-counterfactual.ts](../scaffolds/fun-launch/scripts/unlock-counterfactual.ts)
(`STEP=19 SIGS=30 npx tsx scripts/unlock-counterfactual.ts`).

**Limits:** a sample, not the full population; sales outside the latest 30 transactions, or routed
through another wallet first, are missed. It shows the price teams sold at, not whether they would
have waited for a higher one.

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
