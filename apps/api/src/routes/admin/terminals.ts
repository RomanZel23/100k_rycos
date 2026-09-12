import type { FastifyInstance } from 'fastify';
import { getDatabase, terminals, locations, eq, and, desc } from '@rycos/database';
import { requireAdminAuth, getCompanyId } from '../../middleware/adminAuth.js';
import { success, notFound, error, validationError } from '../../lib/response.js';

export async function adminTerminalsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireAdminAuth);

  // GET /v1/admin/terminals - List all terminals
  fastify.get('/v1/admin/terminals', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);

    const rows = await db
      .select({
        id: terminals.id,
        terminalId: terminals.terminalId,
        name: terminals.name,
        locationId: terminals.locationId,
        locationName: locations.name,
        isPrimary: terminals.isPrimary,
        status: terminals.status,
        lastActiveAt: terminals.lastActiveAt,
        createdAt: terminals.createdAt,
      })
      .from(terminals)
      .leftJoin(locations, eq(terminals.locationId, locations.id))
      .where(eq(terminals.companyId, companyId))
      .orderBy(desc(terminals.isPrimary), desc(terminals.id));

    const mapped = rows.map((r) => ({
      ...r,
      terminal_id: r.terminalId,
      location_id: r.locationId,
      location_name: r.locationName,
      last_active: r.lastActiveAt ? r.lastActiveAt.toISOString() : null,
      is_primary: r.isPrimary,
    }));

    return success(reply, mapped, 'Terminals retrieved');
  });

  function generateSetupCode(): string {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  // POST /v1/admin/terminals - Create terminal
  fastify.post('/v1/admin/terminals', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);
    const body = req.body as any;

    if (!body.name) {
      return validationError(reply, {
        name: 'name is required',
      });
    }

    const terminalId = String(body.terminalId || body.terminal_id || generateSetupCode()).trim();
    const locationId = body.locationId || body.location_id ? parseInt(String(body.locationId || body.location_id), 10) : null;

    try {
      const [inserted] = await db
        .insert(terminals)
        .values({
          companyId,
          terminalId,
          name: String(body.name).trim(),
          locationId,
          isPrimary: Boolean(body.isPrimary || body.is_primary),
          status: body.status || 'unclaimed',
        })
        .returning();

      return success(reply, {
        ...inserted,
        terminal_id: inserted.terminalId,
        location_id: inserted.locationId,
        is_primary: inserted.isPrimary,
      }, 'Terminal created', 201);
    } catch (err: any) {
      return error(reply, err.message || 'Failed to create terminal');
    }
  });

  // POST /v1/admin/terminals/claim - Device claims/pairs a terminal using setup code or terminal_id
  fastify.post('/v1/admin/terminals/claim', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);
    const body = (req.body ?? {}) as any;
    const code = String(body.code || body.terminalId || body.terminal_id || '').trim().toUpperCase();

    if (!code) {
      return validationError(reply, { code: 'Setup code or terminal_id is required' });
    }

    const [term] = await db
      .select()
      .from(terminals)
      .where(and(eq(terminals.terminalId, code), eq(terminals.companyId, companyId)))
      .limit(1);

    if (!term) {
      const [other] = await db
        .select({ id: terminals.id })
        .from(terminals)
        .where(eq(terminals.terminalId, code))
        .limit(1);

      if (other) {
        return error(reply, 'This setup code belongs to a different company.', 403);
      }
      return notFound(reply, 'Invalid setup code or terminal not found');
    }

    if (term.status === 'archived' || term.status === 'inactive') {
      return error(reply, 'This terminal is inactive or archived.', 409);
    }

    const [updated] = await db
      .update(terminals)
      .set({
        status: 'active',
        lastActiveAt: new Date(),
      })
      .where(eq(terminals.id, term.id))
      .returning();

    return success(reply, {
      ...updated,
      terminal_id: updated.terminalId,
      location_id: updated.locationId,
      is_primary: updated.isPrimary,
    }, 'Terminal paired successfully');
  });

  // GET /v1/admin/terminals/check - Verify if terminal_id is active in company
  fastify.get('/v1/admin/terminals/check', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);
    const query = (req.query ?? {}) as any;
    const terminalId = String(query.terminal_id || query.terminalId || '').trim();

    if (!terminalId) {
      return validationError(reply, { terminal_id: 'terminal_id is required' });
    }

    const [term] = await db
      .select()
      .from(terminals)
      .where(and(eq(terminals.terminalId, terminalId), eq(terminals.companyId, companyId)))
      .limit(1);

    if (term && term.status === 'active') {
      await db
        .update(terminals)
        .set({ lastActiveAt: new Date() })
        .where(eq(terminals.id, term.id));

      return success(reply, { registered: true, exists_in_other_company: false, terminal: term });
    }

    const [other] = await db
      .select({ id: terminals.id })
      .from(terminals)
      .where(eq(terminals.terminalId, terminalId))
      .limit(1);

    return success(reply, {
      registered: false,
      exists_in_other_company: Boolean(other),
    });
  });

  // GET /v1/admin/terminals/:id - Get terminal details
  fastify.get('/v1/admin/terminals/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const termId = parseInt(id, 10);
    const companyId = getCompanyId(req);
    const db = getDatabase();

    const [term] = await db
      .select({
        id: terminals.id,
        terminalId: terminals.terminalId,
        name: terminals.name,
        locationId: terminals.locationId,
        locationName: locations.name,
        isPrimary: terminals.isPrimary,
        status: terminals.status,
        lastActiveAt: terminals.lastActiveAt,
        createdAt: terminals.createdAt,
      })
      .from(terminals)
      .leftJoin(locations, eq(terminals.locationId, locations.id))
      .where(and(eq(terminals.id, termId), eq(terminals.companyId, companyId)))
      .limit(1);

    if (!term) {
      return notFound(reply, 'Terminal not found');
    }

    return success(reply, {
      ...term,
      terminal_id: term.terminalId,
      location_id: term.locationId,
      location_name: term.locationName,
      last_active: term.lastActiveAt ? term.lastActiveAt.toISOString() : null,
      is_primary: term.isPrimary,
    });
  });

  // PUT /v1/admin/terminals/:id - Update terminal
  fastify.put('/v1/admin/terminals/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const termId = parseInt(id, 10);
    const companyId = getCompanyId(req);
    const body = (req.body ?? {}) as any;
    const db = getDatabase();

    const updateData: Record<string, any> = {};
    if (body.name !== undefined) updateData.name = String(body.name).trim();
    if (body.location_id !== undefined || body.locationId !== undefined) {
      const loc = body.location_id ?? body.locationId;
      updateData.locationId = loc ? parseInt(String(loc), 10) : null;
    }
    if (body.status !== undefined) updateData.status = body.status;

    const [updated] = await db
      .update(terminals)
      .set(updateData)
      .where(and(eq(terminals.id, termId), eq(terminals.companyId, companyId)))
      .returning();

    if (!updated) {
      return notFound(reply, 'Terminal not found');
    }

    return success(reply, {
      ...updated,
      terminal_id: updated.terminalId,
      location_id: updated.locationId,
      is_primary: updated.isPrimary,
    }, 'Terminal updated');
  });

  // DELETE /v1/admin/terminals/:id - Delete terminal
  fastify.delete('/v1/admin/terminals/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const termId = parseInt(id, 10);
    const companyId = getCompanyId(req);
    const db = getDatabase();

    const [deleted] = await db
      .delete(terminals)
      .where(and(eq(terminals.id, termId), eq(terminals.companyId, companyId)))
      .returning();

    if (!deleted) {
      return notFound(reply, 'Terminal not found');
    }

    return success(reply, { id: termId }, 'Terminal deleted');
  });

  // POST /v1/admin/terminals/:id/archive - Archive terminal
  fastify.post('/v1/admin/terminals/:id/archive', async (req, reply) => {
    const { id } = req.params as { id: string };
    const termId = parseInt(id, 10);
    const companyId = getCompanyId(req);
    const db = getDatabase();

    const [updated] = await db
      .update(terminals)
      .set({ status: 'archived' })
      .where(and(eq(terminals.id, termId), eq(terminals.companyId, companyId)))
      .returning();

    if (!updated) {
      return notFound(reply, 'Terminal not found');
    }

    return success(reply, updated, 'Terminal archived');
  });

  // POST /v1/admin/terminals/:id/logout - Log out terminal
  fastify.post('/v1/admin/terminals/:id/logout', async (req, reply) => {
    const { id } = req.params as { id: string };
    const termId = parseInt(id, 10);
    const companyId = getCompanyId(req);
    const db = getDatabase();

    const [updated] = await db
      .update(terminals)
      .set({ status: 'unclaimed' })
      .where(and(eq(terminals.id, termId), eq(terminals.companyId, companyId)))
      .returning();

    if (!updated) {
      return notFound(reply, 'Terminal not found');
    }

    return success(reply, updated, 'Terminal logged out');
  });

  // GET /v1/admin/locations - List locations
  fastify.get('/v1/admin/locations', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);

    const rows = await db
      .select()
      .from(locations)
      .where(eq(locations.companyId, companyId))
      .orderBy(desc(locations.id));

    return success(reply, rows, 'Locations retrieved');
  });

  // POST /v1/admin/locations - Create location
  fastify.post('/v1/admin/locations', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);
    const body = req.body as any;

    if (!body.name) {
      return validationError(reply, { name: 'Name is required' });
    }

    try {
      const [inserted] = await db
        .insert(locations)
        .values({
          companyId,
          name: String(body.name).trim(),
          address: body.address ? String(body.address).trim() : null,
          isActive: body.isActive !== false,
        })
        .returning();

      return success(reply, inserted, 'Location created', 201);
    } catch (err: any) {
      return error(reply, err.message || 'Failed to create location');
    }
  });

  // PUT /v1/admin/locations/:id - Update location
  fastify.put('/v1/admin/locations/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const locId = parseInt(id, 10);
    const companyId = getCompanyId(req);
    const body = (req.body ?? {}) as any;
    const db = getDatabase();

    const updateData: Record<string, any> = {};
    if (body.name !== undefined) updateData.name = String(body.name).trim();
    if (body.address !== undefined) updateData.address = body.address ? String(body.address).trim() : null;

    const [updated] = await db
      .update(locations)
      .set(updateData)
      .where(and(eq(locations.id, locId), eq(locations.companyId, companyId)))
      .returning();

    if (!updated) {
      return notFound(reply, 'Location not found');
    }

    return success(reply, updated, 'Location updated');
  });

  // DELETE /v1/admin/locations/:id - Delete location
  fastify.delete('/v1/admin/locations/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const locId = parseInt(id, 10);
    const companyId = getCompanyId(req);
    const db = getDatabase();

    const [deleted] = await db
      .delete(locations)
      .where(and(eq(locations.id, locId), eq(locations.companyId, companyId)))
      .returning();

    if (!deleted) {
      return notFound(reply, 'Location not found');
    }

    return success(reply, { id: locId }, 'Location deleted');
  });
}
