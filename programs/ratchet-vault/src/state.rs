use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{account_info::AccountInfo, program_error::ProgramError, pubkey::Pubkey};

use crate::error::VaultError;

pub const VAULT_SEED: &[u8] = b"vault";
pub const ORDER_SEED: &[u8] = b"order";
pub const VAULT_DISCRIMINATOR: [u8; 8] = *b"RTVAULT1";
/// Lowest allowed floor: 1.25x the graduation price.
pub const MIN_FLOOR_BPS: u16 = 12_500;
pub const VAULT_SPACE: usize = 8 + 32 * 4 + 16 + 2 + 8 + 8 + 1;

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone, PartialEq)]
pub struct Vault {
    pub discriminator: [u8; 8],
    /// The DBC virtual pool whose creator role this vault holds.
    pub dbc_pool: Pubkey,
    pub base_mint: Pubkey,
    pub quote_mint: Pubkey,
    /// Team wallet: sets ask prices, receives quote proceeds and quote fees.
    pub beneficiary: Pubkey,
    /// Q64.64 quote per base (raw units), from the DBC config's migration sqrt price. Fixed.
    pub graduation_price_q64: u128,
    /// Asks must be priced at or above graduation_price × floor_bps / 10_000. Only rises.
    pub floor_bps: u16,
    /// 0 = never; otherwise base tokens may be released to the beneficiary after this time.
    pub sunset_ts: i64,
    /// Nonce for the next order PDA.
    pub orders_placed: u64,
    pub bump: u8,
}

impl Vault {
    pub fn load(account: &AccountInfo, program_id: &Pubkey) -> Result<Self, ProgramError> {
        if account.owner != program_id {
            return Err(VaultError::InvalidVault.into());
        }
        let data = account.try_borrow_data()?;
        let vault = Vault::deserialize(&mut &data[..]).map_err(|_| VaultError::InvalidVault)?;
        if vault.discriminator != VAULT_DISCRIMINATOR {
            return Err(VaultError::InvalidVault.into());
        }
        Ok(vault)
    }

    pub fn save(&self, account: &AccountInfo) -> Result<(), ProgramError> {
        let mut data = account.try_borrow_mut_data()?;
        let bytes = borsh::to_vec(self).map_err(|_| ProgramError::InvalidAccountData)?;
        data[..bytes.len()].copy_from_slice(&bytes);
        Ok(())
    }

    pub fn seeds<'a>(dbc_pool: &'a Pubkey, bump: &'a [u8; 1]) -> [&'a [u8]; 3] {
        [VAULT_SEED, dbc_pool.as_ref(), bump]
    }
}

pub fn find_vault(dbc_pool: &Pubkey, program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[VAULT_SEED, dbc_pool.as_ref()], program_id)
}

pub fn find_order(vault: &Pubkey, nonce: u64, program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[ORDER_SEED, vault.as_ref(), &nonce.to_le_bytes()], program_id)
}
