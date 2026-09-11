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

    return success(reply, rows, 'Terminals retrieved');
  });

  // POST /v1/admin/terminals - Create terminal
  fastify.post('/v1/admin/terminals', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);
    const body = req.body as any;

    if (!body.name || !body.terminalId) {
      return validationError(reply, {
        name: !body.name ? 'name is required' : '',
        terminalId: !body.terminalId ? 'terminalId is required' : '',
      });
    }

    try {
      const [inserted] = await db
        .insert(terminals)
        .values({
          companyId,
          terminalId: String(body.terminalId).trim(),
          name: String(body.name).trim(),
          locationId: body.locationId ? parseInt(String(body.locationId), 10) : null,
          isPrimary: Boolean(body.isPrimary),
          status: body.status || 'active',
        })
        .returning();

      return success(reply, inserted, 'Terminal created', 201);
    } catch (err: any) {
      return error(reply, err.message || 'Failed to create terminal');
    }
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
}
