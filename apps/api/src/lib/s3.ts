import { uploadImageToSupabase } from './storage.js';

/**
 * @deprecated Legacy wrapper. Redirects to local Supabase Storage.
 */
export async function uploadImageToS3(
  buffer: Buffer,
  mimeType: string,
  originalFilename?: string
): Promise<string> {
  return uploadImageToSupabase(buffer, mimeType, originalFilename);
}
