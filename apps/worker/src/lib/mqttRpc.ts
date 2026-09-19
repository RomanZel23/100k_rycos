// NOTE: mirror of apps/api/src/lib/mqttRpc.ts — keep both files identical.
import mqtt, { MqttClient } from 'mqtt';
import { randomUUID } from 'crypto';

/**
 * Persistent MQTT request/response client for RYCOS devices.
 * One connection per process (instead of connect/disconnect per command), with
 * correlation by command id on rycos/<displayId>/response.
 */
export interface MqttRpcConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  clientPrefix: string;
}

interface Pending {
  resolve: (msg: any) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

export interface RequestOptions {
  /**
   * Called when a response arrives AFTER the timeout (within lateWindowMs).
   * Used e.g. for card payments: the customer tapped after we gave up waiting.
   */
  onLate?: (data: any) => void;
  lateWindowMs?: number;
}

export class MqttRpc {
  private client: MqttClient | null = null;
  private connecting: Promise<MqttClient> | null = null;
  private pending = new Map<string, Pending>();
  private subscribed = new Set<string>();

  constructor(private cfg: MqttRpcConfig) {}

  private connect(): Promise<MqttClient> {
    if (this.client && this.client.connected) return Promise.resolve(this.client);
    if (this.connecting) return this.connecting;

    this.connecting = new Promise<MqttClient>((resolve, reject) => {
      const client = mqtt.connect({
        host: this.cfg.host,
        port: this.cfg.port,
        protocol: 'mqtts',
        username: this.cfg.username,
        password: this.cfg.password,
        clientId: `${this.cfg.clientPrefix}-${randomUUID().slice(0, 8)}`,
        clean: true,
        connectTimeout: 10000,
        reconnectPeriod: 3000,
      });

      const onFirstError = (err: Error) => {
        this.connecting = null;
        client.end(true);
        reject(new Error(`MQTT connection error: ${err.message}`));
      };
      client.once('error', onFirstError);

      client.once('connect', () => {
        client.removeListener('error', onFirstError);
        client.on('error', (err) => console.warn('[MqttRpc] error:', err.message));
        this.client = client;
        this.connecting = null;
        resolve(client);
      });

      client.on('connect', () => {
        // re-subscribe after reconnect
        for (const t of this.subscribed) client.subscribe(t, { qos: 1 });
      });

      client.on('message', (_topic, message) => {
        let data: any;
        try {
          data = JSON.parse(message.toString());
        } catch {
          return;
        }
        const p = data?.id ? this.pending.get(data.id) : undefined;
        if (!p) return;
        clearTimeout(p.timer);
        this.pending.delete(data.id);
        p.resolve(data);
      });
    });

    return this.connecting;
  }

  private async ensureSubscribed(client: MqttClient, topic: string) {
    if (this.subscribed.has(topic)) return;
    await new Promise<void>((resolve, reject) => {
      client.subscribe(topic, { qos: 1 }, (err) => (err ? reject(new Error(`MQTT subscribe to ${topic} failed: ${err.message}`)) : resolve()));
    });
    this.subscribed.add(topic);
  }

  /** Send a command and resolve with the raw response envelope ({ id, status, result }). */
  async request(displayId: string, action: string, method: string, payload: any, timeoutMs = 15000, opts: RequestOptions = {}): Promise<any> {
    const client = await this.connect();
    const commandTopic = `rycos/${displayId}/command`;
    const responseTopic = `rycos/${displayId}/response`;
    await this.ensureSubscribed(client, responseTopic);

    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        if (opts.onLate) {
          const lateTimer = setTimeout(() => this.pending.delete(id), opts.lateWindowMs ?? 60000);
          this.pending.set(id, {
            resolve: (data) => {
              try { opts.onLate!(data); } catch (e) { console.error('[MqttRpc] onLate handler failed:', e); }
            },
            reject: () => {},
            timer: lateTimer,
          });
        }
        reject(new MqttTimeoutError(`RYCOS device ${displayId} timed out after ${timeoutMs}ms for ${action}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });

      const command = JSON.stringify({ id, t_sent: Date.now(), action, method, payload });
      client.publish(commandTopic, command, { qos: 1 }, (err) => {
        if (err) {
          clearTimeout(timer);
          this.pending.delete(id);
          reject(new Error(`MQTT publish to ${commandTopic} failed: ${err.message}`));
        }
      });
    });
  }

  /** Like request(), but resolves with data.result for 2xx and rejects otherwise. */
  async call(displayId: string, action: string, method: string, payload: any, timeoutMs = 15000): Promise<any> {
    const data = await this.request(displayId, action, method, payload, timeoutMs);
    if (data.status >= 200 && data.status < 300) return data.result;
    throw new Error(`RYCOS error (status ${data.status}): ${JSON.stringify(data.result)}`);
  }

  /** Fire-and-forget publish. */
  async publish(displayId: string, action: string, method: string, payload: any): Promise<void> {
    const client = await this.connect();
    const command = JSON.stringify({ id: randomUUID(), t_sent: Date.now(), action, method, payload });
    await new Promise<void>((resolve, reject) => {
      client.publish(`rycos/${displayId}/command`, command, { qos: 1 }, (err) => (err ? reject(err) : resolve()));
    });
  }
}

export class MqttTimeoutError extends Error {}
