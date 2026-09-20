import { Worker, Job } from 'bullmq';
import {
  getDatabase,
  orders,
  eq,
  sql,
  and,
  inArray,
  claimOrderFiscalization,
  completeOrderFiscalization,
  failOrderFiscalization,
  markFiscalIssuedByDuplicate,
  resolveFiscalDisplayId,
} from '@rycos/database';
import {
  buildFiscalPayload,
  parseFiscalResult,
  fiscalExternalRef,
  isDuplicateFiscalRefError,
  summarizeFiscalResponse,
} from '@rycos/shared';
import { redisConnection, fiscalQueue } from '../queues/index.js';
import { env } from '../config/env.js';
import { MqttRpc } from '../lib/mqttRpc.js';

interface FiscalJobData {
  orderId: string;
  companyId: number;
}

const rpc = new MqttRpc({
  host: env.RYCOS_MQTT_HOST,
  port: env.RYCOS_MQTT_PORT,
  username: env.RYCOS_MQTT_USERNAME,
  password: env.RYCOS_MQTT_PASSWORD,
  clientPrefix: 'worker',
});

/**
 * Fiscal worker. Uses the SAME atomic claim, payload builder and device resolution as the API,
 * so a receipt is issued at most once per order even when the POS fiscalizes synchronously.
 */
export function startFiscalWorker() {
  const worker = new Worker<FiscalJobData>(
    'fiscalization',
    async (job: Job<FiscalJobData>) => {
      const { orderId } = job.data;
      const db = getDatabase();

      const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      if (!order) {
        console.warn(`[Fiscal Worker] Order ${orderId} not found — dropping job`);
        return;
      }
      if (order.fiscalStatus === 'issued') return;
      if (order.paymentStatus !== 'paid' && order.paymentStatus !== 'confirmed') {
        console.warn(`[Fiscal Worker] BLOCKED: order ${orderId} is not paid (${order.paymentStatus}). Skipping.`);
        return;
      }
      if (order.status === 'cancelled') return;

      const claim = await claimOrderFiscalization(orderId);
      if (!claim) {
        const [fresh] = await db.select({ fiscalStatus: orders.fiscalStatus }).from(orders).where(eq(orders.id, orderId)).limit(1);
        if (fresh?.fiscalStatus === 'issued') return;
        // Someone else (API) is fiscalizing right now — retry later to verify the outcome
        throw new Error(`Fiscalization of ${orderId} is in progress elsewhere — will re-check`);
      }

      const claimed = claim.order;
      const displayId = await resolveFiscalDisplayId(claimed.companyId, claimed.terminalId, env.RYCOS_DEFAULT_DISPLAY_ID);
      const { payload, totalGrosze } = buildFiscalPayload(
        { id: claimed.id, currency: claimed.currency, customerNip: claimed.customerNip, paymentMethod: claimed.paymentMethod },
        claim.items.map((it) => ({
          name: it.name,
          unitPrice: it.unitPrice,
          quantity: it.quantity,
          ptuCode: it.ptuCode,
          taxRate: it.taxRate,
          addons: it.addonsJson as any,
        })),
        { autoPrint: false }
      );

      console.log(`[Fiscal Worker] Issuing receipt for Order #${claimed.orderNumber} on ${displayId} (attempt ${claimed.fiscalAttempts})`);

      let result: any;
      try {
        result = await rpc.call(displayId, '/fiscal/issue', 'POST', payload, 20000);
      } catch (err: any) {
        if (claimed.fiscalAttempts > 1 && isDuplicateFiscalRefError(err.message)) {
          console.warn(`[Fiscal Worker] Order #${claimed.orderNumber}: duplicate reference — receipt was issued by an earlier attempt`);
          await markFiscalIssuedByDuplicate(orderId, err.message, displayId);
          return;
        }
        await failOrderFiscalization(orderId, err.message);
        throw err;
      }

      console.log(
        `[Fiscal Worker] \u2190 ${displayId} responded for Order #${claimed.orderNumber} (ref ${fiscalExternalRef(orderId)}): ${summarizeFiscalResponse(result)}`
      );

      const parsed = parseFiscalResult(result, claimed.orderNumber);

      // 2xx without any receipt data = no receipt. Fail loudly so BullMQ retries instead of
      // silently closing the order with an empty receipt.
      if (!parsed.hasReceipt || parsed.deviceError) {
        const detail = parsed.deviceError || summarizeFiscalResponse(result);

        if (claimed.fiscalAttempts > 1 && isDuplicateFiscalRefError(detail)) {
          console.warn(`[Fiscal Worker] Order #${claimed.orderNumber}: duplicate reference — receipt was issued by an earlier attempt`);
          await markFiscalIssuedByDuplicate(orderId, detail, displayId);
          return;
        }

        const message = `Urz\u0105dzenie ${displayId} nie zwr\u00f3ci\u0142o danych paragonu: ${detail}`;
        await failOrderFiscalization(orderId, message);
        throw new Error(message);
      }

      await completeOrderFiscalization({
        orderId,
        companyId: claimed.companyId,
        displayId,
        requestId: fiscalExternalRef(orderId),
        receiptNumber: parsed.receiptNumber,
        jpkId: parsed.jpkId,
        jobId: parsed.jobId,
        pdfUrl: parsed.pdfUrl,
        qrCodeBase64: parsed.qrCodeBase64,
        grossAmountGrosze: totalGrosze,
        currency: claimed.currency,
        customerNip: claimed.customerNip,
        rawResult: result,
      });

      const event = {
        type: 'order.fiscalized',
        timestamp: new Date().toISOString(),
        companyId: claimed.companyId,
        brandId: claimed.brandId,
        payload: {
          orderId,
          orderNumber: claimed.orderNumber,
          receiptNumber: parsed.receiptNumber,
          pdfUrl: parsed.pdfUrl,
          qrCode: parsed.qrCodeBase64,
          jobId: parsed.jobId,
        },
      };
      // Customer tracker + staff screens (API instances relay these channels to WebSockets)
      await redisConnection.publish('rycos:ws:order', JSON.stringify({ orderId, event }));
      await redisConnection.publish('rycos:ws:broadcast', JSON.stringify({ companyId: claimed.companyId, event }));

      console.log(`[Fiscal Worker] ✓ Order ${orderId} fiscalized (receipt ${parsed.receiptNumber})`);
    },
    {
      connection: redisConnection,
      concurrency: 5,
    }
  );

  worker.on('failed', async (job, err) => {
    console.error(`[Fiscal Worker] ✗ Job ${job?.id} failed (attempt ${job?.attemptsMade}/${job?.opts.attempts}):`, err.message);
    if (job && job.attemptsMade >= (job.opts.attempts || 1)) {
      // Final failure: make it visible (fiscal_status stays 'failed' with the error) and alert staff
      const db = getDatabase();
      const [o] = await db.select().from(orders).where(eq(orders.id, job.data.orderId)).limit(1).catch(() => [] as any[]);
      if (o && o.fiscalStatus !== 'issued') {
        await db
          .update(orders)
          .set({ fiscalStatus: 'failed', fiscalError: `Final: ${err.message}`.slice(0, 2000), updatedAt: new Date() })
          .where(eq(orders.id, o.id))
          .catch(() => {});
        await redisConnection
          .publish('rycos:ws:broadcast', JSON.stringify({
            companyId: o.companyId,
            event: {
              type: 'order.fiscal_failed',
              timestamp: new Date().toISOString(),
              companyId: o.companyId,
              brandId: o.brandId,
              payload: { orderId: o.id, orderNumber: o.orderNumber, error: err.message },
            },
          }))
          .catch(() => {});
      }
    }
  });

  return worker;
}

/** Re-enqueue paid orders whose fiscalization failed or got stuck (every 5 minutes). */
export function startFiscalSweeper() {
  const sweep = async () => {
    try {
      const db = getDatabase();
      const stuck = await db
        .select({ id: orders.id, companyId: orders.companyId })
        .from(orders)
        .where(and(
          inArray(orders.paymentStatus, ['paid', 'confirmed']),
          sql`${orders.status} <> 'cancelled'`,
          sql`((${orders.fiscalStatus} = 'none' AND ${orders.paidAt} < now() - interval '5 minutes')
              OR (${orders.fiscalStatus} = 'pending' AND ${orders.fiscalClaimedAt} < now() - interval '5 minutes')
              OR (${orders.fiscalStatus} = 'failed' AND ${orders.fiscalAttempts} < 20 AND ${orders.updatedAt} < now() - interval '15 minutes'))`
        ))
        .limit(100);
      for (const o of stuck) {
        await fiscalQueue.add('fiscalize', { orderId: o.id, companyId: o.companyId }, { jobId: `sweep-${o.id}-${Math.floor(Date.now() / 900000)}` });
      }
      if (stuck.length) console.log(`[Fiscal Sweeper] Re-enqueued ${stuck.length} orders`);
    } catch (err: any) {
      console.error('[Fiscal Sweeper] error:', err.message);
    }
  };
  setInterval(sweep, 5 * 60 * 1000);
}
