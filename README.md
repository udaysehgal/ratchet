# Ratchet

**A Meteora launchpad where team unlocks only sell into strength.**

Live on Solana mainnet: **https://ratchet-olive.vercel.app**

Every Ratchet token:

1. **Launches on a Meteora DBC bonding curve** from a preset config (anti-sniper or fair raise).
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

| | Anti-sniper | Fair raise |
|---|---|---|
| Config | [`6tMtkf…YhH9`](https://solscan.io/account/6tMtkfHkvvSVsCSpXbcCqVCAJYEg7SJQkDmvYH2urYh9) | [`Ery2mG…wwBW`](https://solscan.io/account/Ery2mGuMQ27iV3wCqCd7Ne45XkRCV6fSf2s1j87WwwBW) |
| Curve | `buildCurve`, 20% supply to migration | `buildCurveWithCustomSqrtPrices`, price moves 5% start → graduation |
| Graduation | 10 SOL | ~10 SOL |
| Market cap | ~4 → 50 SOL | ~21.5 → 22.6 SOL |
| Base fee | exponential fee scheduler, 50% → 1% over 2 min | 1% flat |
| Dynamic fee | on | off |
| Pool creation fee | 0.02 SOL (90% partner) | 0.02 SOL (90% partner) |
| Curve fee split | 50% creator / 50% partner | 50% creator / 50% partner |
| Team allocation | 10% via DBC locked vesting: 1% at 1 h after graduation, 9% daily over 30 days | same |
| Migration | DAMM v2, customizable fee: 1% pool fee, dynamic fee, **compounding** (50% of fees back into liquidity) | same |
| LP | 100% permanently locked (50% creator / 50% partner) | same |

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

### Public graduation feed

```
GET https://ratchet-olive.vercel.app/api/feed?minProgress=0.8&status=live
```

CORS-open JSON of every Ratchet launch: mint, DBC pool and config, SOL raised, graduation
threshold, progress, graduated flag. Built for terminals and bots that want pools about to
migrate into DAMM v2.

---

## Verified on devnet, end to end

The full lifecycle was run on devnet before going to mainnet: config → launch →
anti-sniper fee (a buy 20 s after launch paid ~26%) → graduation → DAMM v2 migration →
vesting claim → DLMM pair → ask ladder at 1.25× to 6× → DAMM v2 trades → one-transaction
claim of creator fees, partner fees, launch fee and locked-LP fees.

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
