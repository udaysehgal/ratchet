#!/usr/bin/env bash
# Local validator with Meteora's real programs cloned from mainnet and the vault preloaded.
# Usage: scripts/local-validator.sh [ledger_dir]
set -euo pipefail
cd "$(dirname "$0")/.."
LEDGER="${1:-.ledger}"
exec solana-test-validator --reset --quiet --ledger "$LEDGER" --url https://api.mainnet-beta.solana.com \
  --clone-upgradeable-program dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN \
  --clone-upgradeable-program cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG \
  --clone-upgradeable-program LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo \
  --clone-upgradeable-program LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn \
  --clone-upgradeable-program metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s \
  --clone A8gMrEPJkacWkcb3DGwtJwTe16HktSEfvwtuDh2MCtck \
  --clone FhVo3mqL8PW5pH5U2CN4XE33DokiyZnUwuGpH2hmHLuM \
  --bpf-program BrwQHeRJWXDbXgUVi1TKdoDbnfB5kcRTcieYmSH2NzWB target/deploy/ratchet_vault.so
