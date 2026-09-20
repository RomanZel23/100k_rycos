import type { FastifyInstance } from 'fastify';
import {
  getDatabase,
  locations,
  brands,
  terminals,
  fiscalDevices,
  companySettings,
  eq,
  and,
  ne,
} from '@rycos/database';
import { requireAdminAuth, getCompanyId, getAuthUser, invalidateTerminalCache } from '../../middleware/adminAuth.js';
import { success, error, forbidden, validationError } from '../../lib/response.js';
import { invalidateBrandMenuCache } from '../../services/catalogService.js';
import { broadcastToStaff } from '../../plugins/websocket.js';

/**
 * Graphical structure editor backend.
 * GET returns everything the editor draws; PUT saves the whole graph in ONE transaction.
 * Node positions are stored in company_settings (feature_key = 'structure_layout').
 */

const LAYOUT_KEY = 'structure_layout';
/** A terminal is "online" when its heartbeat (every 30 s) arrived within this window. */
export const TERMINAL_ONLINE_MS = 90_000;
const VALID_ROLES = ['all_in_one', 'pos', 'kds', 'pickup', 'kiosk', 'fiscal_hub'] as const;
type Role = (typeof VALID_ROLES)[number];

const ROLE_CAPABILITIES: Record<Role, Record<string, boolean>> = {
  all_in_one: { can_sell: true, can_kds: true, can_pickup: true, has_softpos: true, has_printer: true },
  pos: { can_sell: true, can_kds: false, can_pickup: true, has_softpos: true, has_printer: true },
  kds: { can_sell: false, can_kds: true, can_pickup: true, has_softpos: false, has_printer: false },
  pickup: { can_sell: false, can_kds: false, can_pickup: true, has_softpos: false, has_printer: false },
  kiosk: { can_sell: true, can_kds: false, can_pickup: false, has_softpos: false, has_printer: false },
  fiscal_hub: { can_sell: false, can_kds: false, can_pickup: false, has_softpos: false, has_printer: false },
};

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function randomCode(): string {
  let code = '';
  for (let i = 0; i < 8; i++) code += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
  return code;
}

const cleanTables = (v: unknown): string[] =>
  Array.isArray(v) ? Array.from(new Set(v.map((x) => String(x).trim()).filter(Boolean))).slice(0, 500).map((x) => x.slice(0, 32)) : [];

/** Location reference in a PUT payload: existing id, "new:<tempId>", or null. */
type LocationRef = number | string | null;

interface StructurePut {
  layout?: unknown;
  new_locations?: Array<{ temp_id: string; name: string; tables?: string[] }>;
  locations?: Array<{ id: number; name?: string; tables?: string[] }>;
  /** tables: own table list of the brand; null = use the location's tables; undefined = unchanged */
  brands?: Array<{ id: number; location_ref?: LocationRef; tables?: string[] | null }>;
  new_terminals?: Array<{ temp_id: string; name: string; role: string }>;
  terminals?: Array<{
    ref: number | string; // existing terminal id, or "new:<tempId>"
    name?: string;
    role?: string;
    location_ref?: LocationRef;
    assigned_brand_ids?: number[];
    printer_device_id?: string | null;
    tap_device_id?: string | null;
    fiscal_device_id?: string | null;
  }>;
}

function isManagerRole(role: string | undefined, isTerminal: boolean): boolean {
  if (isTerminal) return false;
  const r = String(role || '').toLowerCase();
  return !['staff', 'kitchen', 'cashier', 'waiter'].includes(r);
}

async function loadStructure(companyId: number) {
  const db = getDatabase();
  const [locRows, brandRows, termRows, devRows, layoutRows] = await Promise.all([
    db.select({ id: locations.id, name: locations.name, isActive: locations.isActive, tables: locations.tables }).from(locations).where(eq(locations.companyId, companyId)).orderBy(locations.id),
    db.select({ id: brands.id, name: brands.name, slug: brands.slug, locationId: brands.locationId, isActive: brands.isActive, tables: brands.tables }).from(brands).where(eq(brands.companyId, companyId)).orderBy(brands.id),
    db.select().from(terminals).where(and(eq(terminals.companyId, companyId), ne(terminals.status, 'archived'))).orderBy(terminals.id),
    db.select().from(fiscalDevices).where(eq(fiscalDevices.companyId, companyId)).orderBy(fiscalDevices.id),
    db.select({ config: companySettings.config }).from(companySettings)
      .where(and(eq(companySettings.companyId, companyId), eq(companySettings.featureKey, LAYOUT_KEY))).limit(1),
  ]);

  return {
    locations: locRows.map((l) => ({ id: l.id, name: l.name, is_active: l.isActive, tables: l.tables || [] })),
    brands: brandRows.map((b) => ({ id: b.id, name: b.name, slug: b.slug, location_id: b.locationId, is_active: b.isActive, tables: b.tables && b.tables.length ? b.tables : null })),
    terminals: termRows.map((t) => ({
      id: t.id,
      terminal_id: t.terminalId,
      name: t.name,
      role: t.role,
      status: t.status,
      location_id: t.locationId,
      assigned_brand_ids: t.assignedBrandIds || [],
      printer_device_id: t.printerDeviceId,
      tap_device_id: t.tapDeviceId,
      fiscal_device_id: t.fiscalDeviceId,
      is_hardware: t.terminalId.startsWith('SBR-') || t.terminalId.startsWith('SBT-'),
      last_active: t.lastActiveAt ? t.lastActiveAt.toISOString() : null,
    })),
    fiscal_devices: devRows.map((d) => ({
      id: d.id,
      device_id: d.deviceId,
      name: d.name,
      kind: d.kind,
      source: d.source,
      status: d.status,
      is_primary: d.isPrimary,
      is_online: d.isOnline,
      last_seen: d.lastSeenAt ? d.lastSeenAt.toISOString() : null,
    })),
    layout: (layoutRows[0]?.config as Record<string, unknown> | null) ?? null,
  };
}

export async function adminStructureRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireAdminAuth);

  // GET /v1/admin/structure
  fastify.get('/v1/admin/structure', async (req, reply) => {
    const companyId = getCompanyId(req);
    return success(reply, await loadStructure(companyId), 'Structure retrieved');
  });

  // GET /v1/admin/structure/status — lightweight live status for the editor (polled every ~20 s)
  fastify.get('/v1/admin/structure/status', async (req, reply) => {
    const companyId = getCompanyId(req);
    const db = getDatabase();
    const [termRows, devRows] = await Promise.all([
      db.select({ id: terminals.id, status: terminals.status, lastActiveAt: terminals.lastActiveAt })
        .from(terminals).where(and(eq(terminals.companyId, companyId), ne(terminals.status, 'archived'))),
      db.select({ deviceId: fiscalDevices.deviceId, isOnline: fiscalDevices.isOnline, lastSeenAt: fiscalDevices.lastSeenAt })
        .from(fiscalDevices).where(eq(fiscalDevices.companyId, companyId)),
    ]);
    const now = Date.now();
    return success(reply, {
      server_time: new Date(now).toISOString(),
      terminals: Object.fromEntries(termRows.map((t) => [t.id, {
        status: t.status,
        last_active: t.lastActiveAt ? t.lastActiveAt.toISOString() : null,
        online: !!t.lastActiveAt && now - t.lastActiveAt.getTime() < TERMINAL_ONLINE_MS,
      }])),
      devices: Object.fromEntries(devRows.map((d) => [d.deviceId, {
        online: d.isOnline,
        last_seen: d.lastSeenAt ? d.lastSeenAt.toISOString() : null,
      }])),
    });
  });

  // PUT /v1/admin/structure — save the whole graph atomically
  fastify.put('/v1/admin/structure', async (req, reply) => {
    const user = getAuthUser(req);
    if (!isManagerRole(user?.role, !!user?.terminal_id)) {
      return forbidden(reply, 'Tylko administrator lub menedżer może zmieniać strukturę lokalu');
    }
    const companyId = getCompanyId(req);
    const body = (req.body ?? {}) as StructurePut;
    const db = getDatabase();

    // Layout is only presentation — keep it bounded
    if (body.layout !== undefined && JSON.stringify(body.layout).length > 300_000) {
      return validationError(reply, { layout: 'Układ schematu jest zbyt duży' });
    }

    const current = await loadStructure(companyId);
    const locIds = new Set(current.locations.map((l) => l.id));
    const brandIds = new Set(current.brands.map((b) => b.id));
    const termById = new Map(current.terminals.map((t) => [t.id, t]));
    const newLocTemp = new Set((body.new_locations || []).map((l) => String(l.temp_id)));
    const newTermTemp = new Set((body.new_terminals || []).map((t) => String(t.temp_id)));

    const errors: Record<string, string> = {};
    const checkLocRef = (ref: LocationRef | undefined, where: string) => {
      if (ref === undefined || ref === null) return;
      if (typeof ref === 'number' && locIds.has(ref)) return;
      if (typeof ref === 'string' && ref.startsWith('new:') && newLocTemp.has(ref.slice(4))) return;
      errors[where] = `Nieznana lokalizacja: ${ref}`;
    };

    for (const l of body.new_locations || []) {
      if (!String(l.name || '').trim()) errors[`new_location:${l.temp_id}`] = 'Nazwa lokalizacji jest wymagana';
    }
    for (const l of body.locations || []) {
      if (!locIds.has(l.id)) errors[`location:${l.id}`] = 'Lokalizacja nie należy do firmy';
      if (l.name !== undefined && !String(l.name).trim()) errors[`location:${l.id}`] = 'Nazwa lokalizacji jest wymagana';
    }
    for (const b of body.brands || []) {
      if (!brandIds.has(b.id)) errors[`brand:${b.id}`] = 'Marka nie należy do firmy';
      checkLocRef(b.location_ref, `brand:${b.id}`);
    }
    for (const t of body.new_terminals || []) {
      if (!String(t.name || '').trim()) errors[`new_terminal:${t.temp_id}`] = 'Nazwa stanowiska jest wymagana';
      if (!VALID_ROLES.includes(t.role as Role)) errors[`new_terminal:${t.temp_id}`] = `Nieznana rola: ${t.role}`;
    }

    // Device references a terminal may point to: company fiscal devices, company terminals (SBR), 'self'
    const allowedDevices = new Set<string>([
      'self',
      ...current.fiscal_devices.map((d) => d.device_id),
      ...current.terminals.map((t) => t.terminal_id),
    ]);

    for (const t of body.terminals || []) {
      const key = `terminal:${t.ref}`;
      const existing = typeof t.ref === 'number' ? termById.get(t.ref) : undefined;
      if (typeof t.ref === 'number' && !existing) { errors[key] = 'Stanowisko nie należy do firmy'; continue; }
      if (typeof t.ref === 'string' && !(t.ref.startsWith('new:') && newTermTemp.has(t.ref.slice(4)))) { errors[key] = 'Nieznane nowe stanowisko'; continue; }
      if (t.role !== undefined && !VALID_ROLES.includes(t.role as Role)) errors[key] = `Nieznana rola: ${t.role}`;
      if (t.name !== undefined && !String(t.name).trim()) errors[key] = 'Nazwa stanowiska jest wymagana';
      checkLocRef(t.location_ref, key);
      for (const bid of t.assigned_brand_ids || []) {
        if (!brandIds.has(bid)) errors[key] = `Marka ${bid} nie należy do firmy`;
      }
      for (const field of ['printer_device_id', 'tap_device_id', 'fiscal_device_id'] as const) {
        const v = t[field];
        if (v === undefined || v === null || v === '') continue;
        const unchanged = existing && existing[field] === v;
        if (!unchanged && !allowedDevices.has(v) && !(v.startsWith('new:') && newTermTemp.has(v.slice(4)))) {
          errors[key] = `Urządzenie ${v} nie należy do firmy`;
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      return validationError(reply, errors, 'Nie można zapisać struktury — popraw zaznaczone elementy');
    }

    try {
      const idMap = await db.transaction(async (tx) => {
        const locMap = new Map<string, number>();
        const termMap = new Map<string, { id: number; terminalId: string }>();

        for (const l of body.new_locations || []) {
          const [row] = await tx
            .insert(locations)
            .values({
              companyId,
              name: String(l.name).trim(),
              isActive: true,
              ...(l.tables && cleanTables(l.tables).length ? { tables: cleanTables(l.tables) } : {}),
            })
            .returning({ id: locations.id });
          locMap.set(String(l.temp_id), row.id);
        }
        const resolveLoc = (ref: LocationRef | undefined): number | null | undefined => {
          if (ref === undefined) return undefined;
          if (ref === null) return null;
          if (typeof ref === 'number') return ref;
          return locMap.get(ref.slice(4)) ?? null;
        };

        for (const l of body.locations || []) {
          const set: Record<string, unknown> = {};
          if (l.name !== undefined) set.name = String(l.name).trim();
          if (l.tables !== undefined) set.tables = cleanTables(l.tables);
          if (Object.keys(set).length) {
            await tx.update(locations).set(set)
              .where(and(eq(locations.id, l.id), eq(locations.companyId, companyId)));
          }
        }

        for (const b of body.brands || []) {
          const set: Record<string, unknown> = {};
          const loc = resolveLoc(b.location_ref);
          if (loc !== undefined) set.locationId = loc;
          if (b.tables !== undefined) {
            const t = b.tables === null ? [] : cleanTables(b.tables);
            set.tables = t.length ? t : null;
          }
          if (!Object.keys(set).length) continue;
          await tx.update(brands).set(set)
            .where(and(eq(brands.id, b.id), eq(brands.companyId, companyId)));
        }

        // New terminals first (other terminals may reference them as devices)
        const takenCodes = new Set(current.terminals.map((t) => t.terminal_id));
        for (const t of body.new_terminals || []) {
          let code = randomCode();
          for (let i = 0; i < 10 && takenCodes.has(code); i++) code = randomCode();
          const clash = await tx.select({ id: terminals.id }).from(terminals).where(eq(terminals.terminalId, code)).limit(1);
          if (clash.length) code = randomCode() + randomCode().slice(0, 2);
          takenCodes.add(code);
          const role = t.role as Role;
          const [row] = await tx
            .insert(terminals)
            .values({
              companyId,
              terminalId: code,
              name: String(t.name).trim(),
              role,
              capabilities: ROLE_CAPABILITIES[role],
              status: 'unclaimed',
            })
            .returning({ id: terminals.id, terminalId: terminals.terminalId });
          termMap.set(String(t.temp_id), row);
        }

        const resolveDevice = (v: string | null | undefined): string | null | undefined => {
          if (v === undefined) return undefined;
          if (v === null || v === '') return null;
          if (v.startsWith('new:')) return termMap.get(v.slice(4))?.terminalId ?? null;
          return v;
        };

        for (const t of body.terminals || []) {
          const id = typeof t.ref === 'number' ? t.ref : termMap.get(String(t.ref).slice(4))?.id;
          if (!id) continue;
          const set: Record<string, unknown> = {};
          if (t.name !== undefined) set.name = String(t.name).trim();
          if (t.role !== undefined) {
            set.role = t.role;
            const prev = typeof t.ref === 'number' ? termById.get(t.ref) : undefined;
            if (!prev || prev.role !== t.role) set.capabilities = ROLE_CAPABILITIES[t.role as Role];
          }
          const loc = resolveLoc(t.location_ref);
          if (loc !== undefined) set.locationId = loc;
          if (t.assigned_brand_ids !== undefined) set.assignedBrandIds = Array.from(new Set(t.assigned_brand_ids));
          const printer = resolveDevice(t.printer_device_id);
          const tap = resolveDevice(t.tap_device_id);
          const fiscal = resolveDevice(t.fiscal_device_id);
          if (printer !== undefined) set.printerDeviceId = printer;
          if (tap !== undefined) set.tapDeviceId = tap;
          if (fiscal !== undefined) set.fiscalDeviceId = fiscal;
          if (Object.keys(set).length === 0) continue;
          await tx.update(terminals).set(set).where(and(eq(terminals.id, id), eq(terminals.companyId, companyId)));
        }

        if (body.layout !== undefined) {
          // Replace temporary keys (term:new:<tmp>, loc:new:<tmp>) with the ids that were just created
          const lay = body.layout as { nodes?: Record<string, unknown>; frames?: Record<string, unknown> };
          const remap = (obj: Record<string, unknown> | undefined, prefix: 'term' | 'loc') => {
            if (!obj || typeof obj !== 'object') return obj;
            const out: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(obj)) {
              const m = k.match(new RegExp(`^${prefix}:new:(.+)$`));
              if (m) {
                const real = prefix === 'term' ? termMap.get(m[1])?.id : locMap.get(m[1]);
                out[real ? `${prefix}:${real}` : k] = v;
              } else out[k] = v;
            }
            return out;
          };
          if (lay && typeof lay === 'object') {
            if (lay.nodes) lay.nodes = remap(lay.nodes, 'term');
            if (lay.frames) lay.frames = remap(lay.frames, 'loc');
          }
          await tx
            .insert(companySettings)
            .values({ companyId, featureKey: LAYOUT_KEY, isEnabled: true, config: body.layout as Record<string, unknown> })
            .onConflictDoUpdate({
              target: [companySettings.companyId, companySettings.featureKey],
              set: { config: body.layout as Record<string, unknown>, updatedAt: new Date() },
            });
        }

        return {
          locations: Object.fromEntries(locMap),
          terminals: Object.fromEntries(Array.from(termMap.entries()).map(([k, v]) => [k, v.id])),
        };
      });

      invalidateTerminalCache();
      if ((body.brands || []).length) await invalidateBrandMenuCache();
      // Paired stations refresh their configuration right away (they also poll every 30 s)
      broadcastToStaff(companyId, {
        type: 'terminal.config_updated',
        timestamp: new Date().toISOString(),
        companyId,
        payload: { source: 'structure_editor' },
      }).catch(() => {});

      return success(reply, { ...(await loadStructure(companyId)), id_map: idMap }, 'Struktura zapisana');
    } catch (err: any) {
      console.error('[Structure] save failed:', err);
      return error(reply, err.message || 'Nie udało się zapisać struktury', 500);
    }
  });
}



