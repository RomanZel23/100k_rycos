import type { FastifyInstance } from 'fastify';
import { parseBool } from '../../lib/ids.js';
import { getDatabase, companyPaymentGateways, eq, and, desc } from '@rycos/database';
import { requireAdminAuth, getCompanyId } from '../../middleware/adminAuth.js';
import { success, notFound, error, validationError } from '../../lib/response.js';

export async function adminPaymentGatewaysRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireAdminAuth);

  // GET /v1/admin/payment-gateways - List configured payment processors
  fastify.get('/v1/admin/payment-gateways', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);

    const rows = await db
      .select()
      .from(companyPaymentGateways)
      .where(eq(companyPaymentGateways.companyId, companyId))
      .orderBy(desc(companyPaymentGateways.id));

    const mapped = rows.map((r) => ({
      id: r.id,
      company_id: r.companyId,
      gateway_name: r.gatewayName,
      type: r.type,
      public_key: r.publicKey,
      private_key_set: Boolean(r.privateKey),
      is_test: r.isTest,
      additional_data: {
        customer_id: r.customerId,
        terminal_id: r.terminalId,
        is_test: r.isTest,
      },
      is_active: r.isActive,
    }));

    return success(reply, mapped, 'Payment gateways retrieved');
  });

  // POST /v1/admin/payment-gateways - Create or update payment processor
  fastify.post('/v1/admin/payment-gateways', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);
    const body = (req.body ?? {}) as any;

    const gatewayName = body.gateway_name || body.gatewayName || 'SaferPay';
    const publicKey = body.public_key || body.publicKey;
    const privateKey = body.private_key || body.privateKey;
    const customerId = body.customer_id || body.customerId;
    const terminalId = body.terminal_id || body.terminalId;
    const rawIsTest = body.is_test !== undefined ? body.is_test : body.isTest;
    const isTest = parseBool(rawIsTest, true);
    const id = body.id ? parseInt(String(body.id), 10) : undefined;

    try {
      if (id) {
        // Update existing
        const updateData: Record<string, any> = {
          updatedAt: new Date(),
        };
        if (rawIsTest !== undefined) updateData.isTest = isTest;
        if (publicKey !== undefined) updateData.publicKey = publicKey;
        if (privateKey) updateData.privateKey = privateKey;
        if (customerId !== undefined) updateData.customerId = String(customerId);
        if (terminalId !== undefined) updateData.terminalId = String(terminalId);

        const [updated] = await db
          .update(companyPaymentGateways)
          .set(updateData)
          .where(and(eq(companyPaymentGateways.id, id), eq(companyPaymentGateways.companyId, companyId)))
          .returning();

        return success(reply, updated, 'Payment gateway updated');
      }

      // Check if already exists for this gateway_name
      const [existing] = await db
        .select()
        .from(companyPaymentGateways)
        .where(and(eq(companyPaymentGateways.companyId, companyId), eq(companyPaymentGateways.gatewayName, gatewayName)))
        .limit(1);

      if (existing) {
        const updateData: Record<string, any> = {
          updatedAt: new Date(),
        };
        if (rawIsTest !== undefined) updateData.isTest = isTest;
        if (publicKey !== undefined) updateData.publicKey = publicKey;
        if (privateKey) updateData.privateKey = privateKey;
        if (customerId !== undefined) updateData.customerId = String(customerId);
        if (terminalId !== undefined) updateData.terminalId = String(terminalId);

        const [updated] = await db
          .update(companyPaymentGateways)
          .set(updateData)
          .where(eq(companyPaymentGateways.id, existing.id))
          .returning();

        return success(reply, updated, 'Payment gateway updated');
      }

      // Insert new
      const [inserted] = await db
        .insert(companyPaymentGateways)
        .values({
          companyId,
          gatewayName,
          type: 'card_blik',
          publicKey: publicKey || null,
          privateKey: privateKey || null,
          customerId: customerId ? String(customerId) : null,
          terminalId: terminalId ? String(terminalId) : null,
          isTest,
          isActive: true,
        })
        .returning();

      return success(reply, inserted, 'Payment gateway configured', 201);
    } catch (err: any) {
      return error(reply, err.message || 'Failed to save payment gateway');
    }
  });

  // PUT /v1/admin/payment-gateways/:id - Update payment processor
  fastify.put('/v1/admin/payment-gateways/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const gatewayId = parseInt(id, 10);
    const companyId = getCompanyId(req);
    const db = getDatabase();
    const body = (req.body ?? {}) as any;

    const publicKey = body.public_key || body.publicKey;
    const privateKey = body.private_key || body.privateKey;
    const customerId = body.customer_id || body.customerId;
    const terminalId = body.terminal_id || body.terminalId;
    const rawIsTest = body.is_test !== undefined ? body.is_test : body.isTest;

    const updateData: Record<string, any> = {
      updatedAt: new Date(),
    };
    if (rawIsTest !== undefined) updateData.isTest = parseBool(rawIsTest, true);
    if (publicKey !== undefined) updateData.publicKey = publicKey;
    if (privateKey) updateData.privateKey = privateKey;
    if (customerId !== undefined) updateData.customerId = String(customerId);
    if (terminalId !== undefined) updateData.terminalId = String(terminalId);

    try {
      const [updated] = await db
        .update(companyPaymentGateways)
        .set(updateData)
        .where(and(eq(companyPaymentGateways.id, gatewayId), eq(companyPaymentGateways.companyId, companyId)))
        .returning();

      if (!updated) {
        return notFound(reply, 'Payment gateway not found');
      }

      return success(reply, updated, 'Payment gateway updated');
    } catch (err: any) {
      return error(reply, err.message || 'Failed to update payment gateway');
    }
  });

  // DELETE /v1/admin/payment-gateways/:id - Remove payment processor
  fastify.delete('/v1/admin/payment-gateways/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const gatewayId = parseInt(id, 10);
    const companyId = getCompanyId(req);
    const db = getDatabase();

    try {
      const [deleted] = await db
        .delete(companyPaymentGateways)
        .where(and(eq(companyPaymentGateways.id, gatewayId), eq(companyPaymentGateways.companyId, companyId)))
        .returning();

      if (!deleted) {
        return notFound(reply, 'Payment gateway not found');
      }

      return success(reply, { id: gatewayId }, 'Payment gateway deleted');
    } catch (err: any) {
      return error(reply, err.message || 'Failed to delete payment gateway');
    }
  });
}
