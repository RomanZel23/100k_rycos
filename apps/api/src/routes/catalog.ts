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

  // POST /v1/terminals/claim - Device pairs using setup code.
  // Pairing issues a signed device token and invalidates tokens of any previously paired device.
  fastify.post('/v1/terminals/claim', async (req, reply) => {
    const { getDatabase, terminals, eq, sql } = await import('@rycos/database');
    const { issueTerminalToken, invalidateTerminalCache } = await import('../middleware/adminAuth.js');
    const { rateLimit } = await import('../lib/rateLimit.js');
    const db = getDatabase();
    const body = (req.body ?? {}) as any;
    const code = String(body.code || body.terminalId || body.terminal_id || '').trim().toUpperCase();

    if (!(await rateLimit(`claim:${req.ip}`, 10, 60))) {
      return reply.code(429).send({ error: 'Zbyt wiele prób parowania. Spróbuj ponownie za minutę.' });
    }

    if (!code) {
      return reply.code(400).send({ error: 'Setup code is required' });
    }

    const [term] = await db
      .select()
      .from(terminals)
      .where(eq(terminals.terminalId, code))
      .limit(1);

    if (!term) {
      return reply.code(404).send({ error: 'Invalid setup code' });
    }

    if (term.status === 'archived' || term.status === 'inactive') {
      return reply.code(409).send({ error: 'This terminal was deactivated' });
    }

    const [updated] = await db
      .update(terminals)
      .set({
        status: 'active',
        lastActiveAt: new Date(),
        sessionVersion: sql`${terminals.sessionVersion} + 1`,
      })
      .where(eq(terminals.id, term.id))
      .returning();

    invalidateTerminalCache();
    const terminalToken = issueTerminalToken(updated);

    return reply.send({
      data: {
        ...updated,
        terminal_id: updated.terminalId,
        company_id: updated.companyId,
        tap_device_id: updated.tapDeviceId,
        printer_device_id: updated.printerDeviceId,
        fiscal_device_id: updated.fiscalDeviceId,
        terminal_token: terminalToken,
      },
      message: 'Terminal paired successfully',
    });
  });
}
