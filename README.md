# Ratchet

**A Meteora launchpad where team unlocks only sell into strength.**

Live on Solana mainnet: **https://ratchet-olive.vercel.app**

Every Ratchet token:

1. **Launches on a Meteora DBC bonding curve** from a preset config (anti-sniper, fair raise or micro raise).
2. **Graduates into a Meteora DAMM v2 pool** with 100% of LP permanently locked and half of all
   trading fees compounding back into liquidity.
3. **Commits its team allocation as Meteora DLMM limit orders** above the graduation price. The
   team's tokens vest from DBC's locker, and Ratchet only lets them be placed as sell orders at
   1.25× the graduation price or higher, laddered upward. Holders can see the whole ladder
   on the token page.

Team unlocks are the classic way launches die: a cliff hits and the team market-sells. Ratchet
turns every unlock into resting sell orders above the price people paid at graduation. If
the team sells, it sells into strength.

---

## Meteora integration

Every on-chain action in Ratchet goes through a Meteora program. The server layer is one file,
[`scaffolds/fun-launch/src/server/meteora.ts`](scaffolds/fun-launch/src/server/meteora.ts).

| Program / SDK | What Ratchet uses it for | Calls |
|---|---|---|
| **DBC** (`@meteora-ag/dynamic-bonding-curve-sdk`) | Preset configs, launches, curve trading, fee claims, vesting locker, preset previews | `partner.createConfig` (via Invent studio), `creator.createPool`, `pool.swap2` (PartialFill buys so the last buyer can't overshoot graduation) + `pool.swapQuote2`, `creator.claimCreatorTradingFee`, `partner.claimPartnerTradingFee`, `partner.claimPartnerPoolCreationFee`, `state.getPoolsByConfig`, `state.getPoolByBaseMint`, `state.getPoolConfig`, `deriveEscrow(deriveBaseKeyForLocker(pool))`, `getDeltaAmountQuoteUnsigned` (curve preview) |
| **DAMM v2** (`@meteora-ag/cp-amm-sdk`) | Post-graduation trading and locked-LP fee claims | `fetchPoolStatesByTokenAMint`, `getQuote2` + `swap2`, `getPositionsByUser`, `getUserPositionByPool`, `getUnClaimLpFee`, `claimPositionFee2` |
| **DLMM** (`@meteora-ag/dlmm`) | The unlock ladder | `createCustomizablePermissionlessLbPair2` (limit-order function type), `placeLimitOrder` (ask side, one order per ladder), `getLimitOrderByUserAndLbPair`, `getBinIdFromPrice`, `getPriceOfBinByBinId` |
| **Met Lock** (`@meteora-ag/met-lock-sdk`) | Team vesting escrow created by DBC at migration | `getEscrow`, `claimV2` |
| **Invent studio** (`studio/`) | Creating and rehearsing presets on devnet and mainnet | `dbc-create-config`, `dbc-create-pool`, `dbc-swap`, `dbc-migrate-to-damm-v2`, `dlmm-create-pool`, `dlmm-place-limit-order`, `lock-claim` |
| **fun-launch scaffold** | Frontend base (heavily rewritten; Jupiter data stream removed) | |

### DBC preset configuration (mainnet)

| | Anti-sniper | Fair raise | Micro raise |
|---|---|---|---|
| Config | [`6tMtkf…YhH9`](https://solscan.io/account/6tMtkfHkvvSVsCSpXbcCqVCAJYEg7SJQkDmvYH2urYh9) | [`Ery2mG…wwBW`](https://solscan.io/account/Ery2mGuMQ27iV3wCqCd7Ne45XkRCV6fSf2s1j87WwwBW) | [`FQt9kW…goGp`](https://solscan.io/account/FQt9kWsBwHwkhq3TEBXCWqnEqD2GxjxjBVNuJ29igoGp) |
| Curve | `buildCurve`, 20% supply to migration | `buildCurveWithCustomSqrtPrices`, price moves 5% start → graduation | `buildCurve`, 5% supply to migration |
| Graduation | 10 SOL | ~10 SOL | 0.1 SOL |
| Market cap | ~4 → 50 SOL | ~21.5 → 22.6 SOL | — |
| Base fee | exponential fee scheduler, 50% → 1% over 2 min | 1% flat | same as anti-sniper |
| Dynamic fee | on | off | on |
| Pool creation fee | 0.02 SOL (90% partner) | 0.02 SOL (90% partner) | none |
| Curve fee split | 50% creator / 50% partner | 50% creator / 50% partner | 50% creator / 50% partner |
| Team allocation | 10% via DBC locked vesting: 1% at 1 h after graduation, 9% daily over 30 days | same | 10%: 1% 60 s after graduation, the rest every minute for 30 min |
| Migration | DAMM v2, customizable fee: 1% pool fee, dynamic fee, **compounding** (50% of fees back into liquidity) | same | same |
| LP | 100% permanently locked (50% creator / 50% partner) | same | same |

Preset sources: [`presets/mainnet/`](presets/mainnet), built with the Invent studio CLI.

---

## How a launch flows

```
creator ──createPool──▶ DBC pool (preset config)
traders ──swap2──────▶ curve fills to migration threshold
        ──migrate────▶ DAMM v2 pool (LP locked, fees compound) + Met Lock vesting escrow
creator ──claimV2────▶ vested team tokens
        ──createCustomizablePermissionlessLbPair2──▶ DLMM pair (limit-order type)
        ──placeLimitOrder (asks ≥ 1.25× graduation price)──▶ public unlock ladder
traders ──swap2──────▶ DAMM v2; DLMM asks fill only if price rises to them
creator/partner ──claim fees──▶ DBC creator/partner fees + launch fee + locked-LP fees (one tx)
```

### Trust model

Today the ladder is a **public commitment enforced by Ratchet's API**: the server refuses to
build ladder orders below 1.25× the graduation price, and every order is visible on-chain
and on the token page. The creator's wallet owns the orders, so it could cancel them directly.

The next version makes this binding. Verified against the DBC and DLMM programs:

- DBC's `transfer_pool_creator` works at any point before the curve completes. Moving the
  creator role to a vault PDA sends the vesting escrow, creator fees and creator LP to the vault.
- DLMM's `place_limit_order` does not require the order `owner` to sign, but
  `cancel_limit_order` does. A vault PDA can own the ladder, and only the vault program can
  cancel or re-place it (only upward).

---

## App

| Page | What it does |
|---|---|
| `/` | Launch board from chain: near graduation, live on the curve, graduated |
| `/create-pool` | Pick a preset (live curve chart + on-chain parameters), upload a logo, launch |
| `/token/[mint]` | Curve progress, trade (DBC curve, then DAMM v2), vesting status, the public DLMM ladder, creator unlock controls, fees |
| `/earnings` | Everything the connected wallet can claim as creator or partner, one-click claims |
| `/check` | Safety check for any Meteora DBC token |

### Launch check (any Meteora DBC token)

`/check` and `GET /api/check/<mint>` read any DBC pool's config and mint (not only Ratchet's)
and grade it in plain language: is LP permanently locked, how much of the raise is paid out at
graduation, can more tokens be minted or accounts frozen, does supply grow at migration, how
big and how vested the team allocation is, and how much of the graduated pool's SOL curve
buyers can drain by selling right after graduation (the failure we hit on mainnet, see below).
Every Ratchet token page shows the same check. On real mainnet DBC configs it already flags
launches that pay out 99% of the raise at graduation.

### For AI agents: MCP server + Agent Skill

[`packages/ratchet-mcp`](packages/ratchet-mcp) exposes Ratchet to Claude, Cursor or any MCP
client: `list_launches`, `get_launch`, `check_token` (any DBC token), `list_presets`, and
`build_transaction` (unsigned; the user's wallet signs). [`SKILL.md`](packages/ratchet-mcp/SKILL.md)
tells the model when to run a check before a buy and how to present transactions.

```bash
claude mcp add ratchet -- npx tsx packages/ratchet-mcp/src/index.ts
```

### Public graduation feed

```
GET https://ratchet-olive.vercel.app/api/feed?minProgress=0.8&status=live
```

CORS-open JSON of every Ratchet launch: mint, DBC pool and config, SOL raised, graduation
threshold, progress, graduated flag. Built for terminals and bots that want pools about to
migrate into DAMM v2.

---

## Proof: verified on mainnet

Every step below ran through the live app with a real wallet. Times are UTC, 2026-10-11.

**Configs** (Invent studio, partner wallet `4re4BQ…EMLV`): anti-sniper [`6tMtkf…rYh9`](https://solscan.io/account/6tMtkfHkvvSVsCSpXbcCqVCAJYEg7SJQkDmvYH2urYh9) ([tx](https://solscan.io/tx/46mMhaiNwevdsrX4TamLJ5oSiRYYzZ5kvygDiqZSH85DTBschGYjizxkxGxUywKZTNWNiBdTxouZTjgjkh5VcZs2)),
fair raise [`Ery2mG…wwBW`](https://solscan.io/account/Ery2mGuMQ27iV3wCqCd7Ne45XkRCV6fSf2s1j87WwwBW) ([tx](https://solscan.io/tx/4FeJYGd9KyjWGDy1hjPs6AQvzfcXnGQg8LPtRyQo4ohDduN6VpXgGUrdzj6KYpzSGfPTp64JjUd6mi6j39rs9HN8)),
micro raise [`FQt9kW…goGp`](https://solscan.io/account/FQt9kWsBwHwkhq3TEBXCWqnEqD2GxjxjBVNuJ29igoGp) ([tx](https://solscan.io/tx/5GRNsZkJkdQjtDCWU8zqpH4SmmrHMfiPSFAprpPHuxwtxAGaxzR43S4iyM7xfaTbRFz1NhiGYPqJUZ8Uz3ADf8HZ)).

**CHRL: launch to graduation in 5 minutes** (micro raise; mint [`CrUN9N…ifx5`](https://solscan.io/account/CrUN9NbRPTFeVJqeh8ytqDgAKUGHp3CN1pVXZeMKifx5))

| Time | Step | Program | Tx |
|---|---|---|---|
| 19:23:00 | Launch from the app | DBC `InitializeVirtualPoolWithSplToken` → pool [`2S2hTX…wzCg`](https://solscan.io/account/2S2hTXpXMi1MToqjCGgWehGq5sNuscsh3EtoDkARwzCg) | [tx](https://solscan.io/tx/5QtsRSgsNbieQQg2H6sYaZmJxCP3Xk2o9Mm3CXJety78Yz62uqyiyNbD79s6hMViKftqH2b4WKimKHvA6FoUwrB5) |
| 19:23:15 | Sniper bot buys 15 s after launch, **pays ~37% in fees** (anti-sniper scheduler) | DBC `Swap2` | [tx](https://solscan.io/tx/47YZnUa2ERKiU9NRx2dNVbqGdhQmCAUxLHWrKKkZGv4bkFgRyNgyUSPuksV9zvpqUEBSxDc7xW7uoxeKsAef9aZf) |
| 19:26:44 | Creator buy fills the curve (PartialFill, no overshoot) | DBC `Swap2` | [tx](https://solscan.io/tx/4uCDvw4hoALUG7TaqJs132fYe2K89BGgYBk2yMD2fqnkU6nTVRfMBAeiGWehWHNycSvLYcN8bzQcXPe2yiHxF25b) |
| 19:27:30 | Graduate, step 1: team vesting escrow | DBC `CreateLocker` → Met Lock `CreateVestingEscrowV2` | [tx](https://solscan.io/tx/29a6j3UXSAQzgzd8m7HAG3Ngt6jBjsMYWDdeD1BWHnrfnp7BgApgfs3kbApw8LknJ4MNNpeY7duzXsia24QZSdih) |
| 19:28:11 | Graduate, step 2: migrate, LP permanently locked | DBC `MigrationDammV2` → DAMM v2 pool [`BTjz62…WEbf`](https://solscan.io/account/BTjz62LaGnREgPDCugdK1JpPYsAvPLTQM6JnrgioWEbf) | [tx](https://solscan.io/tx/u4xUbeU8oRsEHutFfQ5V51wSQDfBEPxdaPpuCgJU5bGCmxKQmYEnNVoxwLKJzZFsVwpkca6JUgv5fWqCu7ExpbF) |
| 19:28:18 | Sniper sells into DAMM v2 7 s after graduation; 7 more wallets trade the pool within 15 s | DAMM v2 `Swap` | [tx](https://solscan.io/tx/kvekUvcL8WnZkfdcu9PyN4VrkTxPeYoQyFJ7oKzq7tkdZGewiG7UNnNCSDva2ZpFVKDdfG5eCeMXCE24tjRgutS) |
| 19:31:20 | Creator claims vested team tokens (19M) | Met Lock `ClaimV2` | [tx](https://solscan.io/tx/3wzFtSMR8qBxUgk3fi51fjT71HJrYH9FWXrTPV1mZAUDyXCVXi9CNMRCuK8Aj4V4erDJEvLefPwf7WTV6NXxfjUg) |
| 19:31:45 | One-tx claim: DBC creator + partner fees and locked-LP DAMM v2 fees | DBC + DAMM v2 | [tx](https://solscan.io/tx/4Z83PVzarc5ocT5jYgmAdZ6Xi1do7LKQd92G5A4dYfFPULbZK4ZRsvousp9BmfFb8Z1v1VztXcQHVzQrYK6ksWFp) |

**What mainnet taught us.** The anti-sniper fee did its job at entry (the bot paid ~37%), but
on a small raise the bot still profited by selling into the fresh DAMM v2 pool seconds after
graduation. Fees tax snipers; they don't stop them. That is the same failure mode Ratchet
targets for team unlocks, and the argument for the vault program below: supply that should
not hit a thin pool needs to be held by a program, not by goodwill.

## Verified on devnet: the DLMM unlock ladder

The ladder was run end to end on devnet (it needs ~0.1 SOL of DLMM bin-array rent, which we
didn't spend on mainnet). Token RTST1, 2026-10-10:

| Step | Tx |
|---|---|
| Configs (anti-sniper, fair raise) | [1](https://solscan.io/tx/3SftJHsb4L2efGLTkHeGwgyLCbCX3b9N3dyFb8m4ADVqX5W9ZJunfHxmFjJbzPCtrFox2PWTGrfXi7BQG6kidFFS?cluster=devnet) · [2](https://solscan.io/tx/4BF8rop784xLy6zKSU5j1rweXgrad4ycpnvt6L649gcFMC6aQpnAqKysBq9vhvWvq3J7WT68iwpvpc4YmK7yjNk7?cluster=devnet) |
| Launch | [tx](https://solscan.io/tx/2iMbeeXsWE3NnxWjXXsvGiqcyvnV2gcXgfVwxtz1vMqc22NDntpp6TSiVrktPTFvESkfpSxhoFiF1TXPuiML9oFn?cluster=devnet) |
| Buys to graduation (first one 20 s after launch paid ~26%) | [1](https://solscan.io/tx/3X19tMPoGEu1SDiZJbyhSQdW8sHu6hBPhjaUie4SJXNKDuebiQuWFykFoKFni1JDSUWxoHJp7FVZg6LPnZGNVi3y?cluster=devnet) · [2](https://solscan.io/tx/3nZ2SVbn67X7ujwxU8MDXJpMY293SbQ4Wn8tmWvx7qpxWnFimCtXh9KvXS4wpqysCpBxiugJmGkA3rgzBmFC4vS6?cluster=devnet) · [3](https://solscan.io/tx/25pcGNzkqPQ83zRWT5qPLGCPbKQUUXuoKL3Ve7rTgUfgncPe19wjGvUu8Ys1he9v5sf9Qu4kLFTZpxJTu3KhpXKX?cluster=devnet) |
| Vesting escrow | [tx](https://solscan.io/tx/4S817copM6rsHt8dbvfP6CKNnzxrjtzTxuK9iN5HNPY2t7La2ZEp1LfP2tHi1A2G1NMueLXb32AKWN41t8F7syum?cluster=devnet) |
| Migrate to DAMM v2 | [tx](https://solscan.io/tx/4SaHh2WXm4LThXrm6y39YW5TwrUetjct6wc34gZidDuefPbkUqfq84dhLsCXHD3NwPVk18uFoyPnQciiDfoq74VP?cluster=devnet) |
| DLMM pair (limit-order type) | [tx](https://solscan.io/tx/3JFbqkDyy6DSdZ2CTSYPAQveDGPJevddh2BCfFVkfxKYAhGPJhjQKqebqxn31h2ouMmNECyxdtWDDaBsRV4boPSJ?cluster=devnet) |
| Vesting claims | [1](https://solscan.io/tx/BkJ7NpKCuR5b5YTxF48edcFXZsk5mBrxc7ZEw4dVa3wzVXLkiZWCgtBbqRySSHK9gN7V6aNTrnZuABApmsdZuMh?cluster=devnet) · [2](https://solscan.io/tx/4dHHy4UWZsQ458PHDHZKz8mKJKPZKLbj7mJCLLDCNK5iLjCPwByn94Y228wSSRPDkrxQ6BhYi38nHAvA5wiFLbhq?cluster=devnet) · [3](https://solscan.io/tx/3Dgwm8qa7TL6M3SrFSLdEfdMwhLZ3WqVYSuBvBRMYr3aXsuJ9bU4FSL8Kfp9AHQ7PXpDbG792KPwCWdPaEMNZtQV?cluster=devnet) |
| **Unlock ladder** (DLMM asks, 1.25× → 6× graduation price) | [1](https://solscan.io/tx/4oZC6tSNPNGoPATUaVqzK3bxxaaQz1QaCZep2pZZY7sUyPwVHsEdt7zzzwis5dNobhdwRUYSYLC1Fq71BKZTbAV3?cluster=devnet) · [2](https://solscan.io/tx/2qAkRGz8sRYFKTrTJeaMov54g4GMsfYYYKg77Db3L2FwiAExqN5vMBXm55gN7NfDJeXD27Vgqx61RZeryAXzzp5B?cluster=devnet) |
| One-tx fee claim (DBC + launch fee + locked-LP fees) | [tx](https://solscan.io/tx/2nXYN2tcqnkihyjG9wERD8Ny9iYi2n7KzfAjt6iCfJ2BDjc7gDQuXAxMR5UdFzNpY2Qjt1cxydyZ7Z5WerAx77oA?cluster=devnet) |

## Tests and CI

`pnpm --filter @meteora-invent/scaffold/fun-launch test` runs the unit tests (vitest) for the
launch check, the unlock-ladder rules shared by the API and UI, and the preset registry.
GitHub Actions runs typecheck, tests, a production build and the MCP typecheck on every push.

## Running locally

```bash
pnpm install
cd scaffolds/fun-launch
cp .env.example .env.local   # RPC_URL, NEXT_PUBLIC_NETWORK=devnet|mainnet, storage
pnpm dev
```

Preset tooling (Invent studio, with config-path overrides added for Ratchet):

```bash
cd studio
DBC_CONFIG_PATH=../presets/devnet/anti-sniper.jsonc pnpm tsx src/ratchet/preview_preset.ts
DBC_CONFIG_PATH=../presets/devnet/anti-sniper.jsonc pnpm dbc-create-config
```

Built on [Meteora Invent](README.meteora-invent.md).
