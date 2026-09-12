import { env } from '../config/env.js';
import crypto from 'crypto';

const BUCKET = env.SUPABASE_STORAGE_BUCKET || 'products';

// Check or create bucket in Supabase Storage
let bucketChecked = false;
export async function ensureSupabaseBucket(): Promise<void> {
  if (bucketChecked) return;
  const baseUrl = env.SUPABASE_URL.replace(/\/$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!key) {
    console.warn('SUPABASE_SERVICE_ROLE_KEY is not defined; skipping bucket verification');
    return;
  }

  try {
    const res = await fetch(`${baseUrl}/storage/v1/bucket`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'apikey': key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: BUCKET,
        name: BUCKET,
        public: true,
      }),
    });
    if (res.ok || res.status === 409 || res.status === 400) {
      bucketChecked = true;
    }
  } catch (err) {
    console.warn('Warning: Could not contact Supabase storage bucket endpoint:', err);
  }
}

export async function uploadImageToSupabase(
  buffer: Buffer,
  mimeType: string,
  originalFilename?: string
): Promise<string> {
  await ensureSupabaseBucket();

  const baseUrl = env.SUPABASE_URL.replace(/\/$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const ext = originalFilename?.split('.').pop() || 'jpg';
  const fileName = `${crypto.randomUUID()}.${ext}`;

  const uploadUrl = `${baseUrl}/storage/v1/object/${BUCKET}/${fileName}`;

  const headers: Record<string, string> = {
    'Content-Type': mimeType,
    'x-upsert': 'true',
  };

  if (key) {
    headers['Authorization'] = `Bearer ${key}`;
    headers['apikey'] = key;
  }

  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers,
    body: buffer,
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Supabase Storage upload failed (${res.status}): ${errorText}`);
  }

  // Return public proxy URL through Core API to guarantee external SSL accessibility
  const publicApiUrl = env.PUBLIC_API_URL.replace(/\/$/, '');
  return `${publicApiUrl}/v1/storage/products/${fileName}`;
}

export async function deleteImageFromSupabase(imageUrl: string): Promise<void> {
  const fileName = imageUrl.split('/').pop();
  if (!fileName) return;

  const baseUrl = env.SUPABASE_URL.replace(/\/$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (key) {
    headers['Authorization'] = `Bearer ${key}`;
    headers['apikey'] = key;
  }

  try {
    await fetch(`${baseUrl}/storage/v1/object/${BUCKET}`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ prefixes: [fileName] }),
    });
  } catch (err) {
    console.warn('Could not delete image from Supabase storage:', err);
  }
}

export async function fetchImageFromSupabase(
  fileName: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const baseUrl = env.SUPABASE_URL.replace(/\/$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const downloadUrl = `${baseUrl}/storage/v1/object/public/${BUCKET}/${fileName}`;

  try {
    let res = await fetch(downloadUrl);
    if (!res.ok && key) {
      // Fallback to authenticated endpoint if bucket is not marked public in Supabase
      res = await fetch(`${baseUrl}/storage/v1/object/authenticated/${BUCKET}/${fileName}`, {
        headers: {
          'Authorization': `Bearer ${key}`,
          'apikey': key,
        },
      });
    }

    if (!res.ok) return null;

    const arrayBuffer = await res.arrayBuffer();
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    return { buffer: Buffer.from(arrayBuffer), contentType };
  } catch (err) {
    console.error(`Failed to fetch image ${fileName} from Supabase storage:`, err);
    return null;
  }
}
