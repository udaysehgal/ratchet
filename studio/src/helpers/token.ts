import { Wallet } from '@coral-xyz/anchor';
import {
  PublicKey,
  Connection,
  Signer,
  sendAndConfirmTransaction,
  Keypair,
  ComputeBudgetProgram,
  SystemProgram,
  Transaction,
  TransactionSignature,
} from '@solana/web3.js';
import { CreateTokenMintOptions, TokenConfig } from '../utils/types';
import { getAmountInLamports, getSigners } from './common';
import BN from 'bn.js';
import {
  AuthorityType,
  createInitializeMint2Instruction,
  createMintToInstruction,
  createSetAuthorityInstruction,
  getMinimumBalanceForRentExemptMint,
  getOrCreateAssociatedTokenAccount,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { DEFAULT_SEND_TX_MAX_RETRIES, METAPLEX_PROGRAM_ID } from '../utils/constants';
import { uploadTokenMetadata } from './metadata';
import { createCreateMetadataAccountV3Instruction } from '@metaplex-foundation/mpl-token-metadata';
import { safeParseKeypairFromFile } from './utils';

export async function createTokenMint(
  connection: Connection,
  wallet: Wallet,
  options: CreateTokenMintOptions
): Promise<PublicKey> {
  if (options.dryRun) {
    throw new Error('Cannot create token mint when in dry run mode');
  }

  if (!options.tokenConfig) {
    throw new Error('tokenConfig is required');
  }

  const mintAmount = getAmountInLamports(options.tokenConfig.supply, options.tokenConfig.decimals);

  const mint: PublicKey = await createAndMintToken(
    connection,
    wallet,
    options.tokenConfig.decimals,
    mintAmount,
    options.computeUnitPriceMicroLamports,
    options.tokenConfig
  );

  console.log(
    `>> Mint token mint ${mint} to payer wallet. Amount ${options.tokenConfig?.supply} in lamport ${mintAmount}`
  );

  return mint;
}

async function createAndMintToken(
  connection: Connection,
  wallet: Wallet,
  mintDecimals: number,
  mintAmountLamport: BN,
  computeUnitPriceMicroLamports: number,
  tokenConfig: TokenConfig
): Promise<PublicKey> {
  let baseMintKeypair: Keypair;
  if (tokenConfig.tokenMintKeypairFilePath) {
    baseMintKeypair = await safeParseKeypairFromFile(tokenConfig.tokenMintKeypairFilePath);
  } else {
    baseMintKeypair = Keypair.generate();
  }

  let mintAuthority: PublicKey | null;
  if (tokenConfig.authorities.mint) {
    mintAuthority = new PublicKey(tokenConfig.authorities.mint);
  } else {
    mintAuthority = null;
  }

  let freezeAuthority: PublicKey | null;
  if (tokenConfig.authorities.freeze) {
    freezeAuthority = new PublicKey(tokenConfig.authorities.freeze);
  } else {
    freezeAuthority = null;
  }

  let updateAuthority: PublicKey;
  if (tokenConfig.authorities.update) {
    updateAuthority = new PublicKey(tokenConfig.authorities.update);
  } else {
    updateAuthority = new PublicKey('11111111111111111111111111111111');
  }

  const mint = await createMintWithPriorityFee(
    connection,
    wallet,
    freezeAuthority,
    updateAuthority,
    mintDecimals,
    computeUnitPriceMicroLamports,
    baseMintKeypair,
    tokenConfig
  );
  console.log(`Created token mint ${mint}`);

  const walletTokenATA = await getOrCreateAssociatedTokenAccount(
    connection,
    wallet.payer,
    mint,
    wallet.publicKey,
    true,
    connection.commitment
  );

  await mintToWithPriorityFee(
    connection,
    wallet.payer,
    mint,
    walletTokenATA.address,
    wallet.publicKey,
    mintAuthority,
    BigInt(mintAmountLamport.toString()),
    [],
    computeUnitPriceMicroLamports
  );
  console.log(`Minted ${mint} to wallet`);

  return mint;
}

async function createMintWithPriorityFee(
  connection: Connection,
  wallet: Wallet,
  freezeAuthority: PublicKey | null,
  updateAuthority: PublicKey,
  decimals: number,
  computeUnitPriceMicroLamports: number,
  keypair: Keypair,
  tokenConfig: TokenConfig,
  programId = TOKEN_PROGRAM_ID
): Promise<PublicKey> {
  const lamports = await getMinimumBalanceForRentExemptMint(connection);

  const addPriorityFeeIx = ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: computeUnitPriceMicroLamports,
  });

  const createAccountIx = SystemProgram.createAccount({
    fromPubkey: wallet.payer.publicKey,
    newAccountPubkey: keypair.publicKey,
    space: MINT_SIZE,
    lamports,
    programId,
  });

  const createInitializeMint2Tx = createInitializeMint2Instruction(
    keypair.publicKey,
    decimals,
    wallet.publicKey,
    freezeAuthority,
    programId
  );

  const transaction = new Transaction().add(
    addPriorityFeeIx,
    createAccountIx,
    createInitializeMint2Tx
  );

  // add metadata creation
  try {
    let metadataUri: string;
    if (tokenConfig.metadata.uri) {
      console.log('Using existing metadata URI:', tokenConfig.metadata.uri);
      metadataUri = tokenConfig.metadata.uri;
    } else {
      console.log('Uploading metadata to Irys...');
      if (!tokenConfig.metadata.image) {
        throw new Error('Image is required for token metadata');
      }
      metadataUri = await uploadTokenMetadata(
        connection.rpcEndpoint,
        wallet.payer as Keypair,
        tokenConfig.name,
        tokenConfig.symbol,
        tokenConfig.metadata.image,
        tokenConfig.metadata.description || '',
        tokenConfig.metadata.website || '',
        tokenConfig.metadata.twitter || '',
        tokenConfig.metadata.telegram || ''
      );
    }

    // create metadata account
    const metadataPDA = PublicKey.findProgramAddressSync(
      [Buffer.from('metadata'), METAPLEX_PROGRAM_ID.toBuffer(), keypair.publicKey.toBuffer()],
      METAPLEX_PROGRAM_ID
    )[0];

    const metadataData = {
      name: tokenConfig.name,
      symbol: tokenConfig.symbol,
      uri: metadataUri,
      sellerFeeBasisPoints: tokenConfig.sellerFeeBasisPoints,
      creators: tokenConfig.creators,
      collection: tokenConfig.collection,
      uses: tokenConfig.uses,
    };

    const createMetadataInstruction = createCreateMetadataAccountV3Instruction(
      {
        metadata: metadataPDA,
        mint: keypair.publicKey,
        mintAuthority: wallet.publicKey,
        payer: wallet.publicKey,
        updateAuthority: updateAuthority,
      },
      {
        createMetadataAccountArgsV3: {
          collectionDetails: null,
          data: metadataData,
          isMutable: tokenConfig.authorities.update !== null,
        },
      }
    );

    transaction.add(createMetadataInstruction);
    console.log('Added metadata creation instruction to transaction');
  } catch (error) {
    console.error('Failed to create metadata instruction:', error);
    throw error;
  }

  await sendAndConfirmTransaction(connection, transaction, [wallet.payer, keypair], {
    commitment: connection.commitment,
    maxRetries: DEFAULT_SEND_TX_MAX_RETRIES,
  });

  if (tokenConfig && tokenConfig.metadata) {
    console.log(`Token created with metadata: ${tokenConfig.name} (${tokenConfig.symbol})`);
  }

  return keypair.publicKey;
}

async function mintToWithPriorityFee(
  connection: Connection,
  payer: Signer,
  mint: PublicKey,
  destination: PublicKey,
  authority: Signer | PublicKey,
  mintAuthority: PublicKey | null,
  amount: number | bigint,
  multiSigners: Signer[] = [],
  computeUnitPriceMicroLamports: number,
  programId = TOKEN_PROGRAM_ID
): Promise<TransactionSignature> {
  const [authorityPublicKey, signers] = getSigners(authority, multiSigners);

  const addPriorityFeeIx = ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: computeUnitPriceMicroLamports,
  });

  const mintToInstruction = createMintToInstruction(
    mint,
    destination,
    authorityPublicKey,
    amount,
    multiSigners,
    programId
  );

  const disableMintAuthorityInstruction = createSetAuthorityInstruction(
    mint,
    authorityPublicKey,
    AuthorityType.MintTokens,
    mintAuthority
  );

  const transaction = new Transaction().add(
    addPriorityFeeIx,
    mintToInstruction,
    disableMintAuthorityInstruction
  );

  return await sendAndConfirmTransaction(connection, transaction, [payer, ...signers], {
    commitment: connection.commitment,
    maxRetries: DEFAULT_SEND_TX_MAX_RETRIES,
  });
}
