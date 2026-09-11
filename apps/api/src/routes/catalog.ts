import { FastifyInstance } from 'fastify';
import { getBrandBySlug, getMenuByBrandId } from '../services/catalogService.js';
import { z } from 'zod';

export async function catalogRoutes(fastify: FastifyInstance) {
  // GET /v1/brands/:slug - Fetch brand header and metadata
  fastify.get('/v1/brands/:slug', async (req, reply) => {
    const params = req.params as { slug: string };
    const brand = await getBrandBySlug(params.slug);

    if (!brand) {
      return reply.code(404).send({ error: 'Brand not found' });
    }

    return reply.send({ data: brand });
  });

  // GET /v1/brands/:slug/menu - Fetch complete menu (categories, products, addons)
  fastify.get('/v1/brands/:slug/menu', async (req, reply) => {
    const params = req.params as { slug: string };
    const brand = await getBrandBySlug(params.slug);

    if (!brand) {
      return reply.code(404).send({ error: 'Brand not found' });
    }

    const query = (req.query ?? {}) as { lang?: string };
    const menu = await getMenuByBrandId(brand.id, brand.companyId, query.lang || 'pl');

    if (!menu) {
      return reply.code(404).send({ error: 'Menu not available' });
    }

    return reply.send({ data: menu });
  });
}
