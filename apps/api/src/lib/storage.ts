import { getRawClient } from '@rycos/database';
import { env } from '../config/env.js';
import crypto from 'crypto';

const BUCKET = env.SUPABASE_STORAGE_BUCKET || 'products';

// Auto-ensure storage_files table exists in local Supabase Postgres
let tableChecked = false;
export async function ensureStorageTable(): Promise<void> {
  if (tableChecked) return;
  const raw = getRawClient();
  if (!raw) return;

  try {
    await raw.unsafe(`
      CREATE TABLE IF NOT EXISTS "storage_files" (
        "id" varchar(128) PRIMARY KEY NOT NULL,
        "bucket" varchar(64) DEFAULT 'products' NOT NULL,
        "name" varchar(255) NOT NULL,
        "mime_type" varchar(128) NOT NULL,
        "size" integer NOT NULL,
        "data" bytea NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "idx_storage_files_bucket_name" ON "storage_files" ("bucket", "name");
    `);
    tableChecked = true;
  } catch (err) {
    console.warn('[Storage] Notice during storage table check:', err);
  }
}

export async function uploadImageToSupabase(
  buffer: Buffer,
  mimeType: string,
  originalFilename?: string
): Promise<string> {
  await ensureStorageTable();
  const raw = getRawClient();
  if (!raw) {
    throw new Error('Database connection not available for Supabase Storage');
  }

  const ext = originalFilename?.split('.').pop() || 'jpg';
  const fileName = `${crypto.randomUUID()}.${ext}`;

  await raw`
    INSERT INTO storage_files (id, bucket, name, mime_type, size, data, created_at, updated_at)
    VALUES (${fileName}, ${BUCKET}, ${fileName}, ${mimeType}, ${buffer.length}, ${buffer}, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
      mime_type = EXCLUDED.mime_type,
      size = EXCLUDED.size,
      data = EXCLUDED.data,
      updated_at = NOW();
  `;

  // Sync to storage.objects metadata if Supabase schema is present
  try {
    await raw.unsafe(`
      DO $sync$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
          INSERT INTO storage.objects (bucket_id, name, owner, metadata)
          VALUES ('${BUCKET}', '${fileName}', NULL, jsonb_build_object('size', ${buffer.length}, 'mimetype', '${mimeType}'))
          ON CONFLICT DO NOTHING;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END $sync$;
    `);
  } catch {
    // Ignore schema sync errors
  }

  const publicApiUrl = env.PUBLIC_API_URL.replace(/\/$/, '');
  return `${publicApiUrl}/v1/storage/products/${fileName}`;
}

export async function deleteImageFromSupabase(imageUrl: string): Promise<void> {
  const fileName = imageUrl.split('/').pop();
  if (!fileName) return;

  const raw = getRawClient();
  if (!raw) return;

  try {
    await raw`
      DELETE FROM storage_files
      WHERE bucket = ${BUCKET} AND (name = ${fileName} OR id = ${fileName});
    `;

    // Also remove from storage.objects if present
    await raw.unsafe(`
      DO $sync$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
          DELETE FROM storage.objects WHERE bucket_id = '${BUCKET}' AND name = '${fileName}';
        END IF;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END $sync$;
    `);
  } catch (err) {
    console.warn('[Storage] Could not delete image from Supabase storage:', err);
  }
}

export async function fetchImageFromSupabase(
  fileName: string,
  bucket: string = BUCKET
): Promise<{ buffer: Buffer; contentType: string } | null> {
  await ensureStorageTable();
  const raw = getRawClient();
  if (!raw) return null;

  try {
    let rows = await raw`
      SELECT data, mime_type
      FROM storage_files
      WHERE bucket = ${bucket} AND (name = ${fileName} OR id = ${fileName})
      LIMIT 1;
    `;

    if (!rows || rows.length === 0) {
      rows = await raw`
        SELECT data, mime_type
        FROM storage_files
        WHERE name = ${fileName} OR id = ${fileName}
        LIMIT 1;
      `;
    }

    if (!rows || rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      buffer: Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data),
      contentType: row.mime_type || 'image/jpeg',
    };
  } catch (err) {
    console.error(`[Storage] Failed to fetch image ${fileName} from local Supabase storage:`, err);
    return null;
  }
}
