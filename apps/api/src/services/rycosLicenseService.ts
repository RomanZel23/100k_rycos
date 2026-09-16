import { env } from '../config/env.js';
import { getDatabase, companies, eq } from '@rycos/database';

export interface RycosServerLicenseStatus {
  checked: boolean;
  configured: boolean;
  solution?: string;
  instance?: string;
  client?: string;
  status?: 'active' | 'grace' | 'expired' | 'suspended' | 'revoked' | 'unconfigured' | string;
  valid_until?: string | null;
  grace_days?: number;
  days_left?: number | null;
  fiscal?: {
    seats: number;
    expires_at: string | null;
  };
  checked_at?: string;
  token_hint?: string;
  error?: string | null;
}

class RycosLicenseService {
  private cacheByCompanyId = new Map<number, RycosServerLicenseStatus>();
  private defaultStatus: RycosServerLicenseStatus | null = null;
  private timer: NodeJS.Timeout | null = null;

  private get baseUrl(): string {
    return (env.RYCOS_PORTAL_URL || 'https://portal.rycos.eu').replace(/\/+$/, '');
  }

  private get globalToken(): string {
    return env.RYCOS_LICENSE_TOKEN || env.RYCOS_SOLUTION_TOKEN || '';
  }

  /**
   * Check heartbeat for a specific token or company
   */
  public async checkHeartbeat(params: {
    companyId?: number;
    token?: string | null;
    instanceName?: string;
    extraStats?: Record<string, unknown>;
  } = {}): Promise<RycosServerLicenseStatus> {
    const rawToken = (params.token || '').trim() || this.globalToken;
    const instanceName = params.instanceName || '100k-rycos';

    if (!rawToken) {
      const unconf: RycosServerLicenseStatus = {
        checked: true,
        configured: false,
        status: 'unconfigured',
        error: 'Brak przypisanego tokenu licencji serwerowej.',
        checked_at: new Date().toISOString(),
      };
      if (params.companyId) {
        this.cacheByCompanyId.set(params.companyId, unconf);
      }
      return unconf;
    }

    try {
      const payload = {
        version: '100k-v1.0.0',
        stats: {
          instance_name: instanceName,
          company_id: params.companyId || null,
          uptime_seconds: Math.floor(process.uptime()),
          memory_usage_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          timestamp: new Date().toISOString(),
          ...(params.extraStats || {}),
        },
      };

      const res = await fetch(`${this.baseUrl}/api/v2/solution/heartbeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${rawToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string };
        const failStatus: RycosServerLicenseStatus = {
          checked: true,
          configured: true,
          token_hint: rawToken.slice(-4),
          status: res.status === 401 ? 'revoked' : 'error',
          error: errorData.error || `HTTP ${res.status}`,
          checked_at: new Date().toISOString(),
        };

        if (params.companyId) {
          this.cacheByCompanyId.set(params.companyId, failStatus);
          await this.updateCompanyDbStatus(params.companyId, failStatus.status || 'error', null);
        }
        return failStatus;
      }

      const data = (await res.json()) as any;
      const successStatus: RycosServerLicenseStatus = {
        ...data,
        checked: true,
        configured: true,
        token_hint: rawToken.slice(-4),
        checked_at: new Date().toISOString(),
      };

      if (params.companyId) {
        this.cacheByCompanyId.set(params.companyId, successStatus);
        await this.updateCompanyDbStatus(
          params.companyId,
          successStatus.status || 'active',
          successStatus.valid_until ? new Date(successStatus.valid_until) : null
        );
      } else {
        this.defaultStatus = successStatus;
      }

      return successStatus;
    } catch (err: any) {
      console.error('[RycosLicenseService] Heartbeat error:', err.message);
      const errStatus: RycosServerLicenseStatus = {
        checked: true,
        configured: true,
        token_hint: rawToken.slice(-4),
        status: 'error',
        error: err.message,
        checked_at: new Date().toISOString(),
      };

      if (params.companyId) {
        this.cacheByCompanyId.set(params.companyId, errStatus);
      }
      return errStatus;
    }
  }

  private async updateCompanyDbStatus(companyId: number, status: string, validUntil: Date | null): Promise<void> {
    try {
      const db = getDatabase();
      await db
        .update(companies)
        .set({
          licenseStatus: status,
          licenseValidUntil: validUntil,
          licenseLastCheckAt: new Date(),
        })
        .where(eq(companies.id, companyId));
    } catch (dbErr: any) {
      console.warn('[RycosLicenseService] Failed to update company license status in DB:', dbErr.message);
    }
  }

  public getCachedCompanyStatus(companyId: number): RycosServerLicenseStatus | null {
    return this.cacheByCompanyId.get(companyId) || null;
  }

  public getLastStatus(): RycosServerLicenseStatus | null {
    return this.defaultStatus;
  }

  /**
   * Compatibility alias for single heartbeat ping
   */
  public async sendHeartbeat(extraStats: Record<string, unknown> = {}): Promise<RycosServerLicenseStatus> {
    return this.checkHeartbeat({ extraStats });
  }

  /**
   * Run heartbeats for all companies having license_token in database
   */
  public async sendAllHeartbeats(): Promise<void> {
    try {
      const db = getDatabase();
      const allCompanies = await db
        .select({
          id: companies.id,
          name: companies.name,
          licenseToken: companies.licenseToken,
        })
        .from(companies);

      for (const comp of allCompanies) {
        if (comp.licenseToken) {
          await this.checkHeartbeat({
            companyId: comp.id,
            token: comp.licenseToken,
            instanceName: `${comp.name} (100k)`,
          });
        }
      }

      if (this.globalToken) {
        await this.checkHeartbeat({ token: this.globalToken });
      }
    } catch (err: any) {
      console.error('[RycosLicenseService] sendAllHeartbeats error:', err.message);
    }
  }

  /**
   * Start background telemetry heartbeat loop (every 30 minutes)
   */
  public startHeartbeatLoop(intervalMs: number = 30 * 60 * 1000): void {
    if (this.timer) clearInterval(this.timer);
    this.sendAllHeartbeats().catch(() => {});
    this.timer = setInterval(() => {
      this.sendAllHeartbeats().catch(() => {});
    }, intervalMs);
  }

  public stopHeartbeatLoop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export const rycosLicenseService = new RycosLicenseService();
