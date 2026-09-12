import type { FastifyInstance } from 'fastify';
import { fetchImageFromSupabase, deleteImageFromSupabase, ensureStorageTable } from '../lib/storage.js';
import { getRawClient } from '@rycos/database';

export async function storageRoutes(fastify: FastifyInstance) {
  // GET /v1/storage/products/:fileName - Publicly serve product images from local Supabase Storage
  fastify.get('/v1/storage/products/:fileName', async (req, reply) => {
    const { fileName } = req.params as { fileName: string };

    const safeName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '');
    if (!safeName) {
      return reply.status(400).send({ error: 'Invalid file name' });
    }

    const image = await fetchImageFromSupabase(safeName, 'products');
    if (!image) {
      return reply.status(404).send({ error: 'Image not found' });
    }

    return reply
      .header('Content-Type', image.contentType)
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .header('Cross-Origin-Resource-Policy', 'cross-origin')
      .header('Access-Control-Allow-Origin', '*')
      .send(image.buffer);
  });

  // GET /v1/storage/:bucket/:fileName - Generic public storage endpoint
  fastify.get('/v1/storage/:bucket/:fileName', async (req, reply) => {
    const { bucket, fileName } = req.params as { bucket: string; fileName: string };
    const safeName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '');
    if (!safeName) {
      return reply.status(400).send({ error: 'Invalid file name' });
    }

    const image = await fetchImageFromSupabase(safeName, bucket);
    if (!image) {
      return reply.status(404).send({ error: 'Image not found' });
    }

    return reply
      .header('Content-Type', image.contentType)
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .header('Cross-Origin-Resource-Policy', 'cross-origin')
      .header('Access-Control-Allow-Origin', '*')
      .send(image.buffer);
  });

  // Supabase Storage REST API compatibility endpoints:
  // GET /storage/v1/object/public/:bucket/:fileName
  fastify.get('/storage/v1/object/public/:bucket/:fileName', async (req, reply) => {
    const { bucket, fileName } = req.params as { bucket: string; fileName: string };
    const safeName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '');

    const image = await fetchImageFromSupabase(safeName, bucket);
    if (!image) {
      return reply.status(404).send({ error: 'Not Found', message: 'Object not found', statusCode: 404 });
    }

    return reply
      .header('Content-Type', image.contentType)
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .header('Cross-Origin-Resource-Policy', 'cross-origin')
      .header('Access-Control-Allow-Origin', '*')
      .send(image.buffer);
  });

  // GET /storage/v1/object/authenticated/:bucket/:fileName
  fastify.get('/storage/v1/object/authenticated/:bucket/:fileName', async (req, reply) => {
    const { bucket, fileName } = req.params as { bucket: string; fileName: string };
    const safeName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '');

    const image = await fetchImageFromSupabase(safeName, bucket);
    if (!image) {
      return reply.status(404).send({ error: 'Not Found', message: 'Object not found', statusCode: 404 });
    }

    return reply
      .header('Content-Type', image.contentType)
      .header('Cache-Control', 'private, max-age=3600')
      .header('Cross-Origin-Resource-Policy', 'cross-origin')
      .header('Access-Control-Allow-Origin', '*')
      .send(image.buffer);
  });

  // POST /storage/v1/object/:bucket/:fileName
  fastify.post('/storage/v1/object/:bucket/:fileName', async (req, reply) => {
    const { bucket, fileName } = req.params as { bucket: string; fileName: string };
    const safeName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '');

    let buffer: Buffer;
    let mimeType = 'image/jpeg';

    if (req.isMultipart()) {
      const file = await req.file();
      if (!file) {
        return reply.status(400).send({ error: 'No file uploaded' });
      }
      buffer = await file.toBuffer();
      mimeType = file.mimetype;
    } else {
      buffer = Buffer.from((req.body as any) || '');
      mimeType = req.headers['content-type'] || 'application/octet-stream';
    }

    await ensureStorageTable();
    const raw = getRawClient();
    if (raw) {
      await raw`
        INSERT INTO storage_files (id, bucket, name, mime_type, size, data, created_at, updated_at)
        VALUES (${safeName}, ${bucket}, ${safeName}, ${mimeType}, ${buffer.length}, ${buffer}, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET
          mime_type = EXCLUDED.mime_type,
          size = EXCLUDED.size,
          data = EXCLUDED.data,
          updated_at = NOW();
      `;
    }

    return reply.status(200).send({
      Key: `${bucket}/${safeName}`,
      Id: safeName,
    });
  });

  // DELETE /storage/v1/object/:bucket
  fastify.delete('/storage/v1/object/:bucket', async (req, reply) => {
    const body = req.body as { prefixes?: string[] };
    if (body?.prefixes && Array.isArray(body.prefixes)) {
      for (const prefix of body.prefixes) {
        await deleteImageFromSupabase(prefix);
      }
    }
    return reply.status(200).send({ message: 'Successfully deleted' });
  });
}
