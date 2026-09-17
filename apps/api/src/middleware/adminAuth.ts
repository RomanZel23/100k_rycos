import type { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { unauthorized, forbidden } from '../lib/response.js';

export interface AuthUser {
  id?: string;
  email?: string;
  name?: string;
  company_id: number;
  role?: string;
  location_id?: number | null;
  [key: string]: unknown;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

function extractToken(req: FastifyRequest): string | null {
  const header = req.headers['authorization'];
  if (!header || Array.isArray(header)) return null;
  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  return parts[1];
}

export function resolveUser(req: FastifyRequest): AuthUser | null {
  const token = extractToken(req);

  // If token is provided, verify and resolve the authenticated user
  if (token) {
    try {
      let claims: any;
      if (env.SUPABASE_JWT_SECRET) {
        claims = jwt.verify(token, env.SUPABASE_JWT_SECRET, { algorithms: ['HS256'] });
      } else {
        claims = jwt.decode(token);
        if (!claims) return null;
        if (typeof claims.exp === 'number' && claims.exp < Math.floor(Date.now() / 1000)) {
          return null;
        }
      }

      const meta = claims.user_metadata || {};
      const companyId = parseInt(String(meta.company_id || claims.company_id || 1), 10);
      const email = String(meta.email || claims.email || '').toLowerCase().trim();
      let role = String(meta.role || claims.role || 'admin').toLowerCase().trim();

      // Explicit platform admin guarantee for SolutionsBay operators
      if (email === 'roman.zeleznik@solutionsbay.pl' || email === 'admin@100k-rycos.eu' || email === 'admin@rycos.eu') {
        role = 'platform_admin';
      }

      return {
        ...meta,
        id: meta.id || claims.sub,
        email,
        company_id: companyId,
        role,
        location_id: meta.location_id ?? null,
      };
    } catch (err) {
      // Fall through to non-prod fallback if in dev
    }
  }

  // Developer / local fallback ONLY when no valid token was provided in non-production
  if (env.NODE_ENV !== 'production') {
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

export async function requireAdminAuth(req: FastifyRequest, reply: FastifyReply) {
  const user = resolveUser(req);
  if (!user) {
    return unauthorized(reply, 'Brak autoryzacji do panelu administracyjnego');
  }
  req.user = user;
}

export function isPlatformAdmin(user: AuthUser | null): boolean {
  if (!user) return false;
  const role = String(user.role || '').toLowerCase().trim();
  const email = String(user.email || '').toLowerCase().trim();
  if (role === 'platform_admin') return true;
  if (user.company_id === 1 && (role === 'super_admin' || role === 'platform_admin')) return true;
  if (email === 'roman.zeleznik@solutionsbay.pl' || email === 'admin@100k-rycos.eu' || email === 'admin@rycos.eu') return true;
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
  return user?.company_id || 1;
}

export function getAuthUser(req: FastifyRequest): AuthUser | null {
  return req.user || resolveUser(req);
}
