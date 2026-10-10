import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { irysUploader } from '@metaplex-foundation/umi-uploader-irys';
import {
  createSignerFromKeypair,
  signerIdentity,
  createGenericFile,
} from '@metaplex-foundation/umi';
import { Keypair } from '@solana/web3.js';
import { TokenMetadata } from '../utils/types';
import * as fs from 'fs';
import * as path from 'path';

// initialize umi with irys uploader
export function createUmiInstance(rpcUrl: string, payerKeypair: Keypair) {
  const umi = createUmi(rpcUrl);

  // convert solana keypair to umi keypair format
  const umiKeypair = umi.eddsa.createKeypairFromSecretKey(payerKeypair.secretKey);
  const signer = createSignerFromKeypair(umi, umiKeypair);

  return umi.use(signerIdentity(signer)).use(irysUploader());
}

// create metadata JSON from token config
export function createMetadataJson(
  name: string,
  symbol: string,
  description: string,
  image: string,
  website: string,
  twitter: string,
  telegram: string,
  imageUri?: string
): TokenMetadata {
  const metadata = {
    name: name,
    symbol: symbol,
    description: description,
    image: imageUri || image,
    website: website,
    twitter: twitter,
    telegram: telegram,
  };

  return metadata;
}

// upload metadata JSON
export async function uploadTokenMetadata(
  rpcUrl: string,
  payerKeypair: Keypair,
  name: string,
  symbol: string,
  image: string,
  description: string,
  website: string,
  twitter: string,
  telegram: string
): Promise<string> {
  let imageUri: string | undefined;

  // handle image upload if image is a file path
  if (image && !image.startsWith('http')) {
    console.log('Image file path provided, uploading image first...');
    imageUri = await destructureImageFilePath(rpcUrl, payerKeypair, image);
  }

  const umi = createUmiInstance(rpcUrl, payerKeypair);
  const metadataJson = createMetadataJson(
    name,
    symbol,
    description,
    image,
    website,
    twitter,
    telegram,
    imageUri
  );

  console.log('Metadata JSON:', JSON.stringify(metadataJson, null, 2));

  try {
    const uri = await umi.uploader.uploadJson(metadataJson);
    console.log('Metadata uploaded successfully!');
    console.log('Metadata URI:', uri);
    return uri;
  } catch (error) {
    console.error('Error uploading metadata:', error);
    throw new Error(`Failed to upload metadata: ${error}`);
  }
}

// upload image from file path
export async function destructureImageFilePath(
  rpcUrl: string,
  payerKeypair: Keypair,
  imageFilePath: string
): Promise<string> {
  console.log(`Reading image file from: ${imageFilePath}`);

  try {
    // check if file exists
    if (!fs.existsSync(imageFilePath)) {
      throw new Error(`Image file not found: ${imageFilePath}`);
    }

    // read the image file
    const imageBuffer = fs.readFileSync(imageFilePath);
    const fileName = path.basename(imageFilePath);

    console.log(`Image file read successfully: ${fileName} (${imageBuffer.length} bytes)`);

    return await uploadImage(rpcUrl, payerKeypair, new Uint8Array(imageBuffer), fileName);
  } catch (error) {
    console.error('Error reading/uploading image file:', error);
    throw new Error(`Failed to upload image from path: ${error}`);
  }
}

// upload image file to irys
export async function uploadImage(
  rpcUrl: string,
  payerKeypair: Keypair,
  imageBuffer: Uint8Array,
  fileName: string = 'image.png'
): Promise<string> {
  console.log('Uploading image to Irys...');

  const umi = createUmiInstance(rpcUrl, payerKeypair);

  try {
    const genericFile = createGenericFile(imageBuffer, fileName);
    const [imageUri] = await umi.uploader.upload([genericFile]);
    console.log('Image uploaded successfully!');
    console.log('Image URI:', imageUri);
    if (!imageUri) {
      throw new Error('Image upload failed - no URI returned');
    }
    return imageUri;
  } catch (error) {
    console.error('Error uploading image:', error);
    throw new Error(`Failed to upload image: ${error}`);
  }
}
