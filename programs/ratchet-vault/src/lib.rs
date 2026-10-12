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
use state::{find_order, find_vault, Vault, MIN_FLOOR_BPS, ORDER_SEED, VAULT_DISCRIMINATOR, VAULT_SPACE};

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
    let decimals = meteora::mint_decimals(quote_mint)?;
    let ix = meteora::transfer_checked(token_program.key, [vault_quote, quote_mint, beneficiary_quote, vault_info], balance, decimals);
    let bump = [vault.bump];
    invoke_signed(
        &ix,
        &[vault_quote.clone(), quote_mint.clone(), beneficiary_quote.clone(), vault_info.clone(), token_program.clone()],
        &[&Vault::seeds(&vault.dbc_pool, &bump)],
    )
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
    let lamports = Rent::get()?.minimum_balance(VAULT_SPACE);
    invoke_signed(
        &system_instruction::create_account(creator.key, vault_info.key, lamports, VAULT_SPACE as u64, program_id),
        &[creator.clone(), vault_info.clone(), system.clone()],
        &[&seeds],
    )?;
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

    // The pair must trade this launch's token against its quote token
    let pair = meteora::read_lb_pair(lb_pair)?;
    if pair.token_x != vault.base_mint || pair.token_y != vault.quote_mint || *base_mint.key != vault.base_mint {
        return Err(VaultError::MintMismatch.into());
    }
    meteora::token_account(vault_base, &vault.base_mint, vault_info.key)?;

    // The ratchet: every bin at or above the floor
    let floor = price::floor_price_up(vault.graduation_price_q64, vault.floor_bps).ok_or(VaultError::MathOverflow)?;
    for (bin_id, _) in &bins {
        if !price::bin_at_or_above_floor(*bin_id, pair.bin_step, floor) {
            msg!("ratchet-vault: bin below the floor");
            return Err(VaultError::BelowFloor.into());
        }
    }

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
    let decimals = meteora::mint_decimals(base_mint)?;
    let bump = [vault.bump];
    invoke_signed(
        &meteora::transfer_checked(token_program.key, [vault_base, base_mint, beneficiary_base, vault_info], amount, decimals),
        &[vault_base.clone(), base_mint.clone(), beneficiary_base.clone(), vault_info.clone(), token_program.clone()],
        &[&Vault::seeds(&vault.dbc_pool, &bump)],
    )
}

#[cfg(test)]
mod tests {
    use super::*;

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
        };
        assert_eq!(borsh::to_vec(&v).unwrap().len(), VAULT_SPACE);
    }

    #[test]
    fn instruction_encoding_is_stable() {
        let ix = VaultInstruction::RaiseFloor { floor_bps: 15_000 };
        assert_eq!(borsh::to_vec(&ix).unwrap(), vec![4, 0x98, 0x3a]);
    }

    #[test]
    fn vault_seed_matches_spec() {
        assert_eq!(state::VAULT_SEED, b"vault");
    }
}
