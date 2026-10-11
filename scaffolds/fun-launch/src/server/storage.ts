/**
 * Public file storage for token images and metadata JSON.
 * Uses Vercel Blob (free on the Hobby plan) when a store is connected to the project: either a
 * BLOB_READ_WRITE_TOKEN, or OIDC auth with the store id (BLOB_STORE_ID, or BLOB_1_STORE_ID when
 * Vercel prefixed it). The store must use public access. Otherwise Cloudflare R2 via its S3 API.
 */
import { put } from '@vercel/blob';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const { BLOB_READ_WRITE_TOKEN, BLOB_STORE_ID, BLOB_1_STORE_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ACCOUNT_ID, R2_BUCKET, R2_PUBLIC_URL } =
  process.env;

const blobStoreId = BLOB_STORE_ID || BLOB_1_STORE_ID;

const r2Configured = !!(R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_ACCOUNT_ID && R2_BUCKET && R2_PUBLIC_URL);

const r2 = r2Configured
  ? new S3Client({
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID!, secretAccessKey: R2_SECRET_ACCESS_KEY! },
      region: 'auto',
    })
  : null;

/** Upload a public file and return its URL. */
export async function uploadPublic(path: string, body: Buffer, contentType: string): Promise<string> {
  if (BLOB_READ_WRITE_TOKEN || blobStoreId) {
    const blob = await put(path, body, {
      access: 'public',
      contentType,
      addRandomSuffix: false,
      // Prefer OIDC with the connected store's id; a leftover read-write token can point at a
      // deleted store
      ...(blobStoreId ? { storeId: blobStoreId } : {}),
    });
    return blob.url;
  }
  if (r2) {
    await r2.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: path, Body: body, ContentType: contentType }));
    return `${R2_PUBLIC_URL}/${path}`;
  }
  throw new Error('No storage configured: connect a Vercel Blob store or set the R2_* variables');
}
