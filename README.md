# Ratchet

**A Meteora launchpad where team unlocks only sell into strength.**

**[Live on Solana mainnet →](https://ratchet-olive.vercel.app)** · [Evidence](docs/EVIDENCE.md) · [Architecture](docs/ARCHITECTURE.md) · [Submission](docs/SUBMISSION.md)

![Ratchet home page](docs/img/home.png)

Team unlocks are the classic way launches die: a cliff hits and the team market-sells into
holders. Ratchet launches every token on Meteora's bonding curve, graduates it into a pool whose
liquidity can never be pulled, and only lets the team's unlocked tokens reach the market as
sell orders **at 1.25× the graduation price or higher**. If the team sells, it sells into
strength.

## How it works

```mermaid
flowchart LR
    A["<b>1 · Launch</b><br/>Meteora DBC curve<br/>from a preset"] --> B["<b>2 · Graduate</b><br/>Meteora DAMM v2 pool<br/>100% LP locked forever"]
    B --> C["<b>3 · Vest</b><br/>team tokens held in<br/>Meteora Lock escrow"]
    C --> D["<b>4 · Ladder</b><br/>Meteora DLMM sell orders<br/>≥ 1.25× graduation price"]
```

Four Meteora programs, every transaction built from Meteora's SDKs and signed by the user's
wallet. Half of every DAMM v2 fee compounds back into the pool, so liquidity only deepens.

## Proof on mainnet

| Result | On-chain detail |
|---|---|
| **Launch → graduation in 5 minutes** | CHRL went from launch to a locked DAMM v2 pool through the live app ([timeline + every tx](docs/EVIDENCE.md#mainnet-chrl-launch-to-graduation-in-5-minutes)) |
| **9 wallets** | traded CHRL across DBC and DAMM v2; 7 hit the graduated pool within 15 s |
| **Sniper paid ~37%** | in anti-sniper fees 15 s after launch, and those fees went to the creator |
| **4 preset configs** | including an **equity raise priced in tokenized Tesla stock (TSLAx)** |
| **Full ladder on devnet** | DLMM asks from 1.25× to 6× the graduation price ([txs](docs/EVIDENCE.md#devnet-full-lifecycle-including-the-dlmm-unlock-ladder)) |
| **Vault program on devnet** | enforces the ladder on-chain, 20/20 lifecycle checks ([txs](docs/EVIDENCE.md#devnet-the-vault-enforcing-the-ladder-on-chain)) |

## Presets

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/img/preset-curves-dark.svg">
  <img alt="Price relative to opening price as each preset's curve fills: micro raise 289×, anti-sniper 12×, fair and equity raise 1.05× at graduation" src="docs/img/preset-curves-light.svg" width="760">
</picture>

| Preset | Raises in | For |
|---|---|---|
| **Anti-sniper** | SOL | Memes: launch-block buyers pay up to 50%, decaying to 1% in 2 minutes |
| **Fair raise** | SOL | Communities that want price discovery without a pump: last buyer pays ~5% more |
| **Equity raise** | **TSLAx** | Raising in tokenized stock on the same flat curve, graduating into a TSLAx pool |
| **Micro raise** | SOL | Small raises (0.1 SOL). The thin pool it creates is what our launch check now warns about |

Full parameters and config addresses: [ARCHITECTURE.md](docs/ARCHITECTURE.md#presets). The figure
is generated from live config data by [`scripts/make-figures.mjs`](scripts/make-figures.mjs).

## What's in the box

<table>
<tr>
<td width="50%"><img src="docs/img/token.png" alt="Token page"><br/><b>Token page</b>: curve, trading on DBC then DAMM v2, team vesting, the public unlock ladder and a launch check</td>
<td width="50%"><img src="docs/img/check.png" alt="Launch check"><br/><b>Launch check for any Meteora DBC token</b>: can LP be pulled, how much of the raise is paid out, mint authority, team vesting, post-graduation exit drain</td>
</tr>
</table>

- **Launch** from four presets ([create page](docs/img/create.png)), with a live curve preview read from each DBC config.
- **Graduate** with one click: anyone can migrate a full curve into DAMM v2.
- **Unlock ladder**: vested team tokens become DLMM limit asks at 1.25× the graduation price or higher.
- **Earnings**: one transaction claims creator, partner and locked-LP fees.
- **For AI agents**: an [MCP server and Agent Skill](packages/ratchet-mcp) to list launches, check any DBC token and build unsigned transactions.
- **Public APIs**: graduation feed, launch check and presets as CORS-open JSON ([endpoints](docs/ARCHITECTURE.md#apis-and-the-mcp-server)).
- **30 unit tests and CI** (app typecheck, tests and build; vault program tests) on every push.

## The vault: enforcing the ladder on-chain

On mainnet today the ladder is enforced by Ratchet's API and visible on-chain. The
[**ratchet-vault program**](programs/ratchet-vault) makes it binding: it takes the DBC pool's
creator role in the launch transaction, so team vesting and creator fees land in a PDA, and
team tokens can only leave as DLMM asks at ≥ 1.25× the graduation price. The floor only rises.

**Deployed on devnet and passing 20/20 end-to-end checks**: asks above the floor accepted,
below-floor asks and floor cuts refused, a buyer lifting the ask with proceeds reaching the team
only through the vault. [Spec](docs/VAULT.md) · [transactions](docs/EVIDENCE.md#devnet-the-vault-enforcing-the-ladder-on-chain)

## Run it locally

```bash
pnpm install
cd scaffolds/fun-launch
cp .env.example .env.local   # RPC_URL, NEXT_PUBLIC_NETWORK=devnet|mainnet, storage
pnpm dev                     # pnpm test runs the unit tests
```

Presets are created with the Invent studio CLI:
`DBC_CONFIG_PATH=../presets/mainnet/anti-sniper.jsonc pnpm dbc-create-config` from [`studio/`](studio).

Built on [Meteora Invent](README.meteora-invent.md).
