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

  // POST /v1/terminals/heartbeat — paired station reports it is alive and receives its CURRENT configuration.
  // Lets stations pick up changes from the admin panel / structure editor without re-pairing.
  fastify.post('/v1/terminals/heartbeat', async (req, reply) => {
    const { getDatabase, terminals, eq } = await import('@rycos/database');
    const { resolveTerminalUser } = await import('../middleware/adminAuth.js');
    const principal = await resolveTerminalUser(req);
    if (!principal?.terminal_id) {
      return reply.code(401).send({ error: 'Stanowisko nie jest sparowane lub zostało wylogowane', unpaired: true });
    }
    const db = getDatabase();
    const [term] = await db.select().from(terminals).where(eq(terminals.terminalId, String(principal.terminal_id))).limit(1);
    if (!term) return reply.code(401).send({ error: 'Stanowisko nie istnieje', unpaired: true });

    // throttle writes: at most one last_active update per 25 s per station
    if (!term.lastActiveAt || Date.now() - term.lastActiveAt.getTime() > 25_000) {
      await db.update(terminals).set({ lastActiveAt: new Date() }).where(eq(terminals.id, term.id));
    }

    return reply.send({
      data: {
        id: term.id,
        terminal_id: term.terminalId,
        name: term.name,
        role: term.role,
        company_id: term.companyId,
        location_id: term.locationId,
        assigned_brand_ids: term.assignedBrandIds,
        tap_device_id: term.tapDeviceId,
        printer_device_id: term.printerDeviceId,
        fiscal_device_id: term.fiscalDeviceId,
        capabilities: term.capabilities,
        config_json: term.configJson,
        status: term.status,
      },
    });
  });

  // GET /v1/terminals/brands — brands a paired POS may sell: assigned brands, else the brands of its location,
  // else all active brands of its company. Replaces the old hard-coded 'default' brand on the POS.
  fastify.get('/v1/terminals/brands', async (req, reply) => {
    const { getDatabase, terminals, brands, eq, and, inArray } = await import('@rycos/database');
    const { resolveTerminalUser, resolveUser } = await import('../middleware/adminAuth.js');
    const principal = (await resolveTerminalUser(req)) || resolveUser(req);
    if (!principal) return reply.code(401).send({ error: 'Stanowisko nie jest sparowane', unpaired: true });

    const db = getDatabase();
    let assigned: number[] = [];
    let locationId: number | null = null;
    if (principal.terminal_id) {
      const [term] = await db.select().from(terminals).where(eq(terminals.terminalId, String(principal.terminal_id))).limit(1);
      assigned = (term?.assignedBrandIds as number[]) || [];
      locationId = term?.locationId ?? null;
    }
    const base = and(eq(brands.companyId, principal.company_id), eq(brands.isActive, true));
    let rows = assigned.length
      ? await db.select({ id: brands.id, name: brands.name, slug: brands.slug, locationId: brands.locationId }).from(brands).where(and(base, inArray(brands.id, assigned)))
      : [];
    if (!rows.length && locationId) {
      rows = await db.select({ id: brands.id, name: brands.name, slug: brands.slug, locationId: brands.locationId }).from(brands).where(and(base, eq(brands.locationId, locationId)));
    }
    if (!rows.length) {
      rows = await db.select({ id: brands.id, name: brands.name, slug: brands.slug, locationId: brands.locationId }).from(brands).where(base);
    }
    rows.sort((a, b) => a.id - b.id);
    return reply.send({ data: rows.map((b) => ({ id: b.id, name: b.name, slug: b.slug, location_id: b.locationId })) });
  });
}
