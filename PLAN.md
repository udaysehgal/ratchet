# Ratchet: 3-day mainnet plan

Launchpad on Meteora where tokens launch on DBC, graduate to DAMM v2, and team unlocks
are committed as DLMM limit-order asks above a rising floor. Target: live on **Solana mainnet**.

Rule: use Meteora for everything it covers (DBC / DAMM v2 / DLMM programs + SDKs, Invent studio
actions, the fun-launch scaffold). Non-Meteora only where Meteora has nothing: wallet adapter,
metadata storage, hosting, RPC.

## Meteora surface

| Layer | Used for |
|---|---|
| DBC | Preset configs (fee decay, dynamic fee, pool creation fee, partner/creator fee split, locked vesting, LP lock/vesting); pool creation; swaps; fee claims; pool reads for explore / feed |
| DAMM v2 | Graduation target; compounding fee mode; market-cap fee scheduler; LP lock; position fee claims |
| DLMM | Permissionless pair after graduation; `place_limit_order` unlock ladder; ladder reads |
| Invent studio | Creating configs and rehearsing every step from the CLI (`dbc-*`, `dlmm-*`, `damm-v2-*`) |
| fun-launch | Frontend base |

## Day 1: configs + launch flow
- [ ] Keypairs: deployer/partner (fee claimer) + test creator. Fund on devnet.
- [ ] Studio rehearsal on devnet: `dbc-create-config` → `dbc-create-pool` → `dbc-swap` to threshold →
      `dbc-migrate-to-damm-v2` → `dlmm-create-pool` → `dlmm-place-limit-order`. Note every cost and failure.
- [ ] Two presets as studio config files:
  - **Anti-sniper**: exponential fee decay from high start, dynamic fee, DAMM v2 compounding after graduation.
  - **Fair raise**: near-flat curve (`buildCurveWithCustomSqrtPrices`, a few % of price movement), compounding after graduation.
  - Both: creator locked vesting (team allocation), LP permanently locked, small pool creation fee.
- [ ] Frontend: replace single `POOL_CONFIG_KEY` with a preset registry; preset picker in the create form.
- [ ] Explore page: replace Jupiter data API with on-chain reads via DBC SDK (pools by our configs).

## Day 2: graduation + DLMM ladder + mainnet configs
- [ ] Token page: curve progress (`quote_reserve / migration_quote_threshold`), migration stage, DAMM v2 pool link after graduation.
- [ ] "Commit unlocks" flow (creator wallet): create DLMM pair if missing → place asks at floor ×1, ×1.25, ×1.5…
      Ladder shown publicly on the token page from on-chain limit orders.
- [ ] "Near graduation" feed page from DBC pool state.
- [ ] **Create both preset configs on mainnet.** Deploy frontend (Vercel) pointing at mainnet.

## Day 3: mainnet launches + submission
- [ ] 1–2 real mainnet launches through our UI; get real people trading; drive one to graduation if budget allows.
- [ ] Commit an unlock ladder on mainnet.
- [ ] README (architecture, every Meteora call used), demo video, submission.
- [ ] If repo is private: add GitHub `dannxbt` with read access.

## Cut (pitch as "next")
- `ratchet-vault` program that holds the creator role and *enforces* the ladder (verified possible:
  `transfer_pool_creator` works pre-graduation; vesting goes to the creator).
- xStock-quoted preset (TSLAx/NVDAx have DBC + DAMM v2 token badges on mainnet).
- Buyback keeper, public feed API/SDK, preset leaderboard.

## Needed from Uday
- Mainnet wallet with SOL (config rent, launches, seeding a graduation): exact amount measured on Day 1 devnet run.
- Paid mainnet RPC (Helius or similar); public RPC rate-limits will break the app.
- Metadata storage: Cloudflare R2 creds (scaffold default).
- Vercel account for hosting.
