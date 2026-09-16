import { env } from '../config/env.js';

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
  error?: string | null;
}

class RycosLicenseService {
  private lastStatus: RycosServerLicenseStatus | null = null;
  private timer: NodeJS.Timeout | null = null;

  private get baseUrl(): string {
    return (env.RYCOS_PORTAL_URL || 'https://portal.rycos.eu').replace(/\/+$/, '');
  }

  private get token(): string {
    return env.RYCOS_LICENSE_TOKEN || env.RYCOS_SOLUTION_TOKEN || env.RYCOS_INTEGRATOR_KEY || '';
  }

  public isConfigured(): boolean {
    return Boolean(this.token && this.token.trim().length > 0);
  }

  /**
   * Send heartbeat meldunek to portal solution license endpoint
   */
  public async sendHeartbeat(extraStats: Record<string, unknown> = {}): Promise<RycosServerLicenseStatus> {
    if (!this.isConfigured()) {
      const res: RycosServerLicenseStatus = {
        checked: true,
        configured: false,
        status: 'unconfigured',
        error: 'Brak zdefiniowanego RYCOS_SOLUTION_TOKEN ani RYCOS_INTEGRATOR_KEY.',
        checked_at: new Date().toISOString(),
      };
      this.lastStatus = res;
      return res;
    }

    try {
      const payload = {
        version: '100k-v1.0.0',
        stats: {
          instance_name: '100k-rycos',
          uptime_seconds: Math.floor(process.uptime()),
          memory_usage_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          timestamp: new Date().toISOString(),
          ...extraStats,
        },
      };

      const res = await fetch(`${this.baseUrl}/api/v2/solution/heartbeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string };
        const failStatus: RycosServerLicenseStatus = {
          checked: true,
          configured: true,
          status: res.status === 401 ? 'revoked' : 'error',
          error: errorData.error || `HTTP ${res.status}`,
          checked_at: new Date().toISOString(),
        };
        this.lastStatus = failStatus;
        return failStatus;
      }

      const data = (await res.json()) as RycosServerLicenseStatus;
      this.lastStatus = {
        ...data,
        checked: true,
        configured: true,
      };
      return this.lastStatus;
    } catch (err: any) {
      console.error('[RycosLicenseService] Heartbeat error:', err.message);
      const errStatus: RycosServerLicenseStatus = {
        checked: true,
        configured: true,
        status: 'error',
        error: err.message,
        checked_at: new Date().toISOString(),
      };
      this.lastStatus = errStatus;
      return errStatus;
    }
  }

  public getLastStatus(): RycosServerLicenseStatus | null {
    return this.lastStatus;
  }

  /**
   * Start 15-minute background telemetry heartbeat
   */
  public startHeartbeatLoop(intervalMs: number = 15 * 60 * 1000): void {
    if (this.timer) clearInterval(this.timer);
    // Send immediate first ping
    this.sendHeartbeat().catch(() => {});
    this.timer = setInterval(() => {
      this.sendHeartbeat().catch(() => {});
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
