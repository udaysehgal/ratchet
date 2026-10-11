//! Meteora program IDs, account layouts and CPI instructions.
//!
//! Byte offsets were computed from Meteora's IDLs and checked against live accounts with the
//! official SDKs (DBC 1.5.13, DLMM). Instruction data is Anchor-encoded: an 8-byte
//! discriminator followed by Borsh args.
use solana_program::{
    account_info::AccountInfo,
    instruction::{AccountMeta, Instruction},
    pubkey,
    pubkey::Pubkey,
};

use crate::error::VaultError;

pub const DBC_PROGRAM: Pubkey = pubkey!("dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN");
pub const DLMM_PROGRAM: Pubkey = pubkey!("LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo");
pub const LOCKER_PROGRAM: Pubkey = pubkey!("LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn");
pub const TOKEN_PROGRAM: Pubkey = pubkey!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
pub const TOKEN_2022_PROGRAM: Pubkey = pubkey!("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

// DBC VirtualPool (424 bytes)
const POOL_CONFIG: usize = 72;
const POOL_CREATOR: usize = 104;
const POOL_BASE_MINT: usize = 136;
const POOL_IS_MIGRATED: usize = 305;
// DBC PoolConfig (1048 bytes)
const CONFIG_QUOTE_MINT: usize = 8;
const CONFIG_MIGRATION_SQRT_PRICE: usize = 280;
// DLMM LbPair (904 bytes)
const PAIR_BIN_STEP: usize = 80;
const PAIR_TOKEN_X: usize = 88;
const PAIR_TOKEN_Y: usize = 120;
// SPL token account (both token programs)
const TOKEN_MINT: usize = 0;
const TOKEN_OWNER: usize = 32;
const TOKEN_AMOUNT: usize = 64;
// SPL mint
const MINT_DECIMALS: usize = 44;

fn read_pubkey(data: &[u8], offset: usize) -> Result<Pubkey, VaultError> {
    data.get(offset..offset + 32)
        .map(|b| Pubkey::new_from_array(b.try_into().unwrap()))
        .ok_or(VaultError::PoolMismatch)
}

fn require_owner(account: &AccountInfo, program: &Pubkey) -> Result<(), VaultError> {
    if account.owner != program {
        return Err(VaultError::WrongProgramOwner);
    }
    Ok(())
}

pub struct DbcPool {
    pub config: Pubkey,
    pub creator: Pubkey,
    pub base_mint: Pubkey,
    pub migrated: bool,
}

pub fn read_dbc_pool(account: &AccountInfo) -> Result<DbcPool, VaultError> {
    require_owner(account, &DBC_PROGRAM)?;
    let data = account.try_borrow_data().map_err(|_| VaultError::PoolMismatch)?;
    if data.len() < 424 {
        return Err(VaultError::PoolMismatch);
    }
    Ok(DbcPool {
        config: read_pubkey(&data, POOL_CONFIG)?,
        creator: read_pubkey(&data, POOL_CREATOR)?,
        base_mint: read_pubkey(&data, POOL_BASE_MINT)?,
        migrated: data[POOL_IS_MIGRATED] == 1,
    })
}

pub struct DbcConfig {
    pub quote_mint: Pubkey,
    pub migration_sqrt_price: u128,
}

pub fn read_dbc_config(account: &AccountInfo) -> Result<DbcConfig, VaultError> {
    require_owner(account, &DBC_PROGRAM)?;
    let data = account.try_borrow_data().map_err(|_| VaultError::PoolMismatch)?;
    if data.len() < 1048 {
        return Err(VaultError::PoolMismatch);
    }
    let raw: [u8; 16] = data[CONFIG_MIGRATION_SQRT_PRICE..CONFIG_MIGRATION_SQRT_PRICE + 16]
        .try_into()
        .unwrap();
    Ok(DbcConfig {
        quote_mint: read_pubkey(&data, CONFIG_QUOTE_MINT)?,
        migration_sqrt_price: u128::from_le_bytes(raw),
    })
}

pub struct LbPair {
    pub bin_step: u16,
    pub token_x: Pubkey,
    pub token_y: Pubkey,
}

pub fn read_lb_pair(account: &AccountInfo) -> Result<LbPair, VaultError> {
    require_owner(account, &DLMM_PROGRAM)?;
    let data = account.try_borrow_data().map_err(|_| VaultError::PoolMismatch)?;
    if data.len() < 904 {
        return Err(VaultError::PoolMismatch);
    }
    Ok(LbPair {
        bin_step: u16::from_le_bytes([data[PAIR_BIN_STEP], data[PAIR_BIN_STEP + 1]]),
        token_x: read_pubkey(&data, PAIR_TOKEN_X)?,
        token_y: read_pubkey(&data, PAIR_TOKEN_Y)?,
    })
}

/// Checks a token account belongs to `owner` for `mint` and returns its balance.
pub fn token_account(account: &AccountInfo, mint: &Pubkey, owner: &Pubkey) -> Result<u64, VaultError> {
    if account.owner != &TOKEN_PROGRAM && account.owner != &TOKEN_2022_PROGRAM {
        return Err(VaultError::BadTokenAccount);
    }
    let data = account.try_borrow_data().map_err(|_| VaultError::BadTokenAccount)?;
    if data.len() < 72
        || read_pubkey(&data, TOKEN_MINT)? != *mint
        || read_pubkey(&data, TOKEN_OWNER)? != *owner
    {
        return Err(VaultError::BadTokenAccount);
    }
    Ok(u64::from_le_bytes(data[TOKEN_AMOUNT..TOKEN_AMOUNT + 8].try_into().unwrap()))
}

pub fn mint_decimals(mint: &AccountInfo) -> Result<u8, VaultError> {
    if mint.owner != &TOKEN_PROGRAM && mint.owner != &TOKEN_2022_PROGRAM {
        return Err(VaultError::MintMismatch);
    }
    let data = mint.try_borrow_data().map_err(|_| VaultError::MintMismatch)?;
    data.get(MINT_DECIMALS).copied().ok_or(VaultError::MintMismatch)
}

fn metas(accounts: &[&AccountInfo], signers: &[bool]) -> Vec<AccountMeta> {
    accounts
        .iter()
        .zip(signers)
        .map(|(a, &signer)| {
            if a.is_writable {
                AccountMeta::new(*a.key, signer)
            } else {
                AccountMeta::new_readonly(*a.key, signer)
            }
        })
        .collect()
}

fn with_remaining(mut m: Vec<AccountMeta>, remaining: &[AccountInfo]) -> Vec<AccountMeta> {
    m.extend(remaining.iter().map(|a| {
        if a.is_writable {
            AccountMeta::new(*a.key, false)
        } else {
            AccountMeta::new_readonly(*a.key, false)
        }
    }));
    m
}

/// DBC transfer_pool_creator: [virtual_pool w, config, creator s, new_creator, event_authority, program]
pub fn transfer_pool_creator(accounts: [&AccountInfo; 6]) -> Instruction {
    Instruction {
        program_id: DBC_PROGRAM,
        accounts: metas(&accounts, &[false, false, true, false, false, false]),
        data: vec![20, 7, 169, 33, 58, 147, 166, 33],
    }
}

/// DBC claim_creator_trading_fee: [pool_authority, pool w, token_a w, token_b w, base_vault w,
/// quote_vault w, base_mint, quote_mint, creator s, token_base_program, token_quote_program,
/// event_authority, program]
pub fn claim_creator_trading_fee(accounts: [&AccountInfo; 13]) -> Instruction {
    let mut data = vec![82, 220, 250, 189, 3, 85, 107, 45];
    data.extend_from_slice(&u64::MAX.to_le_bytes());
    data.extend_from_slice(&u64::MAX.to_le_bytes());
    let mut signers = [false; 13];
    signers[8] = true;
    Instruction { program_id: DBC_PROGRAM, accounts: metas(&accounts, &signers), data }
}

/// Meteora Lock claim_v2: [escrow w, token_mint, escrow_token w, recipient s w, recipient_token w,
/// memo_program, token_program, event_authority, program]
pub fn locker_claim_v2(accounts: [&AccountInfo; 9]) -> Instruction {
    let mut data = vec![229, 87, 46, 162, 21, 157, 231, 114];
    data.extend_from_slice(&u64::MAX.to_le_bytes()); // capped on-chain at what has vested
    data.push(0); // remaining_accounts_info: None
    let mut signers = [false; 9];
    signers[3] = true;
    Instruction { program_id: LOCKER_PROGRAM, accounts: metas(&accounts, &signers), data }
}

/// DLMM place_limit_order (ask side): [lb_pair w, bitmap_ext w?, reserve w, token_mint,
/// limit_order s w, payer s w, owner, user_token w, sender s, token_program, system_program,
/// event_authority, program] + bin arrays
/// DLMM RemainingAccountsInfo: slices of (accounts_type variant, length) for transfer-hook
/// accounts that precede the bin arrays. Variants 0-2 and 4 carry no data.
fn push_slices(data: &mut Vec<u8>, slices: &[(u8, u8)]) {
    data.extend_from_slice(&(slices.len() as u32).to_le_bytes());
    for (kind, len) in slices {
        data.push(*kind);
        data.push(*len);
    }
}

pub fn place_ask(accounts: [&AccountInfo; 13], bins: &[(i32, u64)], slices: &[(u8, u8)], remaining: &[AccountInfo]) -> Instruction {
    let mut data = vec![108, 176, 33, 186, 146, 229, 1, 197];
    data.push(1); // is_ask_side
    data.extend_from_slice(&[0u8; 16]); // padding
    data.push(0); // relative_bin: None
    data.extend_from_slice(&(bins.len() as u32).to_le_bytes());
    for (id, amount) in bins {
        data.extend_from_slice(&id.to_le_bytes());
        data.extend_from_slice(&amount.to_le_bytes());
    }
    push_slices(&mut data, slices);
    let signers = [false, false, false, false, true, true, false, false, true, false, false, false, false];
    Instruction {
        program_id: DLMM_PROGRAM,
        accounts: with_remaining(metas(&accounts, &signers), remaining),
        data,
    }
}

/// DLMM cancel_limit_order: [lb_pair w, bitmap_ext w?, reserve_x w, reserve_y w, token_x_mint,
/// token_y_mint, limit_order w, owner_token_x w, owner_token_y w, owner s, token_x_program,
/// token_y_program, memo_program, event_authority, program] + bin arrays
pub fn cancel_order(accounts: [&AccountInfo; 15], bins: &[i32], slices: &[(u8, u8)], remaining: &[AccountInfo]) -> Instruction {
    let mut data = vec![132, 156, 132, 31, 67, 40, 232, 97];
    data.extend_from_slice(&(bins.len() as u32).to_le_bytes());
    for id in bins {
        data.extend_from_slice(&id.to_le_bytes());
    }
    push_slices(&mut data, slices);
    let mut signers = [false; 15];
    signers[9] = true;
    Instruction {
        program_id: DLMM_PROGRAM,
        accounts: with_remaining(metas(&accounts, &signers), remaining),
        data,
    }
}

/// DLMM close_limit_order_if_empty: [limit_order w, owner s, rent_receiver w, event_authority, program]
pub fn close_order(accounts: [&AccountInfo; 5]) -> Instruction {
    Instruction {
        program_id: DLMM_PROGRAM,
        accounts: metas(&accounts, &[false, true, false, false, false]),
        data: vec![57, 124, 36, 155, 126, 249, 93, 171],
    }
}

/// SPL transfer_checked (same layout on Token and Token-2022): [source, mint, destination, authority s]
pub fn transfer_checked(token_program: &Pubkey, accounts: [&AccountInfo; 4], amount: u64, decimals: u8) -> Instruction {
    let mut data = vec![12];
    data.extend_from_slice(&amount.to_le_bytes());
    data.push(decimals);
    Instruction {
        program_id: *token_program,
        accounts: metas(&accounts, &[false, false, false, true]),
        data,
    }
}
