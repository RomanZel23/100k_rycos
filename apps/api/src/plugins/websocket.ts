import { FastifyInstance } from 'fastify';
import fastifyWebSocket, { WebSocket } from '@fastify/websocket';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { WSEvent } from '@rycos/shared';
import { resolveUserFromToken, resolveTerminalFromToken, isPlatformAdmin } from '../middleware/adminAuth.js';

// In-memory registry of active WebSocket sockets for this Node process
const companySockets = new Map<number, Set<WebSocket>>();
const orderSockets = new Map<string, Set<WebSocket>>();

let redisPublisher: Redis | null = null;
let redisSubscriber: Redis | null = null;

const WS_CHANNEL_BROADCAST = 'rycos:ws:broadcast';
const WS_CHANNEL_ORDER = 'rycos:ws:order';

export async function setupWebSocket(fastify: FastifyInstance) {
  await fastify.register(fastifyWebSocket);

  // Initialize Redis Pub/Sub clients for multi-instance sync
  try {
    redisPublisher = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 3 });
    redisSubscriber = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 3 });

    redisPublisher.on('error', (err) => {
      console.warn('[WS:Redis Publisher Error]', err.message);
    });
    redisSubscriber.on('error', (err) => {
      console.warn('[WS:Redis Subscriber Error]', err.message);
    });

    await redisPublisher.connect();
    await redisSubscriber.connect();

    await redisSubscriber.subscribe(WS_CHANNEL_BROADCAST, WS_CHANNEL_ORDER);

    redisSubscriber.on('message', (channel: string, rawMessage: string) => {
      try {
        const data = JSON.parse(rawMessage);
        if (channel === WS_CHANNEL_BROADCAST) {
          deliverToCompanyLocally(data.companyId, data.event);
        } else if (channel === WS_CHANNEL_ORDER) {
          deliverToOrderLocally(data.orderId, data.event);
        }
      } catch (err) {
        console.error('[WS:Redis] Error parsing pub/sub message:', err);
      }
    });

    console.log('[WS] Redis pub/sub cluster bridge connected');
  } catch (err) {
    console.warn('[WS] Running in standalone local WebSocket mode (Redis pub/sub unavailable):', (err as Error).message);
  }

  // Route 1: Staff / Kitchen KDS / POS WebSocket — requires ?token=<admin JWT | terminal token>.
  // The company is derived from the verified token (platform admins may pick ?companyId=).
  const handleStaffWs = async (socket: WebSocket, req: any) => {
    const query = (req.query ?? {}) as { companyId?: string; token?: string };
    const token = query.token ? String(query.token) : null;

    let principal = resolveUserFromToken(token) || (await resolveTerminalFromToken(token));
    if (!principal && env.NODE_ENV !== 'production') {
      principal = { company_id: parseInt(query.companyId || '1', 10) || 1, role: 'platform_admin' };
    }
    if (!principal) {
      socket.send(JSON.stringify({ type: 'error', code: 'unauthorized', message: 'Brak autoryzacji stanowiska' }));
      socket.close(4401, 'unauthorized');
      return;
    }

    let companyId = principal.company_id;
    if (isPlatformAdmin(principal) && query.companyId) {
      const requested = parseInt(query.companyId, 10);
      if (Number.isFinite(requested) && requested > 0) companyId = requested;
    }

    if (!companySockets.has(companyId)) {
      companySockets.set(companyId, new Set());
    }
    companySockets.get(companyId)!.add(socket);

    socket.on('close', () => {
      const set = companySockets.get(companyId);
      if (set) {
        set.delete(socket);
        if (set.size === 0) companySockets.delete(companyId);
      }
    });

    socket.send(JSON.stringify({ type: 'connected', role: 'staff', companyId }));
  };

  fastify.get('/v1/ws', { websocket: true }, handleStaffWs);
  fastify.get('/v1/ws/staff', { websocket: true }, handleStaffWs);

  // Route 2: Customer Live Order Tracker WebSocket
  fastify.get('/v1/ws/orders/:orderId', { websocket: true }, (socket, req) => {
    const params = req.params as { orderId: string };
    const orderId = params.orderId;
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
      socket.close(4400, 'invalid order id');
      return;
    }

    if (!orderSockets.has(orderId)) {
      orderSockets.set(orderId, new Set());
    }
    orderSockets.get(orderId)!.add(socket);

    socket.on('close', () => {
      const set = orderSockets.get(orderId);
      if (set) {
        set.delete(socket);
        if (set.size === 0) orderSockets.delete(orderId);
      }
    });

    socket.send(JSON.stringify({ type: 'connected', role: 'customer', orderId }));
  });
}

function deliverToSet(sockets: Set<WebSocket> | undefined, message: string) {
  if (!sockets) return;
  for (const s of sockets) {
    if (s.readyState === 1 /* OPEN */) {
      try {
        s.send(message);
      } catch {}
    }
  }
}

function deliverToCompanyLocally(companyId: number, event: WSEvent) {
  const json = JSON.stringify(event);
  deliverToSet(companySockets.get(companyId), json);
}

function deliverToOrderLocally(orderId: string, event: WSEvent) {
  const json = JSON.stringify(event);
  deliverToSet(orderSockets.get(orderId), json);
}

export async function broadcastToStaff(companyId: number, event: WSEvent) {
  deliverToCompanyLocally(companyId, event);
  if (redisPublisher && redisPublisher.status === 'ready') {
    await redisPublisher.publish(WS_CHANNEL_BROADCAST, JSON.stringify({ companyId, event }));
  }
}

export async function broadcastToOrder(orderId: string, event: WSEvent | any) {
  deliverToOrderLocally(orderId, event);
  if (redisPublisher && redisPublisher.status === 'ready') {
    await redisPublisher.publish(WS_CHANNEL_ORDER, JSON.stringify({ orderId, event }));
  }
}
