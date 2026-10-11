# Ratchet vault: enforcing the unlock ladder on-chain

Status: **spec + devnet implementation** ([`programs/ratchet-vault`](../programs/ratchet-vault)).
Not deployed to mainnet.

## Problem

Today Ratchet's ladder is a promise. The API refuses to build team sell orders below 1.25× the
graduation price, but the creator's wallet receives the vested tokens and owns the DLMM orders,
so it can cancel them and market-sell. Mainnet showed the cost of relying on goodwill: on CHRL a
sniper paid ~37% in fees and still drained the graduated pool seconds later
([EVIDENCE.md](EVIDENCE.md#what-mainnet-taught-us)). Fees tax unwanted supply; only a program
can hold it back.

## Idea

Make a program-derived address (the **vault**) the DBC pool's creator before graduation. From
then on, everything Meteora sends "to the creator" lands in an account no human controls:

- the **team vesting escrow** (Meteora Lock) that DBC creates at graduation,
- the **creator share of trading fees** on the DBC curve,
- the **creator's locked LP position** in the graduated DAMM v2 pool.

The vault program lets team tokens leave in exactly one way: as **DLMM ask orders priced at or
above a floor**, which starts at 1.25× the graduation price and can only move up. A *ratchet*.

## Verified building blocks

Read from the instruction definitions in the Meteora SDKs used by Ratchet (DBC 1.5.13, DLMM,
Meteora Lock, DAMM v2):

| Instruction | Accounts that matter | What it means for the vault |
|---|---|---|
| DBC `transfer_pool_creator` | `virtual_pool` (w), `config`, `creator` (**signer**), `new_creator` | The creator can hand the role to the vault PDA in the launch transaction. Allowed until the curve completes. |
| DBC `create_locker` | `creator` (not a signer), `escrow`, `payer` (signer) | Called at graduation by anyone. The vesting escrow's recipient is whoever is the pool creator then: the vault. |
| Meteora Lock `claim_v2` | `escrow`, `recipient` (**signer**), `recipient_token` | The vault signs with its PDA seeds. Vested tokens go to the vault's token account. |
| DBC `claim_creator_trading_fee` | `creator` (**signer**), `token_a_account`, `token_b_account` | The vault claims curve fees with its PDA. |
| DLMM `place_limit_order` | `limit_order` (**signer**, new account), `owner` (not a signer), `sender` (**signer**), `user_token` | The vault places asks from its own token account. The order account is a PDA of the vault program, so the program signs for its creation. |
| DLMM `cancel_limit_order` | `owner` (**signer**), `owner_token_x`, `owner_token_y` | Only the vault can cancel. Unfilled tokens and filled proceeds both return to the vault's own token accounts. |
| DLMM `close_limit_order_if_empty` | `owner` (**signer**), `rent_receiver` | Reclaims order rent after a cancel. |
| DAMM v2 `claim_position_fee` | `position_nft_account`, `signer` (**signer**) | The vault holds the creator's position NFT and claims its LP fees. |

The key property: **because cancelled orders return tokens to the vault, cancelling can never
leak supply.** The only exit for team tokens is a resting ask at or above the floor.

## Accounts

```text
Vault  PDA ["vault", dbc_pool]
  dbc_pool            Pubkey   the launch
  base_mint           Pubkey   launched token
  quote_mint          Pubkey   SOL or an xStock
  beneficiary         Pubkey   team wallet: receives quote proceeds, sets prices
  graduation_price    u128     Q64.64 quote-per-base (raw units), from config.migration_sqrt_price²
  floor_bps           u16      floor = graduation_price × floor_bps / 10_000; starts at 12_500, only rises
  sunset_ts           i64      0 = never; else team tokens may be released after this time
  orders_placed       u64      nonce for order PDAs
  bump                u8

Order  PDA ["order", vault, nonce]   (owned by DLMM: the limit_order account itself)
```

Graduation price comes from the DBC **config** (`migration_sqrt_price`), which is immutable, so
the floor can't be gamed by moving the pool price.

## Instructions

| Instruction | Signer | Effect |
|---|---|---|
| `adopt_launch(beneficiary, sunset_ts)` | current pool creator | Checks the pool is DBC-owned and not graduated, reads the graduation price from its config, creates the vault, then CPIs `transfer_pool_creator` to the vault PDA. Meant to run in the launch transaction, right after `initialize_virtual_pool`. |
| `claim_vested()` | anyone | CPIs Meteora Lock `claim_v2` with the vault as recipient. Tokens stay in the vault. |
| `place_ask(nonce, bins[])` | beneficiary | Checks the DLMM pair trades `base_mint` against `quote_mint`, and that **every bin's price ≥ floor**. CPIs `place_limit_order` with the vault as owner and sender. |
| `cancel_ask(nonce)` | beneficiary | CPIs `cancel_limit_order` (unfilled base back to the vault, filled quote to the vault), forwards all quote to the beneficiary, closes the order. |
| `raise_floor(floor_bps)` | beneficiary | Only increases. Existing orders below a new floor can be cancelled, never re-placed. |
| `collect_fees()` | anyone | CPIs DBC `claim_creator_trading_fee`; **quote** goes to the beneficiary, **base** fees stay in the vault (they're supply too). |
| `set_beneficiary(new)` | beneficiary | Key rotation. |
| `release_after_sunset()` | beneficiary | Only if `sunset_ts` is set and has passed. Set at adoption, visible to holders. |

## Invariants

1. Base tokens in the vault leave only through a DLMM ask whose every bin prices at or above the
   current floor, or through `release_after_sunset` after a sunset fixed at adoption.
2. The floor starts at 1.25× the graduation price taken from the DBC config, and never decreases.
3. Quote (proceeds and fees) is never held: each instruction that receives it forwards it to the
   beneficiary.
4. The vault signs only these CPIs: `transfer_pool_creator` (as recipient, not signer),
   `claim_v2`, `claim_creator_trading_fee`, `place_limit_order`, `cancel_limit_order`,
   `close_limit_order_if_empty`. No instruction lets the beneficiary name an arbitrary token
   destination for base tokens.
5. Every Meteora account passed in is checked for its owning program and its link to the vault
   (pool ↔ config ↔ mints ↔ pair).

## Price check

DLMM bin prices are `(1 + bin_step / 10_000) ^ bin_id` in Q64.64, quote per base in raw units:
the same units as DBC's `migration_sqrt_price²`. The vault recomputes each bin's price with
Q64.64 binary exponentiation, rounding down, and requires
`price(bin) × 10_000 ≥ graduation_price × floor_bps`. Rounding down makes the check
conservative: a bin that passes is never below the floor.

## Threats and answers

| Threat | Answer |
|---|---|
| Team cancels the ladder and dumps | Cancelled tokens return to the vault, which has no other exit. |
| Team places an ask at a low price | `place_ask` rejects any bin below the floor. |
| Team lowers the floor | `raise_floor` only increases. |
| Fake DLMM pair or pool | Owner-program checks and mint links on every account. |
| Team buys its own asks | They pay ≥ 1.25× graduation price with their own money; no harm to holders. |
| Team sells tokens it bought on the curve | Out of scope: the vault governs the team allocation, not market buys. The launch check shows holder concentration risks separately. |
| Program upgrade | Devnet build keeps an upgrade authority. A mainnet release would be made immutable after audit (or held by a timelocked multisig), and the launch check would show which. |
| Meteora interface changes | CPIs are built from Meteora's published IDLs; integration tests run the full lifecycle on devnet against the deployed programs. |

## Changes in the Ratchet app

- Launch transaction: `initialize_virtual_pool` → `adopt_launch` in one transaction, so a launch
  is never un-vaulted.
- Token page: "Team unlocks enforced by vault" with the floor, inventory and open orders.
- Launch check: a pass when the pool creator is a Ratchet vault, with the sunset date if any.
- Creator controls call `place_ask` / `cancel_ask` / `raise_floor` instead of the DLMM SDK.

## Test plan (devnet)

Devnet runs the same Meteora program IDs as mainnet.

1. Create a low-threshold devnet preset, launch, `adopt_launch` in the same transaction.
2. Buy to graduation, `create_locker`, migrate to DAMM v2.
3. `claim_vested` → tokens in the vault, not the team wallet.
4. `place_ask` at 1.25× and 2× → succeeds. `place_ask` at 1.2× → rejected.
5. `raise_floor` to 1.5×, then `place_ask` at 1.3× → rejected; lowering the floor → rejected.
6. `cancel_ask` → base back in the vault, quote to the beneficiary.
7. `collect_fees` → quote to the beneficiary, base stays.
8. Any attempt by the team wallet to move vault tokens directly → impossible (no instruction).
