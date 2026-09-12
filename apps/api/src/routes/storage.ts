import type { FastifyInstance } from 'fastify';
import { fetchImageFromSupabase } from '../lib/storage.js';

export async function storageRoutes(fastify: FastifyInstance) {
  // GET /v1/storage/products/:fileName - Publicly serve product images from local Supabase Storage
  fastify.get('/v1/storage/products/:fileName', async (req, reply) => {
    const { fileName } = req.params as { fileName: string };

    // Sanitize fileName to prevent directory traversal
    const safeName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '');
    if (!safeName) {
      return reply.status(400).send({ error: 'Invalid file name' });
    }

    const image = await fetchImageFromSupabase(safeName);
    if (!image) {
      return reply.status(404).send({ error: 'Image not found' });
    }

    return reply
      .header('Content-Type', image.contentType)
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .send(image.buffer);
  });
}
