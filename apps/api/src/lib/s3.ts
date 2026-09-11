import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../config/env.js';
import crypto from 'crypto';

export const s3Client = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true, // Needed for OVH Object Storage
});

export async function uploadImageToS3(
  buffer: Buffer,
  mimeType: string,
  originalFilename?: string
): Promise<string> {
  const ext = originalFilename?.split('.').pop() || 'jpg';
  const fileKey = `products/${crypto.randomUUID()}.${ext}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: fileKey,
      Body: buffer,
      ContentType: mimeType,
      ACL: 'public-read',
    })
  );

  const baseUrl = env.S3_ENDPOINT.replace(/\/$/, '');
  return `${baseUrl}/${env.S3_BUCKET}/${fileKey}`;
}
