import type { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { env, getJwtSecret, getTerminalTokenSecret } from '../config/env.js';
import { unauthorized, forbidden } from '../lib/response.js';

export interface AuthUser {
  id?: string;
  email?: string;
  name?: string;
  company_id: number;
  role?: string;
  location_id?: number | null;
  terminal_id?: string;
  [key: string]: unknown;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

const PLATFORM_ADMIN_EMAILS = new Set(['roman.zeleznik@solutionsbay.pl', 'admin@100k-rycos.eu', 'admin@rycos.eu']);

function extractBearer(req: FastifyRequest): string | null {
  const header = req.headers['authorization'];
  if (!header || Array.isArray(header)) return null;
  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  return parts[1];
}

/**
 * Resolve an admin / staff user from a VERIFIED JWT.
 * Tokens are never accepted unverified. A token without a company is rejected
 * (except for platform admins).
 */
export function resolveUserFromToken(token: string | null | undefined): AuthUser | null {
  if (!token) return null;
  let claims: any;
  try {
    claims = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
  } catch {
    return null;
  }
  if (!claims || claims.typ === 'terminal') return null;

  const meta = claims.user_metadata || {};
  const email = String(meta.email || claims.email || '').toLowerCase().trim();
  let role = String(meta.role || claims.app_role || '').toLowerCase().trim();
  const rawCompany = meta.company_id ?? claims.company_id;
  let companyId = rawCompany !== undefined && rawCompany !== null ? parseInt(String(rawCompany), 10) : NaN;

  if (PLATFORM_ADMIN_EMAILS.has(email)) {
    role = 'platform_admin';
    if (!Number.isFinite(companyId) || companyId <= 0) companyId = 1;
  }

  if (!Number.isFinite(companyId) || companyId <= 0) return null;
  if (!role || role === 'authenticated') role = 'admin';

  return {
    ...meta,
    id: meta.id || claims.sub,
    email,
    company_id: companyId,
    role,
    location_id: meta.location_id ?? null,
  };
}

export function resolveUser(req: FastifyRequest): AuthUser | null {
  const user = resolveUserFromToken(extractBearer(req));
  if (user) return user;

  // Developer fallback ONLY outside production (Dockerfile sets NODE_ENV=production)
  if (env.NODE_ENV !== 'production' && !req.headers['x-terminal-token']) {
    const overrideCompany = req.headers['x-company-id'];
    const compId = overrideCompany ? parseInt(String(overrideCompany), 10) : 1;
    return {
      id: 'dev-admin',
      email: 'admin@100k.rycos.eu',
      name: 'Developer Admin',
      company_id: compId > 0 ? compId : 1,
      role: 'platform_admin',
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Terminal (POS / KDS / Pickup device) authentication
// ---------------------------------------------------------------------------

interface TerminalTokenClaims {
  typ: 'terminal';
  tid: string;
  cid: number;
  sv: number;
}

/** Issue a signed device token after a successful pairing. */
export function issueTerminalToken(terminal: { terminalId: string; companyId: number; sessionVersion: number }): string {
  const claims: TerminalTokenClaims = {
    typ: 'terminal',
    tid: terminal.terminalId,
    cid: terminal.companyId,
    sv: terminal.sessionVersion,
  };
  return jwt.sign(claims, getTerminalTokenSecret(), { algorithm: 'HS256', expiresIn: '365d' });
}

const terminalCache = new Map<string, { user: AuthUser | null; expires: number }>();

export async function resolveTerminalFromToken(token: string | null | undefined): Promise<AuthUser | null> {
  if (!token) return null;
  let claims: TerminalTokenClaims;
  try {
    claims = jwt.verify(token, getTerminalTokenSecret(), { algorithms: ['HS256'] }) as TerminalTokenClaims;
  } catch {
    return null;
  }
  if (!claims || claims.typ !== 'terminal' || !claims.tid || !claims.cid) return null;

  const cacheKey = `${claims.tid}:${claims.cid}:${claims.sv}`;
  const cached = terminalCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.user;

  let user: AuthUser | null = null;
  try {
    const { getDatabase, terminals, eq, and } = await import('@rycos/database');
    const db = getDatabase();
    const [term] = await db
      .select()
      .from(terminals)
      .where(and(eq(terminals.terminalId, claims.tid), eq(terminals.companyId, claims.cid)))
      .limit(1);

    if (term && term.status === 'active' && (term.sessionVersion ?? 0) === claims.sv) {
      user = {
        id: `terminal-${term.terminalId}`,
        name: term.name,
        company_id: term.companyId,
        location_id: term.locationId,
        role: 'staff',
        terminal_role: term.role,
        terminal_id: term.terminalId,
      };
    }
  } catch (err) {
    console.error('Failed to resolve terminal token:', err);
    return null;
  }

  terminalCache.set(cacheKey, { user, expires: Date.now() + 15_000 });
  if (terminalCache.size > 5000) terminalCache.clear();
  return user;
}

export function invalidateTerminalCache() {
  terminalCache.clear();
}

export async function resolveTerminalUser(req: FastifyRequest): Promise<AuthUser | null> {
  const headerToken = req.headers['x-terminal-token'];
  const token = typeof headerToken === 'string' ? headerToken : extractBearer(req);
  return resolveTerminalFromToken(token);
}

/** Resolve any authenticated principal (admin JWT or paired terminal) without replying. */
export async function resolveAnyPrincipal(req: FastifyRequest): Promise<AuthUser | null> {
  if (req.headers['x-terminal-token']) {
    return resolveTerminalUser(req);
  }
  return resolveUser(req) || (await resolveTerminalUser(req));
}

// Admin API prefixes a paired terminal (POS/KDS/Pickup) is allowed to call.
const TERMINAL_ALLOWED_ADMIN_PREFIXES = ['/v1/admin/orders', '/v1/admin/terminals/check'];

/** Admin panel routes: admin JWT; terminals only for the order-handling endpoints. */
export async function requireAdminAuth(req: FastifyRequest, reply: FastifyReply) {
  const user = await resolveAnyPrincipal(req);
  if (!user) {
    return unauthorized(reply, 'Brak autoryzacji do panelu administracyjnego');
  }
  if (user.terminal_id) {
    const url = req.url.split('?')[0];
    if (!TERMINAL_ALLOWED_ADMIN_PREFIXES.some((p) => url.startsWith(p))) {
      return forbidden(reply, 'Stanowisko (terminal) nie ma dostępu do tej sekcji panelu');
    }
  }
  req.user = user;
}

/** Staff / device routes (POS payments, printing): admin JWT or paired terminal. */
export async function requireStaffAuth(req: FastifyRequest, reply: FastifyReply) {
  const user = await resolveAnyPrincipal(req);
  if (!user) {
    return unauthorized(reply, 'Brak autoryzacji stanowiska. Sparuj urządzenie ponownie.');
  }
  req.user = user;
}

const PRIVILEGED_ROLES = new Set(['platform_admin', 'super_admin']);

/** Only platform admins may grant platform-level roles. */
export function canAssignRole(actor: AuthUser | null, role: string | undefined | null): boolean {
  if (!role) return true;
  const r = String(role).toLowerCase().trim();
  if (!PRIVILEGED_ROLES.has(r)) return true;
  return isPlatformAdmin(actor);
}

export function isPlatformAdmin(user: AuthUser | null): boolean {
  if (!user || user.terminal_id) return false;
  const role = String(user.role || '').toLowerCase().trim();
  const email = String(user.email || '').toLowerCase().trim();
  if (role === 'platform_admin') return true;
  if (user.company_id === 1 && role === 'super_admin') return true;
  if (PLATFORM_ADMIN_EMAILS.has(email)) return true;
  return false;
}

export async function requirePlatformAdmin(req: FastifyRequest, reply: FastifyReply) {
  const user = resolveUser(req);
  if (!user) {
    return unauthorized(reply, 'Brak autoryzacji do panelu administracyjnego');
  }
  req.user = user;

  if (!isPlatformAdmin(user)) {
    return forbidden(reply, 'Dostęp zabroniony. Ta sekcja wymaga uprawnień Platform Admin (Operator Platformy)');
  }
}

/**
 * Company scope of the current request. Only platform admins may switch company via X-Company-Id.
 * Returns 0 when there is no authenticated principal (matches no rows).
 */
export function getCompanyId(req: FastifyRequest): number {
  const user = req.user || resolveUser(req);
  if (user && isPlatformAdmin(user)) {
    const overrideHeader = req.headers['x-company-id'];
    if (overrideHeader) {
      const parsed = parseInt(String(overrideHeader), 10);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }
  }
  return user?.company_id || 0;
}

export function getAuthUser(req: FastifyRequest): AuthUser | null {
  return req.user || resolveUser(req);
}
