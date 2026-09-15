import { FastifyInstance } from 'fastify';
import { checkDatabaseHealth, ensureDatabaseSchema } from '@rycos/database';

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/health/live', async () => ({
    status: 'ok',
    uptimeSeconds: Math.floor(process.uptime()),
  }));

  fastify.all('/health/migrate', async (_req, reply) => {
    try {
      await ensureDatabaseSchema();
      return reply.send({ success: true, message: 'Database schema migration executed successfully.' });
    } catch (err: any) {
      return reply.code(500).send({ success: false, error: err.message });
    }
  });

  fastify.get('/health', async (_req, reply) => {
    const isDbHealthy = await checkDatabaseHealth();
    const memUsage = process.memoryUsage();

    const status = isDbHealthy ? 'ok' : 'degraded';

    return reply.code(200).send({
      status,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      database: isDbHealthy ? 'connected' : 'disconnected',
      memory: {
        rssMb: Math.round(memUsage.rss / 1024 / 1024),
        heapUsedMb: Math.round(memUsage.heapUsed / 1024 / 1024),
      },
    });
  });
}
