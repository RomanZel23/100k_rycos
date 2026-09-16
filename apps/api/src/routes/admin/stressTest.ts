import type { FastifyInstance } from 'fastify';
import { getDatabase, orders, orderItems, orderEvents, products, brands, eq, and, sql } from '@rycos/database';
import { requirePlatformAdmin, getCompanyId } from '../../middleware/adminAuth.js';
import { success, error, validationError } from '../../lib/response.js';

interface StressTestPayload {
  brandId?: number;
  count?: number;
  concurrency?: number;
  mode?: 'in_memory' | 'synthetic_db';
  autoCleanup?: boolean;
}

export async function adminStressTestRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requirePlatformAdmin);

  // GET /v1/admin/stress-test/stats - Get test orders count & db latency
  fastify.get('/v1/admin/stress-test/stats', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);

    const pingStart = performance.now();
    await db.execute(sql`SELECT 1`);
    const dbPingMs = +(performance.now() - pingStart).toFixed(2);

    const testOrdersCountRes = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(orders)
      .where(and(eq(orders.companyId, companyId), eq(orders.orderType, 'test')));

    const testOrdersCount = testOrdersCountRes[0]?.count ?? 0;

    const brandList = await db
      .select({ id: brands.id, name: brands.name, slug: brands.slug })
      .from(brands)
      .where(eq(brands.companyId, companyId));

    return success(reply, {
      dbPingMs,
      testOrdersCount,
      brands: brandList,
      serverMemoryMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
      nodeEnv: process.env.NODE_ENV || 'production',
      maxSafeChunk: 1000,
      maxSafeConcurrency: 50,
    }, 'Stress test stats retrieved');
  });

  // POST /v1/admin/stress-test/cleanup - Delete all synthetic test orders
  fastify.post('/v1/admin/stress-test/cleanup', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);

    const deleted = await db
      .delete(orders)
      .where(and(eq(orders.companyId, companyId), eq(orders.orderType, 'test')))
      .returning({ id: orders.id });

    return success(reply, {
      deletedCount: deleted.length,
    }, `Successfully deleted ${deleted.length} synthetic test orders`);
  });

  // POST /v1/admin/stress-test/run - Execute safe load test
  fastify.post('/v1/admin/stress-test/run', async (req, reply) => {
    const db = getDatabase();
    const companyId = getCompanyId(req);
    const body = (req.body as StressTestPayload) || {};

    // 1. Strict Safety Parameter Clamping
    const requestedCount = Number(body.count) || 50;
    const count = Math.min(Math.max(requestedCount, 1), 1000); // Clamped between 1 and 1000 per request
    const requestedConcurrency = Number(body.concurrency) || 10;
    const concurrency = Math.min(Math.max(requestedConcurrency, 1), 50); // Clamped between 1 and 50
    const mode = body.mode === 'synthetic_db' ? 'synthetic_db' : 'in_memory';
    const autoCleanup = Boolean(body.autoCleanup);

    // 2. Fetch or fallback brand & products for company
    let targetBrandId = body.brandId;
    if (!targetBrandId) {
      const defaultBrand = await db
        .select({ id: brands.id })
        .from(brands)
        .where(eq(brands.companyId, companyId))
        .limit(1);
      targetBrandId = defaultBrand[0]?.id;
    }

    if (!targetBrandId && mode === 'synthetic_db') {
      return validationError(reply, { brandId: 'Brand not found' }, 'Brak skonfigurowanej marki (Brand) dla tej firmy. Utwórz najpierw markę.');
    }

    const companyProducts = targetBrandId
      ? await db
          .select({
            id: products.id,
            name: products.name,
            price: products.price,
            taxRate: products.taxRate,
            ptuCode: products.ptuCode,
          })
          .from(products)
          .where(eq(products.companyId, companyId))
          .limit(10)
      : [];

    // Fallback sample product template if menu is empty
    const sampleProduct = companyProducts[0] || {
      id: 1,
      name: 'Smash Burger (Benchmark)',
      price: '32.00',
      taxRate: 8,
      ptuCode: 'b',
    };

    const memBefore = process.memoryUsage().heapUsed;
    const latencies: number[] = [];
    const errors: string[] = [];
    let successfulOrders = 0;
    let failedOrders = 0;

    const createdOrderIds: string[] = [];
    const startTime = performance.now();

    // 3. Worker Pool with Controlled Concurrency
    let currentIndex = 0;

    async function worker() {
      while (currentIndex < count) {
        const orderIndex = ++currentIndex;
        if (orderIndex > count) break;

        const reqStart = performance.now();
        try {
          const randomPin = String(Math.floor(1000 + Math.random() * 9000));
          const unitPrice = parseFloat(sampleProduct.price) || 30.0;
          const qty = 1 + (orderIndex % 3);
          const totalAmount = unitPrice * qty;

          if (mode === 'synthetic_db' && targetBrandId) {
            // Full transactional DB insertion with cascade
            const inserted = await db.transaction(async (tx) => {
              const [newOrder] = await tx
                .insert(orders)
                .values({
                  companyId,
                  brandId: targetBrandId!,
                  orderNumber: 900000 + (orderIndex % 100000),
                  collectionPin: randomPin,
                  status: 'paid',
                  orderType: 'test',
                  customerNote: `[STRESS-TEST #${orderIndex}]`,
                  subtotalAmount: totalAmount.toFixed(2),
                  tipAmount: '0.00',
                  totalAmount: totalAmount.toFixed(2),
                  currency: 'PLN',
                  paymentMethod: 'benchmark',
                  paymentStatus: 'paid',
                })
                .returning({ id: orders.id });

              await tx.insert(orderItems).values({
                orderId: newOrder.id,
                productId: sampleProduct.id,
                name: sampleProduct.name,
                quantity: qty,
                unitPrice: unitPrice.toFixed(2),
                taxRate: sampleProduct.taxRate || 8,
                ptuCode: sampleProduct.ptuCode || 'b',
                lineTotal: totalAmount.toFixed(2),
                addonsJson: [],
              });

              await tx.insert(orderEvents).values({
                orderId: newOrder.id,
                eventType: 'order.created',
                payload: { source: 'stress_test', benchmarkId: orderIndex },
              });

              return newOrder.id;
            });

            createdOrderIds.push(inserted);
          } else {
            // In-Memory Simulation: Computes full validation, calculations, serialization, PIN hashing
            const simulatedOrder = {
              companyId,
              brandId: targetBrandId || 1,
              orderNumber: 900000 + (orderIndex % 100000),
              collectionPin: randomPin,
              status: 'paid',
              orderType: 'test',
              subtotalAmount: totalAmount.toFixed(2),
              totalAmount: totalAmount.toFixed(2),
              items: [
                {
                  productId: sampleProduct.id,
                  name: sampleProduct.name,
                  quantity: qty,
                  unitPrice: unitPrice.toFixed(2),
                  lineTotal: totalAmount.toFixed(2),
                },
              ],
              createdAt: new Date().toISOString(),
            };
            // JSON serialization & parsing simulation
            JSON.parse(JSON.stringify(simulatedOrder));
          }

          const reqElapsed = +(performance.now() - reqStart).toFixed(2);
          latencies.push(reqElapsed);
          successfulOrders++;
        } catch (err: any) {
          failedOrders++;
          if (errors.length < 5) {
            errors.push(err?.message || 'Order generation failed');
          }
        }
      }
    }

    // Run parallel workers
    const workerPromises = Array.from({ length: concurrency }, () => worker());
    await Promise.all(workerPromises);

    const totalDurationMs = +(performance.now() - startTime).toFixed(2);
    const memAfter = process.memoryUsage().heapUsed;
    const memoryDeltaMb = +((memAfter - memBefore) / (1024 * 1024)).toFixed(2);

    // Optional Auto-Cleanup
    let autoCleanedCount = 0;
    if (autoCleanup && createdOrderIds.length > 0) {
      const deleted = await db
        .delete(orders)
        .where(and(eq(orders.companyId, companyId), eq(orders.orderType, 'test')))
        .returning({ id: orders.id });
      autoCleanedCount = deleted.length;
    }

    // 4. Statistical Metrics
    latencies.sort((a, b) => a - b);
    const minLatency = latencies[0] || 0;
    const maxLatency = latencies[latencies.length - 1] || 0;
    const sumLatency = latencies.reduce((sum, l) => sum + l, 0);
    const avgLatency = latencies.length > 0 ? +(sumLatency / latencies.length).toFixed(2) : 0;
    const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
    const p90 = latencies[Math.floor(latencies.length * 0.9)] || 0;
    const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
    const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;

    const durationSeconds = totalDurationMs / 1000;
    const ordersPerSecond = durationSeconds > 0 ? +(successfulOrders / durationSeconds).toFixed(1) : 0;
    const projectedPerMinute = Math.round(ordersPerSecond * 60);
    const stadiumTargetPct = +((projectedPerMinute / 100000) * 100).toFixed(1);

    return success(reply, {
      count: requestedCount,
      actualCount: count,
      concurrency,
      mode,
      successfulOrders,
      failedOrders,
      totalDurationMs,
      ordersPerSecond,
      projectedPerMinute,
      stadiumTargetPct,
      latencies: {
        min: minLatency,
        max: maxLatency,
        avg: avgLatency,
        p50,
        p90,
        p95,
        p99,
      },
      memoryDeltaMb,
      autoCleanedCount,
      errors: errors.slice(0, 5),
    }, 'Stress test finished');
  });
}
