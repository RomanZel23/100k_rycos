import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { env } from './config/env.js';
import { setupWebSocket } from './plugins/websocket.js';
import { healthRoutes } from './routes/health.js';
import { catalogRoutes } from './routes/catalog.js';
import { orderRoutes } from './routes/orders.js';
import { paymentRoutes } from './routes/payments.js';

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

  // Register Modular Routes
  await fastify.register(healthRoutes);
  await fastify.register(catalogRoutes);
  await fastify.register(orderRoutes);
  await fastify.register(paymentRoutes);

  // Error Handler
  fastify.setErrorHandler((error, _request, reply) => {
    fastify.log.error(error);
    reply.status(error.statusCode || 500).send({
      error: error.message || 'Internal Server Error',
    });
  });

  try {
    await fastify.listen({ port: env.PORT, host: env.HOST });
    console.log(`🚀 [100k_rycos API] Running on http://${env.HOST}:${env.PORT}`);
    console.log(`📖 [100k_rycos API] Swagger docs available at http://${env.HOST}:${env.PORT}/docs`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

bootstrap();
