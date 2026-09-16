import { env } from '../config/env.js';

export interface RycosSeatDevice {
  id: string;
  display_id: string;
  device_name: string | null;
  device_info: Record<string, unknown> | null;
  last_seen_at: string | null;
}

export interface RycosSeat {
  id: string;
  tier: 'rycos_0' | 'rycos_p' | 'rycos_f' | 'rycos_pf' | string;
  status: 'available' | 'paired' | 'suspended' | string;
  paired_at: string | null;
  created_at: string;
  purchase_id?: string;
  devices?: RycosSeatDevice | RycosSeatDevice[] | null;
}

export interface RycosClient {
  id: string;
  name: string;
  nip: string;
  is_active?: boolean;
}

export interface RycosPinResponse {
  pin: string;
  expires_at: string;
  seat_id: string;
}

export interface RycosLicensingOverview {
  configured: boolean;
  apiKeyPresent: boolean;
  nip: string | null;
  client: RycosClient | null;
  seats: RycosSeat[];
  devices: Array<{
    seatId: string;
    tier: string;
    seatStatus: string;
    deviceId: string;
    displayId: string;
    deviceName: string;
    lastSeenAt: string | null;
    isOnline: boolean;
    appVersion: string | null;
    model: string | null;
    companionApps: {
      aplikasa?: boolean;
      worldline?: boolean;
      printer?: boolean;
    };
  }>;
  tierSummary: {
    total: number;
    paired: number;
    available: number;
    byTier: Record<string, { total: number; paired: number; available: number }>;
  };
  error?: string | null;
}

class RycosIntegratorService {
  private get baseUrl(): string {
    return (env.RYCOS_PORTAL_URL || 'https://portal.rycos.eu').replace(/\/+$/, '');
  }

  private get apiKey(): string {
    return env.RYCOS_INTEGRATOR_KEY || '';
  }

  private get headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-API-Key': this.apiKey,
    };
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  /**
   * Cleans NIP string by removing non-alphanumeric characters (spaces, hyphens, country code prefix).
   */
  public cleanNip(nip: string | null | undefined): string {
    if (!nip) return '';
    const digitsOnly = nip.replace(/^PL/i, '').replace(/[^0-9]/g, '');
    return digitsOnly;
  }

  /**
   * Search client in RYCOS Portal by NIP
   */
  public async getClientByNip(nip: string): Promise<RycosClient | null> {
    const cleanNip = this.cleanNip(nip);
    if (!cleanNip || cleanNip.length !== 10) {
      return null;
    }

    if (!this.isConfigured()) {
      return null;
    }

    try {
      const res = await fetch(`${this.baseUrl}/api/v2/clients?search=${encodeURIComponent(cleanNip)}&limit=10`, {
        method: 'GET',
        headers: this.headers,
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.warn(`[RycosIntegratorService] getClientByNip failed with status ${res.status}: ${errorText}`);
        return null;
      }

      const json = (await res.json()) as { clients?: RycosClient[] };
      const clients = json.clients || [];
      const match = clients.find((c) => this.cleanNip(c.nip) === cleanNip);
      return match || null;
    } catch (err: any) {
      console.error('[RycosIntegratorService] getClientByNip error:', err.message);
      return null;
    }
  }

  /**
   * Get all seats & paired devices for a client
   */
  public async getClientSeats(clientId: string): Promise<{ client: RycosClient; seats: RycosSeat[] } | null> {
    if (!this.isConfigured()) {
      return null;
    }

    try {
      const res = await fetch(`${this.baseUrl}/api/v2/clients/${encodeURIComponent(clientId)}/seats`, {
        method: 'GET',
        headers: this.headers,
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.warn(`[RycosIntegratorService] getClientSeats failed with status ${res.status}: ${errorText}`);
        return null;
      }

      const json = (await res.json()) as { client: RycosClient; seats: RycosSeat[] };
      return json;
    } catch (err: any) {
      console.error('[RycosIntegratorService] getClientSeats error:', err.message);
      return null;
    }
  }

  /**
   * Generate 6-digit pairing PIN for a seat
   */
  public async generatePairingPin(seatId: string): Promise<RycosPinResponse> {
    if (!this.isConfigured()) {
      throw new Error('RYCOS_INTEGRATOR_KEY is not configured on this server');
    }

    const res = await fetch(`${this.baseUrl}/api/v2/seats/${encodeURIComponent(seatId)}/pin`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string };
      throw new Error(data.error || `Portal returned status ${res.status}`);
    }

    return (await res.json()) as RycosPinResponse;
  }

  /**
   * Unpair device from a seat
   */
  public async unpairSeatDevice(seatId: string): Promise<{ success: boolean; message?: string }> {
    if (!this.isConfigured()) {
      throw new Error('RYCOS_INTEGRATOR_KEY is not configured on this server');
    }

    const res = await fetch(`${this.baseUrl}/api/v2/seats/${encodeURIComponent(seatId)}/device`, {
      method: 'DELETE',
      headers: this.headers,
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string };
      throw new Error(data.error || `Portal returned status ${res.status}`);
    }

    return { success: true };
  }

  /**
   * Complete overview of company licensing based on NIP
   */
  public async getCompanyLicensing(rawNip: string | null | undefined): Promise<RycosLicensingOverview> {
    const configured = this.isConfigured();
    const cleanNip = this.cleanNip(rawNip);

    const baseResult: RycosLicensingOverview = {
      configured,
      apiKeyPresent: configured,
      nip: cleanNip || null,
      client: null,
      seats: [],
      devices: [],
      tierSummary: {
        total: 0,
        paired: 0,
        available: 0,
        byTier: {},
      },
      error: null,
    };

    if (!configured) {
      baseResult.error = 'Brak klucza integratora RYCOS_INTEGRATOR_KEY w konfiguracji serwera.';
      return baseResult;
    }

    if (!cleanNip || cleanNip.length !== 10) {
      baseResult.error = 'Firma nie ma zdefiniowanego poprawnego 10-cyfrowego numeru NIP w Ustawieniach.';
      return baseResult;
    }

    const client = await this.getClientByNip(cleanNip);
    if (!client) {
      baseResult.error = `Nie znaleziono firmy o NIP ${cleanNip} w portalu licencyjnym RYCOS. Upewnij się, że klient został dodany u integratora.`;
      return baseResult;
    }

    baseResult.client = client;
    const clientSeatsData = await this.getClientSeats(client.id);
    if (!clientSeatsData) {
      baseResult.error = 'Nie udało się pobrać slotów licencyjnych z portalu RYCOS.';
      return baseResult;
    }

    const seats = clientSeatsData.seats || [];
    baseResult.seats = seats;

    // Build tier summary & device fleet
    const byTier: Record<string, { total: number; paired: number; available: number }> = {};
    let total = 0;
    let paired = 0;
    let available = 0;

    const devicesList: RycosLicensingOverview['devices'] = [];

    const now = Date.now();

    for (const s of seats) {
      total++;
      const tierKey = s.tier || 'rycos_0';
      if (!byTier[tierKey]) {
        byTier[tierKey] = { total: 0, paired: 0, available: 0 };
      }
      byTier[tierKey].total++;

      if (s.status === 'paired') {
        paired++;
        byTier[tierKey].paired++;
      } else if (s.status === 'available') {
        available++;
        byTier[tierKey].available++;
      }

      const d = Array.isArray(s.devices) ? s.devices[0] : s.devices;
      if (d) {
        const info = (d.device_info || {}) as any;
        const companionApps = info.companion_apps || {};
        const lastSeen = d.last_seen_at ? new Date(d.last_seen_at).getTime() : 0;
        const isOnline = Boolean(lastSeen && now - lastSeen < 3 * 60 * 1000); // 3 minutes threshold

        devicesList.push({
          seatId: s.id,
          tier: s.tier,
          seatStatus: s.status,
          deviceId: d.id,
          displayId: d.display_id,
          deviceName: d.device_name || d.display_id,
          lastSeenAt: d.last_seen_at,
          isOnline,
          appVersion: info.app_version || null,
          model: info.model || info.manufacturer || null,
          companionApps: {
            aplikasa: companionApps.aplikasa === true || info.aplikasa_installed === true,
            worldline: companionApps.worldline === true,
            printer: companionApps.printer === true,
          },
        });
      }
    }

    baseResult.tierSummary = {
      total,
      paired,
      available,
      byTier,
    };
    baseResult.devices = devicesList;

    return baseResult;
  }
}

export const rycosIntegratorService = new RycosIntegratorService();
