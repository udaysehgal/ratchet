use solana_program::program_error::ProgramError;

#[derive(Clone, Copy, PartialEq, Eq)]
#[repr(u32)]
pub enum VaultError {
    InvalidVault = 6000,
    NotPoolCreator,
    AlreadyGraduated,
    WrongProgramOwner,
    PoolMismatch,
    MintMismatch,
    BelowFloor,
    FloorCannotDecrease,
    NotBeneficiary,
    BadTokenAccount,
    BadNonce,
    SunsetNotReached,
    MathOverflow,
    NoBins,
    SunsetTooSoon,
}

impl From<VaultError> for ProgramError {
    fn from(e: VaultError) -> Self {
        ProgramError::Custom(e as u32)
    }
}
