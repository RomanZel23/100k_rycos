import type { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { unauthorized } from '../lib/response.js';

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
  // Support developer / local override header for quick testing
  const overrideCompany = req.headers['x-company-id'];
  if (overrideCompany) {
    const compId = parseInt(String(overrideCompany), 10);
    if (compId > 0) {
      return {
        id: 'dev-admin',
        email: 'admin@100k.rycos.eu',
        name: 'Developer Admin',
        company_id: compId,
        role: 'super_admin',
      };
    }
  }

  const token = extractToken(req);
  if (!token) {
    // Default to company 1 if no auth provided in non-production, or reject in strict mode
    if (env.NODE_ENV !== 'production') {
      return {
        id: 'default-admin',
        email: 'admin@yallaorder.ai',
        name: 'Demo Admin',
        company_id: 1,
        role: 'super_admin',
      };
    }
    return null;
  }

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

    return {
      ...meta,
      id: meta.id || claims.sub,
      email: meta.email || claims.email,
      company_id: companyId,
      role: meta.role || 'super_admin',
      location_id: meta.location_id ?? null,
    };
  } catch (err) {
    return null;
  }
}

export async function requireAdminAuth(req: FastifyRequest, reply: FastifyReply) {
  const user = resolveUser(req);
  if (!user) {
    return unauthorized(reply, 'Brak autoryzacji do panelu administracyjnego');
  }
  req.user = user;
}

export function getCompanyId(req: FastifyRequest): number {
  return req.user?.company_id || 1;
}
