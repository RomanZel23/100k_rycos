import type { FastifyInstance } from 'fastify';
import { adminProductsRoutes } from './products.js';
import { adminCategoriesRoutes } from './categories.js';
import { adminAddonsRoutes } from './addons.js';
import { adminFiscalDevicesRoutes } from './fiscalDevices.js';
import { adminTerminalsRoutes } from './terminals.js';
import { adminCompaniesRoutes } from './companies.js';
import { adminOrdersRoutes } from './orders.js';
import { adminUsersRoutes } from './users.js';
import { adminPaymentGatewaysRoutes } from './paymentGateways.js';
import { adminMasterRoutes } from './master.js';

export async function adminRoutes(fastify: FastifyInstance) {
  // Register modular admin sub-routes
  await fastify.register(adminProductsRoutes);
  await fastify.register(adminCategoriesRoutes);
  await fastify.register(adminAddonsRoutes);
  await fastify.register(adminFiscalDevicesRoutes);
  await fastify.register(adminTerminalsRoutes);
  await fastify.register(adminCompaniesRoutes);
  await fastify.register(adminOrdersRoutes);
  await fastify.register(adminUsersRoutes);
  await fastify.register(adminPaymentGatewaysRoutes);
  await fastify.register(adminMasterRoutes);
}
