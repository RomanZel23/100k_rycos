import type { FastifyInstance } from 'fastify';
import { getDatabase, fiscalDevices, terminals, terminalFiscalDevices, eq, and, desc, inArray } from '@rycos/database';
import { requireAdminAuth, getCompanyId } from '../../middleware/adminAuth.js';
import { success, notFound, error, validationError } from '../../lib/response.js';
import mqtt from 'mqtt';
import { env } from '../../config/env.js';
import { randomUUID } from 'crypto';

export async function adminFiscalDevicesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireAdminAuth);

  // GET /v1/admin/fiscal-devices - List registered devices with their terminals
  fastify.get('/v1/admin/fiscal-devices', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);

    const devices = await db
      .select()
      .from(fiscalDevices)
      .where(eq(fiscalDevices.companyId, companyId))
      .orderBy(desc(fiscalDevices.isPrimary), desc(fiscalDevices.id));

    const terms = await db
      .select()
      .from(terminals)
      .where(and(eq(terminals.companyId, companyId), eq(terminals.status, 'active')))
      .orderBy(terminals.name);

    const edges = devices.length > 0
      ? await db
          .select()
          .from(terminalFiscalDevices)
          .where(inArray(terminalFiscalDevices.fiscalDeviceId, devices.map((d) => d.id)))
      : [];

    const termMap = new Map(
      terms.map((t) => [
        t.id,
        { id: t.id, name: t.name, terminal_id: t.terminalId, terminalId: t.terminalId },
      ])
    );
    const assignedIds = new Set<number>();
    const termsByDevice: Record<number, Array<{ id: number; name: string; terminal_id: string; terminalId: string }>> = {};

    for (const e of edges) {
      const t = termMap.get(e.terminalId);
      if (!t) continue;
      (termsByDevice[e.fiscalDeviceId] ??= []).push(t);
      assignedIds.add(e.terminalId);
    }

    const mappedDevices = devices.map((d) => ({
      id: d.id,
      name: d.name,
      deviceId: d.deviceId,
      device_id: d.deviceId,
      status: d.status || 'active',
      isPrimary: d.isPrimary,
      is_primary: d.isPrimary,
      source: (d.source as any) || 'manual',
      kind: (d.kind as any) || 'device',
      tier: null,
      online: d.isOnline,
      is_online: d.isOnline,
      isOnline: d.isOnline,
      aplikasa_installed: null,
      terminals: termsByDevice[d.id] ?? [],
      lastSeenAt: d.lastSeenAt,
      last_seen_at: d.lastSeenAt ? d.lastSeenAt.toISOString() : null,
      license_expires_at: null,
      createdAt: d.createdAt,
      created_at: d.createdAt,
    }));

    const unassigned = terms
      .filter((t) => !assignedIds.has(t.id))
      .map((t) => ({
        id: t.id,
        name: t.name,
        terminalId: t.terminalId,
        terminal_id: t.terminalId,
      }));

    return success(reply, { devices: mappedDevices, unassigned }, 'Fiscal devices retrieved');
  });

  // POST /v1/admin/fiscal-devices - Register fiscal device
  fastify.post('/v1/admin/fiscal-devices', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);
    const body = req.body as any;

    const deviceId = String(body.deviceId || body.device_id || '').trim();
    const name = String(body.name || '').trim();
    const isPrimary = Boolean(body.isPrimary || body.is_primary);

    if (!deviceId || !name) {
      return validationError(reply, {
        deviceId: !deviceId ? 'deviceId (e.g. SBR-C5N34S) is required' : '',
        name: !name ? 'name is required' : '',
      });
    }

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
          status: 'active',
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
            status: 'active',
            isPrimary,
            lastSeenAt: new Date(),
          },
        })
        .returning();

      return success(
        reply,
        {
          ...inserted,
          device_id: inserted.deviceId,
          is_primary: inserted.isPrimary,
          terminals: [],
        },
        'Fiscal device registered',
        201
      );
    } catch (err: any) {
      return error(reply, err.message || 'Failed to register fiscal device');
    }
  });

  // PUT /v1/admin/fiscal-devices/:id - Update fiscal device (status, name, device_id)
  fastify.put('/v1/admin/fiscal-devices/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const deviceRecordId = parseInt(id, 10);
    const companyId = getCompanyId(req);
    const body = (req.body ?? {}) as any;
    const db = getDatabase();

    const updateData: Record<string, any> = {};
    if (body.name !== undefined) updateData.name = String(body.name).trim();
    if (body.deviceId !== undefined || body.device_id !== undefined) {
      updateData.deviceId = String(body.deviceId || body.device_id).trim();
    }
    if (body.status !== undefined && ['active', 'inactive'].includes(body.status)) {
      updateData.status = body.status;
    }

    if (Object.keys(updateData).length === 0) {
      return validationError(reply, { message: 'Nothing to update' });
    }

    const [updated] = await db
      .update(fiscalDevices)
      .set(updateData)
      .where(and(eq(fiscalDevices.id, deviceRecordId), eq(fiscalDevices.companyId, companyId)))
      .returning();

    if (!updated) {
      return notFound(reply, 'Fiscal device not found');
    }

    return success(
      reply,
      {
        ...updated,
        device_id: updated.deviceId,
        is_primary: updated.isPrimary,
      },
      'Fiscal device updated'
    );
  });

  // PUT /v1/admin/fiscal-devices/:id/terminals - Replace terminal bindings
  fastify.put('/v1/admin/fiscal-devices/:id/terminals', async (req, reply) => {
    const { id } = req.params as { id: string };
    const deviceRecordId = parseInt(id, 10);
    const companyId = getCompanyId(req);
    const body = (req.body ?? {}) as any;
    const db = getDatabase();

    const rawList = Array.isArray(body.terminal_ids)
      ? body.terminal_ids
      : Array.isArray(body.terminalIds)
      ? body.terminalIds
      : [];
    const targetIds: number[] = rawList.map((x: any) => parseInt(String(x), 10)).filter(Number.isFinite);

    const [device] = await db
      .select()
      .from(fiscalDevices)
      .where(and(eq(fiscalDevices.id, deviceRecordId), eq(fiscalDevices.companyId, companyId)))
      .limit(1);

    if (!device) {
      return notFound(reply, 'Fiscal device not found');
    }

    // Delete existing terminalFiscalDevices for this device
    await db
      .delete(terminalFiscalDevices)
      .where(eq(terminalFiscalDevices.fiscalDeviceId, deviceRecordId));

    // Insert new bindings
    if (targetIds.length > 0) {
      await db
        .insert(terminalFiscalDevices)
        .values(
          targetIds.map((tid: number, idx: number) => ({
            terminalId: tid,
            fiscalDeviceId: deviceRecordId,
            position: idx,
          }))
        )
        .onConflictDoNothing();
    }

    return success(reply, { assigned: targetIds.length }, 'Terminal assignments updated');
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

    return success(
      reply,
      {
        ...updated,
        device_id: updated.deviceId,
        is_primary: updated.isPrimary,
      },
      'Device marked as primary'
    );
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
