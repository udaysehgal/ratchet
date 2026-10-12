import { NextApiRequest, NextApiResponse } from 'next';
import { Connection, PublicKey } from '@solana/web3.js';
import { DynamicBondingCurveClient, deriveTokenBadgeAddress } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { getPresetConfig } from '@/presets';
import { uploadPublic } from '@/server/storage';
import { isAddress } from '@/lib/address';

const RPC_URL = process.env.RPC_URL as string;

if (!RPC_URL) {
  throw new Error('Missing RPC_URL');
}

// Types
type UploadRequest = {
  tokenLogo: string;
  tokenName: string;
  tokenSymbol: string;
  mint: string;
  userWallet: string;
  presetId: string;
};

type Metadata = {
  name: string;
  symbol: string;
  image: string;
};

type MetadataUploadParams = {
  tokenName: string;
  tokenSymbol: string;
  mint: string;
  image: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { tokenLogo, tokenName, tokenSymbol, mint, userWallet, presetId } =
      req.body as UploadRequest;

    // Validate required fields
    if (!tokenLogo || !tokenName || !tokenSymbol || !mint || !userWallet) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    // `mint` becomes a storage path: only a real address, never an arbitrary string
    if (!isAddress(mint) || !isAddress(userWallet)) {
      return res.status(400).json({ error: 'Invalid mint or wallet address' });
    }

    const poolConfig = getPresetConfig(presetId);
    if (!poolConfig) {
      return res.status(400).json({ error: `Unknown preset: ${presetId}` });
    }

    // Upload image and metadata
    const imageUrl = await uploadImage(tokenLogo, mint);
    if (!imageUrl) {
      return res
        .status(400)
        .json({ error: 'Logo must be a PNG, JPEG, GIF or WebP under 2 MB' });
    }

    const metadataUrl = await uploadMetadata({ tokenName, tokenSymbol, mint, image: imageUrl });
    if (!metadataUrl) {
      return res.status(400).json({ error: 'Failed to upload metadata' });
    }

    // Create pool transaction
    const poolTx = await createPoolTransaction({
      mint,
      tokenName,
      tokenSymbol,
      metadataUrl,
      userWallet,
      poolConfig,
    });

    res.status(200).json({
      success: true,
      poolTx: poolTx
        .serialize({
          requireAllSignatures: false,
          verifySignatures: false,
        })
        .toString('base64'),
    });
  } catch (error) {
    console.error('Upload error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: `Upload failed: ${message}` });
  }
}

async function uploadImage(tokenLogo: string, mint: string): Promise<string | false> {
  const matches = tokenLogo.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    return false;
  }

  const [, contentType, base64Data] = matches;

  if (!contentType || !base64Data) {
    return false;
  }

  // Public storage: only plain raster images (no SVG/HTML), max 2 MB
  const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
  if (!ALLOWED_TYPES.includes(contentType)) {
    return false;
  }
  const fileBuffer = Buffer.from(base64Data, 'base64');
  if (fileBuffer.length > 2 * 1024 * 1024) {
    return false;
  }
  const fileName = `images/${mint}.${contentType.split('/')[1]}`;

  // Storage errors propagate so the handler reports the real cause
  return uploadPublic(fileName, fileBuffer, contentType);
}

async function uploadMetadata(params: MetadataUploadParams): Promise<string | false> {
  const metadata: Metadata = {
    name: params.tokenName,
    symbol: params.tokenSymbol,
    image: params.image,
  };
  const fileName = `metadata/${params.mint}.json`;

  return uploadPublic(fileName, Buffer.from(JSON.stringify(metadata, null, 2)), 'application/json');
}

async function createPoolTransaction({
  mint,
  tokenName,
  tokenSymbol,
  metadataUrl,
  userWallet,
  poolConfig,
}: {
  poolConfig: string;
  mint: string;
  tokenName: string;
  tokenSymbol: string;
  metadataUrl: string;
  userWallet: string;
}) {
  const connection = new Connection(RPC_URL, 'confirmed');
  const client = new DynamicBondingCurveClient(connection, 'confirmed');

  // xStock quotes (Token-2022) need Meteora's DBC token badge attached to pool creation
  const config = await client.state.getPoolConfig(new PublicKey(poolConfig));
  const badge = deriveTokenBadgeAddress(config.quoteMint);
  const tokenBadge = (await connection.getAccountInfo(badge)) ? badge : undefined;

  const poolTx = await client.creator.createPool({
    tokenBadge,
    config: new PublicKey(poolConfig),
    baseMint: new PublicKey(mint),
    name: tokenName,
    symbol: tokenSymbol,
    uri: metadataUrl,
    payer: new PublicKey(userWallet),
    poolCreator: new PublicKey(userWallet),
  });

  const { blockhash } = await connection.getLatestBlockhash();
  poolTx.feePayer = new PublicKey(userWallet);
  poolTx.recentBlockhash = blockhash;

  return poolTx;
}
