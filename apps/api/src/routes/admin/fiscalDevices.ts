import type { FastifyInstance } from 'fastify';
import { getDatabase, fiscalDevices, eq, and, desc } from '@rycos/database';
import { requireAdminAuth, getCompanyId } from '../../middleware/adminAuth.js';
import { success, notFound, error, validationError } from '../../lib/response.js';
import mqtt from 'mqtt';
import { env } from '../../config/env.js';
import { randomUUID } from 'crypto';

export async function adminFiscalDevicesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireAdminAuth);

  // GET /v1/admin/fiscal-devices - List registered devices
  fastify.get('/v1/admin/fiscal-devices', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);

    const rows = await db
      .select()
      .from(fiscalDevices)
      .where(eq(fiscalDevices.companyId, companyId))
      .orderBy(desc(fiscalDevices.isPrimary), desc(fiscalDevices.id));

    return success(reply, rows, 'Fiscal devices retrieved');
  });

  // POST /v1/admin/fiscal-devices - Register fiscal device
  fastify.post('/v1/admin/fiscal-devices', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);
    const body = req.body as any;

    if (!body.deviceId || !body.name) {
      return validationError(reply, {
        deviceId: !body.deviceId ? 'deviceId (e.g. SBR-C5N34S) is required' : '',
        name: !body.name ? 'name is required' : '',
      });
    }

    const deviceId = String(body.deviceId).trim();
    const name = String(body.name).trim();
    const isPrimary = Boolean(body.isPrimary);

    try {
      // If marking as primary, unmark existing primary devices
      if (isPrimary) {
        await db
          .update(fiscalDevices)
          .set({ isPrimary: false })
          .where(eq(fiscalDevices.companyId, companyId));
      }

      const [inserted] = await db
        .insert(fiscalDevices)
        .values({
          companyId,
          deviceId,
          name,
          source: body.source || 'manual',
          kind: body.kind || 'device',
          isPrimary,
          isOnline: true,
          lastSeenAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [fiscalDevices.companyId, fiscalDevices.deviceId],
          set: {
            name,
            isPrimary,
            lastSeenAt: new Date(),
          },
        })
        .returning();

      return success(reply, inserted, 'Fiscal device registered', 201);
    } catch (err: any) {
      return error(reply, err.message || 'Failed to register fiscal device');
    }
  });

  // POST /v1/admin/fiscal-devices/:id/primary - Set device as primary
  fastify.post('/v1/admin/fiscal-devices/:id/primary', async (req, reply) => {
    const { id } = req.params as { id: string };
    const deviceRecordId = parseInt(id, 10);
    const companyId = getCompanyId(req);
    const db = getDatabase();

    await db
      .update(fiscalDevices)
      .set({ isPrimary: false })
      .where(eq(fiscalDevices.companyId, companyId));

    const [updated] = await db
      .update(fiscalDevices)
      .set({ isPrimary: true, lastSeenAt: new Date() })
      .where(and(eq(fiscalDevices.id, deviceRecordId), eq(fiscalDevices.companyId, companyId)))
      .returning();

    if (!updated) {
      return notFound(reply, 'Device not found');
    }

    return success(reply, updated, 'Device marked as primary');
  });

  // DELETE /v1/admin/fiscal-devices/:id - Delete device
  fastify.delete('/v1/admin/fiscal-devices/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const deviceRecordId = parseInt(id, 10);
    const companyId = getCompanyId(req);
    const db = getDatabase();

    const [deleted] = await db
      .delete(fiscalDevices)
      .where(and(eq(fiscalDevices.id, deviceRecordId), eq(fiscalDevices.companyId, companyId)))
      .returning();

    if (!deleted) {
      return notFound(reply, 'Device not found');
    }

    return success(reply, { id: deviceRecordId }, 'Device removed');
  });

  // GET /v1/admin/fiscal-devices/:id/status - Check live online/printer status via MQTT
  fastify.get('/v1/admin/fiscal-devices/:id/status', async (req, reply) => {
    const { id } = req.params as { id: string };
    const deviceRecordId = parseInt(id, 10);
    const companyId = getCompanyId(req);
    const db = getDatabase();

    const [device] = await db
      .select()
      .from(fiscalDevices)
      .where(and(eq(fiscalDevices.id, deviceRecordId), eq(fiscalDevices.companyId, companyId)))
      .limit(1);

    if (!device) {
      return notFound(reply, 'Fiscal device not found');
    }

    // Ping device via MQTT
    const displayId = device.deviceId;
    const commandTopic = `rycos/${displayId}/command`;
    const responseTopic = `rycos/${displayId}/response`;
    const commandId = randomUUID();

    try {
      const statusResult = await new Promise<any>((resolve, reject) => {
        const client = mqtt.connect({
          host: 'rycos.eu',
          port: 8883,
          protocol: 'mqtts',
          username: 'rycos_portal',
          password: 'PortalTest123',
          clientId: `status-check-${randomUUID().slice(0, 8)}`,
          clean: true,
          connectTimeout: 5000,
          reconnectPeriod: 0,
        });

        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          client.end(true);
          resolve({ online: false, error: 'Device response timeout' });
        }, 4000);

        client.on('error', (err: any) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          client.end(true);
          resolve({ online: false, error: err.message });
        });

        client.on('connect', () => {
          client.subscribe(responseTopic, { qos: 1 }, (subErr: any) => {
            if (subErr) {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              client.end(true);
              return resolve({ online: false, error: subErr.message });
            }

            client.publish(
              commandTopic,
              JSON.stringify({
                id: commandId,
                t_sent: Date.now(),
                action: '/printer/status',
                method: 'GET',
                payload: {},
              }),
              { qos: 1 }
            );
          });
        });

        client.on('message', (topic: string, message: Buffer) => {
          if (topic !== responseTopic) return;
          try {
            const data = JSON.parse(message.toString());
            if (data.id !== commandId) return;
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            client.end(true);
            resolve({ online: true, status: data.status, details: data.result });
          } catch (e: any) {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            client.end(true);
            resolve({ online: false, error: e.message });
          }
        });
      });

      return success(reply, {
        deviceId: displayId,
        name: device.name,
        isPrimary: device.isPrimary,
        ...statusResult,
      });
    } catch (err: any) {
      return success(reply, {
        deviceId: displayId,
        online: false,
        error: err.message,
      });
    }
  });
}
