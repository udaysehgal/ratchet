//! Ratchet vault: holds a Meteora DBC launch's creator role so the team allocation can only
//! leave as Meteora DLMM ask orders priced at or above a floor (1.25x the graduation price,
//! rising only). See docs/VAULT.md.
pub mod error;
pub mod meteora;
pub mod price;
pub mod state;

use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::Clock,
    entrypoint::ProgramResult,
    msg,
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    pubkey::Pubkey,
    rent::Rent,
    sysvar::Sysvar,
};

#[allow(deprecated)]
use solana_program::system_instruction;
use error::VaultError;
use state::{find_order, find_vault, Vault, MIN_FLOOR_BPS, MIN_SUNSET_DELAY, ORDER_SEED, VAULT_DISCRIMINATOR, VAULT_SPACE};

const SYSTEM_PROGRAM: Pubkey = solana_program::pubkey!("11111111111111111111111111111111");

solana_program::declare_id!("BrwQHeRJWXDbXgUVi1TKdoDbnfB5kcRTcieYmSH2NzWB");

#[cfg(not(feature = "no-entrypoint"))]
solana_program::entrypoint!(process_instruction);

#[derive(BorshSerialize, BorshDeserialize, Clone, PartialEq)]
pub enum VaultInstruction {
    /// Take over a DBC pool's creator role. Signer: the current creator.
    /// Accounts: creator (s, w), vault (w), virtual_pool (w), config, system_program,
    /// dbc_event_authority, dbc_program.
    AdoptLaunch { beneficiary: Pubkey, sunset_ts: i64 },
    /// Claim vested team tokens from the Meteora Lock escrow into the vault. Anyone.
    /// Accounts: vault (w), escrow (w), base_mint, escrow_token (w), vault_base_token (w),
    /// memo_program, token_program, locker_event_authority, locker_program.
    ClaimVested,
    /// Sell vault tokens through a DLMM ask. Every bin must be priced at or above the floor.
    /// Signer: beneficiary (also pays rent).
    /// Accounts: beneficiary (s, w), vault (w), lb_pair (w), bitmap_ext (w, or DLMM program),
    /// reserve_x (w), base_mint, limit_order (w), vault_base_token (w), token_program,
    /// system_program, dlmm_event_authority, dlmm_program, then bin arrays.
    /// `hook_slices` are forwarded to DLMM as RemainingAccountsInfo (transfer-hook accounts
    /// precede the bin arrays); they never affect the price check.
    PlaceAsk { nonce: u64, bins: Vec<(i32, u64)>, hook_slices: Vec<(u8, u8)> },
    /// Cancel an ask: unfilled tokens return to the vault, proceeds go to the beneficiary.
    /// Accounts: beneficiary (s, w), vault, lb_pair (w), bitmap_ext, reserve_x (w), reserve_y (w),
    /// base_mint, quote_mint, limit_order (w), vault_base_token (w), vault_quote_token (w),
    /// base_token_program, quote_token_program, memo_program, dlmm_event_authority,
    /// dlmm_program, beneficiary_quote_token (w), then bin arrays.
    CancelAsk { nonce: u64, bins: Vec<i32>, close: bool, hook_slices: Vec<(u8, u8)> },
    /// Raise the floor. It can never go down. Signer: beneficiary.
    RaiseFloor { floor_bps: u16 },
    /// Claim the creator's DBC trading fees. Quote goes to the beneficiary; base stays in the
    /// vault (it is supply too). Anyone.
    /// Accounts: vault, pool_authority, virtual_pool (w), vault_base_token (w),
    /// vault_quote_token (w), base_vault (w), quote_vault (w), base_mint, quote_mint,
    /// base_token_program, quote_token_program, dbc_event_authority, dbc_program,
    /// beneficiary_quote_token (w).
    CollectFees,
    /// Rotate the beneficiary. Signer: current beneficiary.
    SetBeneficiary { new_beneficiary: Pubkey },
    /// Only after a sunset fixed at adoption: release base tokens to the beneficiary.
    /// Accounts: beneficiary (s), vault, vault_base_token (w), base_mint,
    /// beneficiary_base_token (w), token_program.
    ReleaseAfterSunset { amount: u64 },
    /// Claim LP fees on the creator's DAMM v2 position (its NFT sits in the vault). Quote goes to
    /// the beneficiary; base stays in the vault. Anyone.
    /// Accounts: vault, pool_authority, damm_pool, position (w), vault_base_token (w),
    /// vault_quote_token (w), token_a_vault (w), token_b_vault (w), base_mint, quote_mint,
    /// position_nft_account, base_token_program, quote_token_program, damm_event_authority,
    /// damm_program, beneficiary_quote_token (w).
    ClaimPositionFee,
    /// Withdraw the creator's DBC curve surplus to the beneficiary. Anyone.
    /// Accounts: vault, pool_authority, config, virtual_pool (w), vault_quote_token (w),
    /// quote_vault (w), quote_mint, quote_token_program, dbc_event_authority, dbc_program,
    /// beneficiary_quote_token (w).
    WithdrawSurplus,
    /// Withdraw the creator's share of the DBC migration fee to the beneficiary. Anyone.
    /// Accounts: as WithdrawSurplus.
    WithdrawMigrationFee,
}

pub fn process_instruction(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let ix = VaultInstruction::try_from_slice(data).map_err(|_| ProgramError::InvalidInstructionData)?;
    match ix {
        VaultInstruction::AdoptLaunch { beneficiary, sunset_ts } => adopt_launch(program_id, accounts, beneficiary, sunset_ts),
        VaultInstruction::ClaimVested => claim_vested(program_id, accounts),
        VaultInstruction::PlaceAsk { nonce, bins, hook_slices } => place_ask(program_id, accounts, nonce, bins, hook_slices),
        VaultInstruction::CancelAsk { nonce, bins, close, hook_slices } => cancel_ask(program_id, accounts, nonce, bins, close, hook_slices),
        VaultInstruction::RaiseFloor { floor_bps } => raise_floor(program_id, accounts, floor_bps),
        VaultInstruction::CollectFees => collect_fees(program_id, accounts),
        VaultInstruction::SetBeneficiary { new_beneficiary } => set_beneficiary(program_id, accounts, new_beneficiary),
        VaultInstruction::ReleaseAfterSunset { amount } => release_after_sunset(program_id, accounts, amount),
        VaultInstruction::ClaimPositionFee => claim_position_fee(program_id, accounts),
        VaultInstruction::WithdrawSurplus => withdraw_creator_quote(program_id, accounts, meteora::creator_withdraw_surplus),
        VaultInstruction::WithdrawMigrationFee => {
            withdraw_creator_quote(program_id, accounts, meteora::creator_withdraw_migration_fee)
        }
    }
}

fn require_beneficiary(vault: &Vault, signer: &AccountInfo) -> ProgramResult {
    if !signer.is_signer || *signer.key != vault.beneficiary {
        return Err(VaultError::NotBeneficiary.into());
    }
    Ok(())
}

fn require_program(account: &AccountInfo, id: &Pubkey) -> ProgramResult {
    if account.key != id {
        return Err(ProgramError::IncorrectProgramId);
    }
    Ok(())
}

/// Forward the vault's entire quote balance to the beneficiary's token account.
fn forward_quote<'a>(
    vault: &Vault,
    vault_info: &AccountInfo<'a>,
    vault_quote: &AccountInfo<'a>,
    quote_mint: &AccountInfo<'a>,
    beneficiary_quote: &AccountInfo<'a>,
    token_program: &AccountInfo<'a>,
) -> ProgramResult {
    let balance = meteora::token_account(vault_quote, &vault.quote_mint, vault_info.key)?;
    meteora::token_account(beneficiary_quote, &vault.quote_mint, &vault.beneficiary)?;
    if balance == 0 {
        return Ok(());
    }
    if *quote_mint.key != vault.quote_mint {
        return Err(VaultError::MintMismatch.into());
    }
    meteora::require_token_program(quote_mint, token_program)?;
    let decimals = meteora::mint_decimals(quote_mint)?;
    let ix = meteora::transfer_checked(token_program.key, [vault_quote, quote_mint, beneficiary_quote, vault_info], balance, decimals);
    let bump = [vault.bump];
    invoke_signed(
        &ix,
        &[vault_quote.clone(), quote_mint.clone(), beneficiary_quote.clone(), vault_info.clone(), token_program.clone()],
        &[&Vault::seeds(&vault.dbc_pool, &bump)],
    )
}

/// 0 (never) or at least MIN_SUNSET_DELAY after `now`: a past or near sunset would let the team
/// skip the floor while the launch still shows as vaulted.
fn validate_sunset(sunset_ts: i64, now: i64) -> Result<(), VaultError> {
    if sunset_ts == 0 {
        return Ok(());
    }
    match now.checked_add(MIN_SUNSET_DELAY) {
        Some(earliest) if sunset_ts >= earliest => Ok(()),
        _ => Err(VaultError::SunsetTooSoon),
    }
}

/// Create a PDA owned by this program. Works even if someone pre-funded the address: plain
/// `create_account` fails on any lamports, so a 1-lamport transfer would block adoption forever.
fn create_pda<'a>(
    payer: &AccountInfo<'a>,
    pda: &AccountInfo<'a>,
    system: &AccountInfo<'a>,
    space: usize,
    owner: &Pubkey,
    seeds: &[&[u8]],
) -> ProgramResult {
    let rent = Rent::get()?.minimum_balance(space);
    let current = pda.lamports();
    if current == 0 {
        return invoke_signed(
            &system_instruction::create_account(payer.key, pda.key, rent, space as u64, owner),
            &[payer.clone(), pda.clone(), system.clone()],
            &[seeds],
        );
    }
    if pda.owner != &SYSTEM_PROGRAM || !pda.data_is_empty() {
        return Err(VaultError::InvalidVault.into());
    }
    if current < rent {
        invoke(
            &system_instruction::transfer(payer.key, pda.key, rent - current),
            &[payer.clone(), pda.clone(), system.clone()],
        )?;
    }
    invoke_signed(&system_instruction::allocate(pda.key, space as u64), &[pda.clone(), system.clone()], &[seeds])?;
    invoke_signed(&system_instruction::assign(pda.key, owner), &[pda.clone(), system.clone()], &[seeds])
}

fn adopt_launch(program_id: &Pubkey, accounts: &[AccountInfo], beneficiary: Pubkey, sunset_ts: i64) -> ProgramResult {
    let it = &mut accounts.iter();
    let creator = next_account_info(it)?;
    let vault_info = next_account_info(it)?;
    let pool_info = next_account_info(it)?;
    let config_info = next_account_info(it)?;
    let system = next_account_info(it)?;
    let event_authority = next_account_info(it)?;
    let dbc_program = next_account_info(it)?;
    require_program(system, &SYSTEM_PROGRAM)?;
    require_program(dbc_program, &meteora::DBC_PROGRAM)?;
    validate_sunset(sunset_ts, Clock::get()?.unix_timestamp)?;

    let pool = meteora::read_dbc_pool(pool_info)?;
    if !creator.is_signer || pool.creator != *creator.key {
        return Err(VaultError::NotPoolCreator.into());
    }
    if pool.migrated {
        return Err(VaultError::AlreadyGraduated.into());
    }
    if pool.config != *config_info.key {
        return Err(VaultError::PoolMismatch.into());
    }
    let config = meteora::read_dbc_config(config_info)?;
    let graduation_price_q64 =
        price::price_from_sqrt_up(config.migration_sqrt_price).ok_or(VaultError::MathOverflow)?;

    let (vault_key, bump) = find_vault(pool_info.key, program_id);
    if vault_key != *vault_info.key {
        return Err(VaultError::InvalidVault.into());
    }
    let bump_seed = [bump];
    let seeds = Vault::seeds(pool_info.key, &bump_seed);
    create_pda(creator, vault_info, system, VAULT_SPACE, program_id, &seeds)?;
    Vault {
        discriminator: VAULT_DISCRIMINATOR,
        dbc_pool: *pool_info.key,
        base_mint: pool.base_mint,
        quote_mint: config.quote_mint,
        beneficiary,
        graduation_price_q64,
        floor_bps: MIN_FLOOR_BPS,
        sunset_ts,
        orders_placed: 0,
        bump,
        window_start_ts: 0,
        window_budget: 0,
        window_used: 0,
    }
    .save(vault_info)?;

    // The creator signed this transaction; DBC moves the role to the vault PDA.
    invoke(
        &meteora::transfer_pool_creator([pool_info, config_info, creator, vault_info, event_authority, dbc_program]),
        &[pool_info.clone(), config_info.clone(), creator.clone(), vault_info.clone(), event_authority.clone(), dbc_program.clone()],
    )?;
    msg!("ratchet-vault: adopted launch");
    Ok(())
}

fn claim_vested(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    let it = &mut accounts.iter();
    let vault_info = next_account_info(it)?;
    let escrow = next_account_info(it)?;
    let base_mint = next_account_info(it)?;
    let escrow_token = next_account_info(it)?;
    let vault_base = next_account_info(it)?;
    let memo = next_account_info(it)?;
    let token_program = next_account_info(it)?;
    let event_authority = next_account_info(it)?;
    let locker = next_account_info(it)?;
    require_program(locker, &meteora::LOCKER_PROGRAM)?;

    let vault = Vault::load(vault_info, program_id)?;
    if *base_mint.key != vault.base_mint {
        return Err(VaultError::MintMismatch.into());
    }
    // Vested tokens can only land in the vault's own account
    meteora::token_account(vault_base, &vault.base_mint, vault_info.key)?;

    let bump = [vault.bump];
    invoke_signed(
        &meteora::locker_claim_v2([escrow, base_mint, escrow_token, vault_info, vault_base, memo, token_program, event_authority, locker]),
        &[escrow.clone(), base_mint.clone(), escrow_token.clone(), vault_info.clone(), vault_base.clone(), memo.clone(), token_program.clone(), event_authority.clone(), locker.clone()],
        &[&Vault::seeds(&vault.dbc_pool, &bump)],
    )
}

fn place_ask(program_id: &Pubkey, accounts: &[AccountInfo], nonce: u64, bins: Vec<(i32, u64)>, hook_slices: Vec<(u8, u8)>) -> ProgramResult {
    let it = &mut accounts.iter();
    let beneficiary = next_account_info(it)?;
    let vault_info = next_account_info(it)?;
    let lb_pair = next_account_info(it)?;
    let bitmap_ext = next_account_info(it)?;
    let reserve_x = next_account_info(it)?;
    let base_mint = next_account_info(it)?;
    let limit_order = next_account_info(it)?;
    let vault_base = next_account_info(it)?;
    let token_program = next_account_info(it)?;
    let system = next_account_info(it)?;
    let event_authority = next_account_info(it)?;
    let dlmm = next_account_info(it)?;
    let bin_arrays: Vec<AccountInfo> = it.cloned().collect();
    require_program(dlmm, &meteora::DLMM_PROGRAM)?;
    require_program(system, &SYSTEM_PROGRAM)?;

    let mut vault = Vault::load(vault_info, program_id)?;
    require_beneficiary(&vault, beneficiary)?;
    if bins.is_empty() {
        return Err(VaultError::NoBins.into());
    }
    if nonce != vault.orders_placed {
        return Err(VaultError::BadNonce.into());
    }
    let (order_key, order_bump) = find_order(vault_info.key, nonce, program_id);
    if order_key != *limit_order.key {
        return Err(VaultError::BadNonce.into());
    }

    // Only the public pair for this token, never a private one the team trades with itself
    if *lb_pair.key != meteora::canonical_lb_pair(&vault.base_mint, &vault.quote_mint) {
        return Err(VaultError::NotCanonicalPair.into());
    }
    // The pair must trade this launch's token against its quote token
    let pair = meteora::read_lb_pair(lb_pair)?;
    if pair.token_x != vault.base_mint || pair.token_y != vault.quote_mint || *base_mint.key != vault.base_mint {
        return Err(VaultError::MintMismatch.into());
    }
    let balance = meteora::token_account(vault_base, &vault.base_mint, vault_info.key)?;


    // The ratchet: every bin at or above the floor
    let floor = price::floor_price_up(vault.graduation_price_q64, vault.floor_bps).ok_or(VaultError::MathOverflow)?;
    for (bin_id, _) in &bins {
        if !price::bin_at_or_above_floor(*bin_id, pair.bin_step, floor) {
            msg!("ratchet-vault: bin below the floor");
            return Err(VaultError::BelowFloor.into());
        }
    }

    // The floor can't stop the team filling its own asks, so cap how much can be offered per day
    let total = bins
        .iter()
        .try_fold(0u64, |acc, (_, amount)| acc.checked_add(*amount))
        .ok_or(VaultError::MathOverflow)?;
    vault.spend_ask_budget(balance, total, Clock::get()?.unix_timestamp)?;

    let bump = [vault.bump];
    let nonce_bytes = nonce.to_le_bytes();
    let order_bump_seed = [order_bump];
    let order_seeds: [&[u8]; 4] = [ORDER_SEED, vault_info.key.as_ref(), &nonce_bytes, &order_bump_seed];
    let ix = meteora::place_ask(
        [lb_pair, bitmap_ext, reserve_x, base_mint, limit_order, beneficiary, vault_info, vault_base, vault_info, token_program, system, event_authority, dlmm],
        &bins,
        &hook_slices,
        &bin_arrays,
    );
    let mut infos = vec![
        lb_pair.clone(), bitmap_ext.clone(), reserve_x.clone(), base_mint.clone(), limit_order.clone(), beneficiary.clone(),
        vault_info.clone(), vault_base.clone(), token_program.clone(), system.clone(), event_authority.clone(), dlmm.clone(),
    ];
    infos.extend(bin_arrays);
    invoke_signed(&ix, &infos, &[&Vault::seeds(&vault.dbc_pool, &bump), &order_seeds])?;

    vault.orders_placed += 1;
    vault.save(vault_info)?;
    msg!("ratchet-vault: ask placed");
    Ok(())
}

fn cancel_ask(program_id: &Pubkey, accounts: &[AccountInfo], nonce: u64, bins: Vec<i32>, close: bool, hook_slices: Vec<(u8, u8)>) -> ProgramResult {
    let it = &mut accounts.iter();
    let beneficiary = next_account_info(it)?;
    let vault_info = next_account_info(it)?;
    let lb_pair = next_account_info(it)?;
    let bitmap_ext = next_account_info(it)?;
    let reserve_x = next_account_info(it)?;
    let reserve_y = next_account_info(it)?;
    let base_mint = next_account_info(it)?;
    let quote_mint = next_account_info(it)?;
    let limit_order = next_account_info(it)?;
    let vault_base = next_account_info(it)?;
    let vault_quote = next_account_info(it)?;
    let base_token_program = next_account_info(it)?;
    let quote_token_program = next_account_info(it)?;
    let memo = next_account_info(it)?;
    let event_authority = next_account_info(it)?;
    let dlmm = next_account_info(it)?;
    let beneficiary_quote = next_account_info(it)?;
    let bin_arrays: Vec<AccountInfo> = it.cloned().collect();
    require_program(dlmm, &meteora::DLMM_PROGRAM)?;

    let vault = Vault::load(vault_info, program_id)?;
    require_beneficiary(&vault, beneficiary)?;
    if *base_mint.key != vault.base_mint || *quote_mint.key != vault.quote_mint {
        return Err(VaultError::MintMismatch.into());
    }
    let (order_key, _) = find_order(vault_info.key, nonce, program_id);
    if order_key != *limit_order.key {
        return Err(VaultError::BadNonce.into());
    }
    // Unfilled tokens and proceeds can only return to the vault's own accounts
    meteora::token_account(vault_base, &vault.base_mint, vault_info.key)?;
    meteora::token_account(vault_quote, &vault.quote_mint, vault_info.key)?;

    let bump = [vault.bump];
    let seeds = Vault::seeds(&vault.dbc_pool, &bump);
    let ix = meteora::cancel_order(
        [lb_pair, bitmap_ext, reserve_x, reserve_y, base_mint, quote_mint, limit_order, vault_base, vault_quote, vault_info, base_token_program, quote_token_program, memo, event_authority, dlmm],
        &bins,
        &hook_slices,
        &bin_arrays,
    );
    let mut infos = vec![
        lb_pair.clone(), bitmap_ext.clone(), reserve_x.clone(), reserve_y.clone(), base_mint.clone(), quote_mint.clone(),
        limit_order.clone(), vault_base.clone(), vault_quote.clone(), vault_info.clone(), base_token_program.clone(),
        quote_token_program.clone(), memo.clone(), event_authority.clone(), dlmm.clone(),
    ];
    infos.extend(bin_arrays);
    invoke_signed(&ix, &infos, &[&seeds])?;

    if close {
        invoke_signed(
            &meteora::close_order([limit_order, vault_info, beneficiary, event_authority, dlmm]),
            &[limit_order.clone(), vault_info.clone(), beneficiary.clone(), event_authority.clone(), dlmm.clone()],
            &[&seeds],
        )?;
    }
    forward_quote(&vault, vault_info, vault_quote, quote_mint, beneficiary_quote, quote_token_program)
}

fn raise_floor(program_id: &Pubkey, accounts: &[AccountInfo], floor_bps: u16) -> ProgramResult {
    let it = &mut accounts.iter();
    let beneficiary = next_account_info(it)?;
    let vault_info = next_account_info(it)?;
    let mut vault = Vault::load(vault_info, program_id)?;
    require_beneficiary(&vault, beneficiary)?;
    if floor_bps < vault.floor_bps {
        return Err(VaultError::FloorCannotDecrease.into());
    }
    vault.floor_bps = floor_bps;
    vault.save(vault_info)?;
    msg!("ratchet-vault: floor raised");
    Ok(())
}

fn collect_fees(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    let it = &mut accounts.iter();
    let vault_info = next_account_info(it)?;
    let pool_authority = next_account_info(it)?;
    let pool_info = next_account_info(it)?;
    let vault_base = next_account_info(it)?;
    let vault_quote = next_account_info(it)?;
    let base_vault = next_account_info(it)?;
    let quote_vault = next_account_info(it)?;
    let base_mint = next_account_info(it)?;
    let quote_mint = next_account_info(it)?;
    let base_token_program = next_account_info(it)?;
    let quote_token_program = next_account_info(it)?;
    let event_authority = next_account_info(it)?;
    let dbc_program = next_account_info(it)?;
    let beneficiary_quote = next_account_info(it)?;
    require_program(dbc_program, &meteora::DBC_PROGRAM)?;

    let vault = Vault::load(vault_info, program_id)?;
    if *pool_info.key != vault.dbc_pool {
        return Err(VaultError::PoolMismatch.into());
    }
    meteora::token_account(vault_base, &vault.base_mint, vault_info.key)?;
    meteora::token_account(vault_quote, &vault.quote_mint, vault_info.key)?;

    let bump = [vault.bump];
    invoke_signed(
        &meteora::claim_creator_trading_fee([
            pool_authority, pool_info, vault_base, vault_quote, base_vault, quote_vault, base_mint, quote_mint,
            vault_info, base_token_program, quote_token_program, event_authority, dbc_program,
        ]),
        &[
            pool_authority.clone(), pool_info.clone(), vault_base.clone(), vault_quote.clone(), base_vault.clone(),
            quote_vault.clone(), base_mint.clone(), quote_mint.clone(), vault_info.clone(), base_token_program.clone(),
            quote_token_program.clone(), event_authority.clone(), dbc_program.clone(),
        ],
        &[&Vault::seeds(&vault.dbc_pool, &bump)],
    )?;
    // Base-token fees stay in the vault: they are supply, so they only leave through asks
    forward_quote(&vault, vault_info, vault_quote, quote_mint, beneficiary_quote, quote_token_program)
}

fn set_beneficiary(program_id: &Pubkey, accounts: &[AccountInfo], new_beneficiary: Pubkey) -> ProgramResult {
    let it = &mut accounts.iter();
    let beneficiary = next_account_info(it)?;
    let vault_info = next_account_info(it)?;
    let mut vault = Vault::load(vault_info, program_id)?;
    require_beneficiary(&vault, beneficiary)?;
    vault.beneficiary = new_beneficiary;
    vault.save(vault_info)
}

fn release_after_sunset(program_id: &Pubkey, accounts: &[AccountInfo], amount: u64) -> ProgramResult {
    let it = &mut accounts.iter();
    let beneficiary = next_account_info(it)?;
    let vault_info = next_account_info(it)?;
    let vault_base = next_account_info(it)?;
    let base_mint = next_account_info(it)?;
    let beneficiary_base = next_account_info(it)?;
    let token_program = next_account_info(it)?;

    let vault = Vault::load(vault_info, program_id)?;
    require_beneficiary(&vault, beneficiary)?;
    if vault.sunset_ts == 0 || Clock::get()?.unix_timestamp < vault.sunset_ts {
        return Err(VaultError::SunsetNotReached.into());
    }
    if *base_mint.key != vault.base_mint {
        return Err(VaultError::MintMismatch.into());
    }
    meteora::token_account(vault_base, &vault.base_mint, vault_info.key)?;
    meteora::token_account(beneficiary_base, &vault.base_mint, &vault.beneficiary)?;
    meteora::require_token_program(base_mint, token_program)?;
    let decimals = meteora::mint_decimals(base_mint)?;
    let bump = [vault.bump];
    invoke_signed(
        &meteora::transfer_checked(token_program.key, [vault_base, base_mint, beneficiary_base, vault_info], amount, decimals),
        &[vault_base.clone(), base_mint.clone(), beneficiary_base.clone(), vault_info.clone(), token_program.clone()],
        &[&Vault::seeds(&vault.dbc_pool, &bump)],
    )
}

fn claim_position_fee(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    let it = &mut accounts.iter();
    let vault_info = next_account_info(it)?;
    let pool_authority = next_account_info(it)?;
    let pool = next_account_info(it)?;
    let position = next_account_info(it)?;
    let vault_base = next_account_info(it)?;
    let vault_quote = next_account_info(it)?;
    let token_a_vault = next_account_info(it)?;
    let token_b_vault = next_account_info(it)?;
    let base_mint = next_account_info(it)?;
    let quote_mint = next_account_info(it)?;
    let position_nft = next_account_info(it)?;
    let base_token_program = next_account_info(it)?;
    let quote_token_program = next_account_info(it)?;
    let event_authority = next_account_info(it)?;
    let damm = next_account_info(it)?;
    let beneficiary_quote = next_account_info(it)?;
    require_program(damm, &meteora::DAMM_V2_PROGRAM)?;

    let vault = Vault::load(vault_info, program_id)?;
    if *base_mint.key != vault.base_mint || *quote_mint.key != vault.quote_mint {
        return Err(VaultError::MintMismatch.into());
    }
    // Fees land in the vault's own accounts: base stays as supply, quote is forwarded below.
    // DAMM v2 checks the pool, vaults and mints against the position, and the NFT against the
    // vault as signer.
    meteora::token_account(vault_base, &vault.base_mint, vault_info.key)?;
    meteora::token_account(vault_quote, &vault.quote_mint, vault_info.key)?;

    let bump = [vault.bump];
    invoke_signed(
        &meteora::claim_position_fee([
            pool_authority, pool, position, vault_base, vault_quote, token_a_vault, token_b_vault, base_mint, quote_mint,
            position_nft, vault_info, base_token_program, quote_token_program, event_authority, damm,
        ]),
        &[
            pool_authority.clone(), pool.clone(), position.clone(), vault_base.clone(), vault_quote.clone(),
            token_a_vault.clone(), token_b_vault.clone(), base_mint.clone(), quote_mint.clone(), position_nft.clone(),
            vault_info.clone(), base_token_program.clone(), quote_token_program.clone(), event_authority.clone(),
            damm.clone(),
        ],
        &[&Vault::seeds(&vault.dbc_pool, &bump)],
    )?;
    forward_quote(&vault, vault_info, vault_quote, quote_mint, beneficiary_quote, quote_token_program)
}

/// Shared by WithdrawSurplus and WithdrawMigrationFee: a DBC CPI that pays the creator in quote.
fn withdraw_creator_quote(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    build: fn([&AccountInfo; 10]) -> solana_program::instruction::Instruction,
) -> ProgramResult {
    let it = &mut accounts.iter();
    let vault_info = next_account_info(it)?;
    let pool_authority = next_account_info(it)?;
    let config = next_account_info(it)?;
    let pool = next_account_info(it)?;
    let vault_quote = next_account_info(it)?;
    let quote_vault = next_account_info(it)?;
    let quote_mint = next_account_info(it)?;
    let quote_token_program = next_account_info(it)?;
    let event_authority = next_account_info(it)?;
    let dbc_program = next_account_info(it)?;
    let beneficiary_quote = next_account_info(it)?;
    require_program(dbc_program, &meteora::DBC_PROGRAM)?;

    let vault = Vault::load(vault_info, program_id)?;
    if *pool.key != vault.dbc_pool {
        return Err(VaultError::PoolMismatch.into());
    }
    if *quote_mint.key != vault.quote_mint {
        return Err(VaultError::MintMismatch.into());
    }
    meteora::token_account(vault_quote, &vault.quote_mint, vault_info.key)?;

    let bump = [vault.bump];
    invoke_signed(
        &build([pool_authority, config, pool, vault_quote, quote_vault, quote_mint, vault_info, quote_token_program, event_authority, dbc_program]),
        &[
            pool_authority.clone(), config.clone(), pool.clone(), vault_quote.clone(), quote_vault.clone(), quote_mint.clone(),
            vault_info.clone(), quote_token_program.clone(), event_authority.clone(), dbc_program.clone(),
        ],
        &[&Vault::seeds(&vault.dbc_pool, &bump)],
    )?;
    forward_quote(&vault, vault_info, vault_quote, quote_mint, beneficiary_quote, quote_token_program)
}

#[cfg(test)]
mod tests {
    use super::*;
    use state::ASK_WINDOW_SECONDS;

    #[test]
    fn vault_layout_fits_its_space() {
        let v = Vault {
            discriminator: VAULT_DISCRIMINATOR,
            dbc_pool: Pubkey::new_unique(),
            base_mint: Pubkey::new_unique(),
            quote_mint: Pubkey::new_unique(),
            beneficiary: Pubkey::new_unique(),
            graduation_price_q64: u128::MAX,
            floor_bps: MIN_FLOOR_BPS,
            sunset_ts: i64::MAX,
            orders_placed: u64::MAX,
            bump: 255,
            window_start_ts: i64::MAX,
            window_budget: u64::MAX,
            window_used: u64::MAX,
        };
        assert_eq!(borsh::to_vec(&v).unwrap().len(), VAULT_SPACE);
    }

    fn fresh_vault() -> Vault {
        Vault {
            discriminator: VAULT_DISCRIMINATOR,
            dbc_pool: Pubkey::new_unique(),
            base_mint: Pubkey::new_unique(),
            quote_mint: Pubkey::new_unique(),
            beneficiary: Pubkey::new_unique(),
            graduation_price_q64: 1 << 64,
            floor_bps: MIN_FLOOR_BPS,
            sunset_ts: 0,
            orders_placed: 0,
            bump: 255,
            window_start_ts: 0,
            window_budget: 0,
            window_used: 0,
        }
    }

    #[test]
    fn daily_cap_is_ten_percent_of_the_balance_at_window_start() {
        let mut v = fresh_vault();
        let now = 1_700_000_000;
        assert!(v.spend_ask_budget(1_000_000, 60_000, now).is_ok());
        assert!(v.spend_ask_budget(1_000_000, 40_000, now + 10).is_ok());
        assert!(v.spend_ask_budget(1_000_000, 1, now + 20) == Err(VaultError::DailyCapExceeded));
    }

    #[test]
    fn daily_cap_rejects_one_oversized_ask() {
        let mut v = fresh_vault();
        assert!(v.spend_ask_budget(1_000_000, 100_001, 1_700_000_000) == Err(VaultError::DailyCapExceeded));
    }

    #[test]
    fn daily_cap_resets_after_the_window_and_uses_the_new_balance() {
        let mut v = fresh_vault();
        let now = 1_700_000_000;
        assert!(v.spend_ask_budget(1_000_000, 100_000, now).is_ok());
        // Balance rose (say vested tokens arrived) but the window hasn't ended: no new budget
        assert!(v.spend_ask_budget(5_000_000, 1, now + ASK_WINDOW_SECONDS - 1) == Err(VaultError::DailyCapExceeded));
        assert!(v.spend_ask_budget(5_000_000, 500_000, now + ASK_WINDOW_SECONDS).is_ok());
        assert!(v.window_start_ts == now + ASK_WINDOW_SECONDS);
    }

    #[test]
    fn daily_cap_survives_overflowing_amounts() {
        let mut v = fresh_vault();
        assert!(v.spend_ask_budget(u64::MAX, u64::MAX / 10, 1).is_ok());
        assert!(v.spend_ask_budget(u64::MAX, u64::MAX, 2) == Err(VaultError::MathOverflow));
    }

    #[test]
    fn canonical_pair_matches_the_dlmm_sdk() {
        // deriveCustomizablePermissionlessLbPair from @meteora-ag/dlmm, for CHRL-shaped mints
        let base = solana_program::pubkey!("6tMtkfJ6RpzUW9dRWTnTWBPgFGLaTX3t6TV4rzGbYhH9");
        let sol = solana_program::pubkey!("So11111111111111111111111111111111111111112");
        let expected = solana_program::pubkey!("8RoB7no1RUYHunnsoe7cDEApK9Nr9Wv4LhGuXdrdgTZt");
        assert!(meteora::canonical_lb_pair(&base, &sol) == expected);
        assert!(meteora::canonical_lb_pair(&sol, &base) == expected);
    }

    #[test]
    fn token_program_must_own_the_mint() {
        let key = Pubkey::new_unique();
        let (mut l1, mut l2, mut l3) = (0u64, 0u64, 0u64);
        let (mut d1, mut d2, mut d3): ([u8; 0], [u8; 0], [u8; 0]) = ([], [], []);
        let token = meteora::TOKEN_PROGRAM;
        let fake = Pubkey::new_unique();
        let mint = AccountInfo::new(&key, false, false, &mut l1, &mut d1, &token, false, 0);
        let real_program = AccountInfo::new(&token, false, false, &mut l2, &mut d2, &key, true, 0);
        let fake_program = AccountInfo::new(&fake, false, false, &mut l3, &mut d3, &key, true, 0);
        assert!(meteora::require_token_program(&mint, &real_program).is_ok());
        assert!(meteora::require_token_program(&mint, &fake_program) == Err(VaultError::BadTokenAccount));
    }

    #[test]
    fn new_instructions_keep_existing_variant_numbers() {
        assert_eq!(borsh::to_vec(&VaultInstruction::ReleaseAfterSunset { amount: 0 }).unwrap()[0], 7);
        assert_eq!(borsh::to_vec(&VaultInstruction::ClaimPositionFee).unwrap(), vec![8]);
        assert_eq!(borsh::to_vec(&VaultInstruction::WithdrawSurplus).unwrap(), vec![9]);
        assert_eq!(borsh::to_vec(&VaultInstruction::WithdrawMigrationFee).unwrap(), vec![10]);
    }

    #[test]
    fn instruction_encoding_is_stable() {
        let ix = VaultInstruction::RaiseFloor { floor_bps: 15_000 };
        assert_eq!(borsh::to_vec(&ix).unwrap(), vec![4, 0x98, 0x3a]);
    }

    #[test]
    fn sunset_zero_means_never_and_is_allowed() {
        assert!(validate_sunset(0, 1_700_000_000).is_ok());
    }

    #[test]
    fn sunset_in_the_past_is_rejected() {
        let now = 1_700_000_000;
        for ts in [1, -1, i64::MIN, now - 1, now] {
            assert!(validate_sunset(ts, now) == Err(VaultError::SunsetTooSoon), "sunset {ts} accepted");
        }
    }

    #[test]
    fn sunset_boundary_is_exactly_the_minimum_delay() {
        let now = 1_700_000_000;
        assert!(validate_sunset(now + MIN_SUNSET_DELAY - 1, now) == Err(VaultError::SunsetTooSoon));
        assert!(validate_sunset(now + MIN_SUNSET_DELAY, now).is_ok());
        assert!(validate_sunset(i64::MAX, now).is_ok());
    }

    #[test]
    fn sunset_check_does_not_overflow() {
        assert!(validate_sunset(i64::MAX, i64::MAX) == Err(VaultError::SunsetTooSoon));
    }

    #[test]
    fn vault_seed_matches_spec() {
        assert_eq!(state::VAULT_SEED, b"vault");
    }
}
