# Demo video script (about 3 minutes)

Read the **Say** lines out loud; do what **Screen** describes. Times are cumulative targets.
Speak slowly: 3 minutes is about 400 words, and this script has about 380.

## Before you record (10 minutes)

- Phantom: Settings → Developer settings → Testnet mode → **Solana Devnet**. Hold about 0.7 devnet
  SOL (faucet.solana.com).
- Run **/try** once end to end off-camera, so you know the wallet prompts. Then click **Start a new
  launch** so the recording starts clean.
- Open these tabs, in order, and let each finish loading:
  1. https://www.useratchet.xyz
  2. https://www.useratchet.xyz/unlocks
  3. https://www.useratchet.xyz/try
  4. https://www.useratchet.xyz/vault
  5. https://www.useratchet.xyz/create-pool
  6. https://github.com/udaysehgal/ratchet
- Record at 1080p or higher, browser zoom 110–125% so text is readable, notifications off.
- Backup if a devnet transaction hangs on camera: https://www.useratchet.xyz/try?pool=Ec1JQkmWZRtMpyLwF7fzxAkRTyW1p5cyTSvbLAHcUxH5
  shows a launch that already went through all seven steps.

---

## 1. The hook (0:00 – 0:20)

**Screen:** Home page, hero with the moving trails. Scroll slowly to the big numbers row.

**Say:**
"When a token's team allocation unlocks, what does the team do? We checked every team allocation
on Meteora's bonding curve: 1,477 of them. Of the teams that claimed their tokens, 93% moved almost
all of it straight out of their wallet. Ninety-eight percent of claimed team tokens are gone."

## 2. The problem, everywhere (0:20 – 0:45)

**Screen:** Scroll through the story section and the chart. Then switch to **/unlocks** and hover
the "Unlocking in the next 30 days" list.

**Say:**
"When we traced a sample of them by hand, most had sold on a DEX, often straight into the pool their
own holders were trading in. Vesting doesn't stop a dump. It puts it on a timer. This is our unlock
radar: every team unlock coming up on Meteora, and what each team did with its last one."

## 3. What we saw on our own launch (0:45 – 1:05)

**Screen:** Back to the home page, scroll to "Our first launch, minute by minute". Point at the
orange dot.

**Say:**
"We launched our own token on mainnet. Fifteen seconds in, a bot bought and paid 37% in our
anti-sniper fee. Five minutes later the token graduated into a locked Meteora pool, and seven
seconds after that the bot sold into it. A fee can make a dump expensive. It can't stop one. Only a
program holding the tokens can."

## 4. The fix, live (1:05 – 2:10)

**Screen:** **/try**. Type a name and ticker, click **Launch**, approve in Phantom. Then **Buy**,
**Create the vesting escrow**, **Migrate**, **Claim into the vault**, **Create the DLMM pair**,
approving each. Keep talking while transactions confirm.

**Say:**
"So we built Ratchet, on Meteora's DBC, DAMM v2, DLMM and Lock programs. I'm launching a token on
devnet. In the same transaction, the pool's creator role goes to a vault: an account controlled by
our Solana program, not by me.

I fill the curve, and it graduates into a DAMM v2 pool with its liquidity locked forever. Now the
team's tokens unlock. I'm the team, but when I claim them, they land in the vault. My wallet gets
zero."

**Screen:** Step 6, click **Sell just under 1.25×**. Let the red "Refused by the program:
BelowFloor" sit on screen for two seconds.

**Say:**
"Now I try to sell the team's tokens one tick below one and a quarter times the graduation price.
The program refuses."

**Screen:** Step 7, click **Place the asks**, approve. Then **Try to sell more today**, show
"Refused: DailyCapExceeded".

**Say:**
"Above the floor, it's allowed: these sell orders only fill if buyers push the price up to them. And
the vault caps it at 10% a day, so even a team selling into strength can't empty it at once."

## 5. The vault and the presets (2:10 – 2:40)

**Screen:** Click **See your vault live** (or open **/vault**). Point at the floor and the list of
refusals. Then **/create-pool**, click the Equity raise card and its stock chips.

**Say:**
"Here's the vault: the floor only ever goes up, and everything it refused is on-chain. Back on
mainnet, anyone can launch with these presets: anti-sniper, a flat fair raise, a micro raise, or an
equity raise priced in tokenized Tesla, NVIDIA, Apple or Alphabet stock."

## 6. Close (2:40 – 3:00)

**Screen:** Home page, open the FAQ, then scroll to "Make your team sell into strength." Finish on
the GitHub repo.

**Say:**
"Ratchet: launches on Meteora where the team can only sell into strength. The launchpad is live on
mainnet, the vault is live on devnet, and everything, including the study, is open source at
useratchet.xyz."

---

## If you have more time (a 4–5 minute cut)

- **Check a token** (0:30): paste any Meteora DBC mint into /check and walk the results, including
  "Team sold its unlocks".
- **For builders** (0:20): the README's "Verify it in 60 seconds" block, and the MCP server.

## Facts used above (all in the repo)

| Claim | Source |
|---|---|
| 1,477 allocations, 93% of claiming teams moved ≥90%, 98% of claimed tokens left | docs/UNLOCK-STUDY.md, /api/unlocks |
| Traced sample: most sold on a DEX, often into the DAMM v2 pool | docs/evidence/unlock-study-sample.json (29 of 40 via DEX, 17 into DAMM v2) |
| Bot at +15 s paid ~37%, sold 7 s after graduation | docs/EVIDENCE.md, CHRL timeline |
| Vault refuses below-floor asks and over-cap asks, floor only rises | docs/VAULT.md, 25/25 devnet run |
