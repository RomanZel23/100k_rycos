import type { FastifyInstance } from 'fastify';
import { getDatabase, companies, eq } from '@rycos/database';
import { requireAdminAuth, getCompanyId } from '../../middleware/adminAuth.js';
import { success, error, validationError } from '../../lib/response.js';
import { rycosIntegratorService } from '../../services/rycosIntegratorService.js';
import { rycosLicenseService } from '../../services/rycosLicenseService.js';

export async function adminRycosRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireAdminAuth);

  // GET /v1/admin/rycos/licenses - Full licensing, seats & device fleet overview for current company
  fastify.get('/v1/admin/rycos/licenses', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);

    const [company] = await db
      .select({
        id: companies.id,
        name: companies.name,
        nip: companies.nip,
        licenseToken: companies.licenseToken,
        licenseStatus: companies.licenseStatus,
        licenseValidUntil: companies.licenseValidUntil,
      })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    const rawNip = company?.nip || null;
    const integratorData = await rycosIntegratorService.getCompanyLicensing(rawNip);

    // Get or refresh server license heartbeat for this specific company
    let serverLicense = company?.id ? rycosLicenseService.getCachedCompanyStatus(company.id) : null;
    if (!serverLicense && company) {
      serverLicense = await rycosLicenseService.checkHeartbeat({
        companyId: company.id,
        token: company.licenseToken,
        instanceName: `${company.name} (100k)`,
      });
    }

    return success(reply, {
      company: {
        id: company?.id,
        name: company?.name,
        nip: rawNip,
        has_license_token: Boolean(company?.licenseToken),
        token_hint: company?.licenseToken ? company.licenseToken.slice(-4) : null,
      },
      integrator: integratorData,
      server_license: serverLicense,
    }, 'Licensing overview retrieved');
  });

  // POST /v1/admin/rycos/license-token - Save or update server license token for current company
  fastify.post('/v1/admin/rycos/license-token', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);
    const body = (req.body ?? {}) as any;
    const rawToken = typeof body.licenseToken === 'string' ? body.licenseToken.trim() : '';

    const [company] = await db
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    if (!company) {
      return error(reply, 'Nie znaleziono firmy', 404);
    }

    // Save token to company record
    await db
      .update(companies)
      .set({
        licenseToken: rawToken || null,
        updatedAt: new Date(),
      })
      .where(eq(companies.id, companyId));

    // Run immediate heartbeat verification
    const freshStatus = await rycosLicenseService.checkHeartbeat({
      companyId: company.id,
      token: rawToken,
      instanceName: `${company.name} (100k)`,
    });

    return success(reply, {
      license_token: rawToken ? `${rawToken.slice(0, 5)}...${rawToken.slice(-4)}` : null,
      server_license: freshStatus,
    }, 'Token licencji serwerowej został zaktualizowany');
  });

  // POST /v1/admin/rycos/check-license - Trigger immediate license refresh for current company
  fastify.post('/v1/admin/rycos/check-license', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);

    const [company] = await db
      .select({
        id: companies.id,
        name: companies.name,
        licenseToken: companies.licenseToken,
      })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    if (!company) {
      return error(reply, 'Nie znaleziono firmy', 404);
    }

    const freshStatus = await rycosLicenseService.checkHeartbeat({
      companyId: company.id,
      token: company.licenseToken,
      instanceName: `${company.name} (100k)`,
    });

    return success(reply, { server_license: freshStatus }, 'Status licencji serwerowej odświeżony');
  });

  // POST /v1/admin/rycos/pin - Generate pairing PIN for a seat
  fastify.post('/v1/admin/rycos/pin', async (req, reply) => {
    const body = (req.body ?? {}) as any;
    const seatId = String(body.seatId || body.seat_id || '').trim();

    if (!seatId) {
      return validationError(reply, { seat_id: 'seat_id is required' });
    }

    try {
      const pinResult = await rycosIntegratorService.generatePairingPin(seatId);
      return success(reply, pinResult, 'Pairing PIN generated');
    } catch (err: any) {
      return error(reply, err.message || 'Failed to generate pairing PIN', 400);
    }
  });

  // POST /v1/admin/rycos/unpair - Unpair device from seat
  fastify.post('/v1/admin/rycos/unpair', async (req, reply) => {
    const body = (req.body ?? {}) as any;
    const seatId = String(body.seatId || body.seat_id || '').trim();

    if (!seatId) {
      return validationError(reply, { seat_id: 'seat_id is required' });
    }

    try {
      const result = await rycosIntegratorService.unpairSeatDevice(seatId);
      return success(reply, result, 'Device unpaired successfully');
    } catch (err: any) {
      return error(reply, err.message || 'Failed to unpair device', 400);
    }
  });

  // GET /v1/admin/rycos/devices - Available SBR devices for current company
  fastify.get('/v1/admin/rycos/devices', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);

    const [company] = await db
      .select({ nip: companies.nip })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    const licensing = await rycosIntegratorService.getCompanyLicensing(company?.nip);
    return success(reply, licensing.devices, 'Devices retrieved');
  });

  // POST /v1/admin/rycos/seats/:seatId/pin - REST alias for PIN generation
  fastify.post('/v1/admin/rycos/seats/:seatId/pin', async (req, reply) => {
    const { seatId } = req.params as { seatId: string };
    try {
      const pinResult = await rycosIntegratorService.generatePairingPin(seatId);
      return success(reply, pinResult, 'Pairing PIN generated');
    } catch (err: any) {
      return error(reply, err.message || 'Failed to generate pairing PIN', 400);
    }
  });

  // DELETE /v1/admin/rycos/seats/:seatId/device - REST alias for device unpair
  fastify.delete('/v1/admin/rycos/seats/:seatId/device', async (req, reply) => {
    const { seatId } = req.params as { seatId: string };
    try {
      const result = await rycosIntegratorService.unpairSeatDevice(seatId);
      return success(reply, result, 'Device unpaired successfully');
    } catch (err: any) {
      return error(reply, err.message || 'Failed to unpair device', 400);
    }
  });

  // POST /v1/admin/rycos/sync - Sync licensing
  fastify.post('/v1/admin/rycos/sync', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);

    const [company] = await db
      .select({ id: companies.id, name: companies.name, nip: companies.nip, licenseToken: companies.licenseToken })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    const licensing = await rycosIntegratorService.getCompanyLicensing(company?.nip);
    if (company) {
      await rycosLicenseService.checkHeartbeat({
        companyId: company.id,
        token: company.licenseToken,
        instanceName: `${company.name} (100k)`,
      });
    }

    return success(reply, licensing, 'Licensing data synchronized');
  });

  // POST /v1/admin/rycos/link - Link company with NIP
  fastify.post('/v1/admin/rycos/link', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);
    const body = (req.body ?? {}) as any;
    const nip = String(body.nip || '').trim();

    if (nip) {
      await db
        .update(companies)
        .set({ nip })
        .where(eq(companies.id, companyId));
    }

    const licensing = await rycosIntegratorService.getCompanyLicensing(nip);
    return success(reply, licensing, 'Company linked with RYCOS');
  });

  // DELETE /v1/admin/rycos/link - Unlink company
  fastify.delete('/v1/admin/rycos/link', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);

    await db
      .update(companies)
      .set({ nip: null })
      .where(eq(companies.id, companyId));

    return success(reply, { unlinked: true }, 'Company unlinked from RYCOS');
  });

  // GET /v1/admin/rycos/status - Status check endpoint
  fastify.get('/v1/admin/rycos/status', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);

    const [company] = await db
      .select({ id: companies.id, name: companies.name, nip: companies.nip, licenseToken: companies.licenseToken })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    const licensing = await rycosIntegratorService.getCompanyLicensing(company?.nip);
    let serverLicense = company ? rycosLicenseService.getCachedCompanyStatus(company.id) : null;
    if (!serverLicense && company) {
      serverLicense = await rycosLicenseService.checkHeartbeat({
        companyId: company.id,
        token: company.licenseToken,
        instanceName: `${company.name} (100k)`,
      });
    }

    return success(reply, {
      configured: rycosIntegratorService.isConfigured(),
      linked: Boolean(licensing.client),
      client: licensing.client,
      seats: licensing.seats ?? [],
      purchases: [],
      tier_summary: licensing.tierSummary ?? { total: 0, paired: 0, available: 0, byTier: {} },
      server_license: serverLicense,
      portal_error: licensing.error ?? null,
    });
  });
}
