import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import multipart from '@fastify/multipart';
import { env } from './config/env.js';
import { setupWebSocket } from './plugins/websocket.js';
import { healthRoutes } from './routes/health.js';
import { catalogRoutes } from './routes/catalog.js';
import { orderRoutes } from './routes/orders.js';
import { paymentRoutes } from './routes/payments.js';
import { adminRoutes } from './routes/admin/index.js';
import { storageRoutes } from './routes/storage.js';
import { ensureDatabaseSchema } from '@rycos/database';

async function bootstrap() {
  const fastify = Fastify({
    logger: env.NODE_ENV !== 'production' ? { level: 'info' } : { level: 'warn' },
    trustProxy: true,
  });

  // Security & Cross-Origin
  await fastify.register(cors, {
    origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(','),
    credentials: true,
  });

  await fastify.register(helmet, {
    contentSecurityPolicy: false, // Allow Swagger UI
  });

  await fastify.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB
    },
  });

  // OpenAPI Documentation at /docs
  await fastify.register(swagger, {
    openapi: {
      info: {
        title: '100k_rycos Core API',
        description: 'High-performance restaurant order engine, realtime KDS, and RYCOS fiscalization',
        version: '1.0.0',
      },
      servers: [
        { url: `http://localhost:${env.PORT}`, description: 'Local server' },
      ],
    },
  });

  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
  });

  // Realtime WebSockets
  await setupWebSocket(fastify);

  // Root redirect to Swagger UI
  fastify.get('/', async (_req, reply) => {
    return reply.redirect('/docs');
  });

  // Register Modular Routes
  await fastify.register(healthRoutes);
  await fastify.register(catalogRoutes);
  await fastify.register(orderRoutes);
  await fastify.register(paymentRoutes);
  await fastify.register(adminRoutes);
  await fastify.register(storageRoutes);

  // Error Handler
  fastify.setErrorHandler((error: any, _request, reply) => {
    fastify.log.error(error);
    reply.status(error.statusCode || 500).send({
      error: error.message || 'Internal Server Error',
    });
  });

  // Ensure PostgreSQL schema exists and seed demo data if fresh
  await ensureDatabaseSchema();

  try {
    await fastify.listen({ port: env.PORT, host: env.HOST });
    console.log(`🚀 [100k_rycos API] Running on http://${env.HOST}:${env.PORT}`);
    console.log(`📖 [100k_rycos API] Swagger docs available at http://${env.HOST}:${env.PORT}/docs`);
    console.log(`📡 [100k_rycos API] DATABASE target: ${env.DATABASE_URL.replace(/:[^:@]+@/, ':****@')}`);
    console.log(`📡 [100k_rycos API] REDIS target: ${env.REDIS_URL.replace(/:[^:@]+@/, ':****@')}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

bootstrap();
