import { Worker, Job } from 'bullmq';
import mqtt from 'mqtt';
import { getDatabase, orders, orderItems, fiscalReceipts, fiscalDevices, eq, and } from '@rycos/database';
import { redisConnection } from '../queues/index.js';
import { env } from '../config/env.js';
import { randomUUID } from 'crypto';

interface FiscalJobData {
  orderId: string;
  companyId: number;
}

const PAYMENT_METHOD_MAP: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  google_pay: 'Mobile',
  apple_pay: 'Mobile',
  blik: 'Transfer',
};

function mapPaymentMethod(method?: string | null): string {
  if (!method) return 'Transfer';
  return PAYMENT_METHOD_MAP[method.toLowerCase()] || 'Transfer';
}

/**
 * Execute command on physical or virtual RYCOS device via MQTT with correlation.
 */
function sendRycosCommand(
  displayId: string,
  action: string,
  method: string,
  payload: any,
  timeoutMs = 15000
): Promise<any> {
  const commandTopic = `rycos/${displayId}/command`;
  const responseTopic = `rycos/${displayId}/response`;
  const commandId = randomUUID();

  return new Promise((resolve, reject) => {
    const client = mqtt.connect({
      host: env.RYCOS_MQTT_HOST,
      port: env.RYCOS_MQTT_PORT,
      protocol: 'mqtts',
      username: env.RYCOS_MQTT_USERNAME,
      password: env.RYCOS_MQTT_PASSWORD,
      clientId: `worker-fiscal-${randomUUID().slice(0, 8)}`,
      clean: true,
      connectTimeout: 10000,
      reconnectPeriod: 0,
    });

    let settled = false;
    let timer: NodeJS.Timeout | null = null;

    function cleanup(err?: Error | null, result?: any) {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      client.end(true);
      if (err) reject(err);
      else resolve(result);
    }

    timer = setTimeout(() => {
      cleanup(new Error(`RYCOS device ${displayId} timed out after ${timeoutMs}ms for ${action}`));
    }, timeoutMs);

    client.on('error', (err) => {
      cleanup(new Error(`MQTT connection error: ${err.message}`));
    });

    client.on('connect', () => {
      client.subscribe(responseTopic, { qos: 1 }, (subErr) => {
        if (subErr) {
          return cleanup(new Error(`MQTT subscribe to ${responseTopic} failed: ${subErr.message}`));
        }

        const command = JSON.stringify({
          id: commandId,
          t_sent: Date.now(),
          action,
          method,
          payload,
        });

        client.publish(commandTopic, command, { qos: 1 }, (pubErr) => {
          if (pubErr) {
            return cleanup(new Error(`MQTT publish to ${commandTopic} failed: ${pubErr.message}`));
          }
          console.log(`[Fiscal Worker] → Sent ${method} ${action} (id: ${commandId}) to ${displayId}`);
        });
      });
    });

    client.on('message', (topic, message) => {
      if (topic !== responseTopic) return;
      try {
        const data = JSON.parse(message.toString());
        if (data.id !== commandId) return; // ignore other messages

        console.log(`[Fiscal Worker] ← Received response (id: ${commandId}, status: ${data.status})`);
        if (data.status >= 200 && data.status < 300) {
          cleanup(null, data.result);
        } else {
          cleanup(new Error(`RYCOS error (status ${data.status}): ${JSON.stringify(data.result)}`));
        }
      } catch (e: any) {
        cleanup(new Error(`Invalid JSON in response from ${displayId}: ${e.message}`));
      }
    });
  });
}

export function startFiscalWorker() {
  const worker = new Worker<FiscalJobData>(
    'fiscalization',
    async (job: Job<FiscalJobData>) => {
      const { orderId, companyId } = job.data;
      console.log(`[Fiscal Worker] Processing order ${orderId} for company ${companyId}`);

      const db = getDatabase();

      // 1. Fetch Order & Items
      const [order] = await db
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);

      if (!order) {
        throw new Error(`Order ${orderId} not found`);
      }

      if (order.fiscalStatus === 'issued') {
        console.log(`[Fiscal Worker] Order ${orderId} already fiscalized. Skipping.`);
        return;
      }

      // Critical Fiscal Compliance Rule: Cannot fiscalize unpaid order!
      if (order.paymentStatus !== 'paid' && order.paymentStatus !== 'confirmed') {
        console.warn(
          `[Fiscal Worker] BLOCKED: Cannot fiscalize unpaid order ${orderId} (paymentStatus: "${order.paymentStatus}"). Skipping.`
        );
        return;
      }

      const items = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId));

      // 2. Resolve Fiscal Device ID
      const [primaryDevice] = await db
        .select()
        .from(fiscalDevices)
        .where(and(eq(fiscalDevices.companyId, companyId), eq(fiscalDevices.isPrimary, true)))
        .limit(1);

      const displayId = primaryDevice?.deviceId || env.RYCOS_DEFAULT_DISPLAY_ID;
      const requestId = `REQ-${order.orderNumber}-${Date.now()}`;

      // 3. Build Fiscal Items & Calculate Totals
      // Every item price must be in grosze/cents and match the payment sum exactly
      const fiscalItems: any[] = [];

      for (const item of items) {
        const addons = (item.addonsJson as any[]) || [];
        const addonsTotalGrosze = addons.reduce(
          (sum, a) => sum + Math.round((Number(a?.priceDelta) || 0) * 100),
          0
        );
        const itemUnitGrosze = Math.round(parseFloat(item.unitPrice) * 100);
        const baseUnitGrosze = itemUnitGrosze - addonsTotalGrosze;

        fiscalItems.push({
          nameItem: item.name.substring(0, 40),
          ptuCode: item.ptuCode || 'b',
          priceItem: baseUnitGrosze,
          qty: item.quantity,
          typeItem: 'GENERAL',
          units: 'szt',
        });

        // Split addons as separate lines on fiscal receipt
        for (const addon of addons) {
          const deltaGrosze = Math.round((Number(addon?.priceDelta) || 0) * 100);
          if (deltaGrosze <= 0) continue;

          fiscalItems.push({
            nameItem: `+ ${addon.name || 'Dodatek'}`.substring(0, 40),
            ptuCode: item.ptuCode || 'b',
            priceItem: deltaGrosze,
            qty: item.quantity,
            typeItem: 'GENERAL',
            units: 'szt',
          });
        }
      }

      const itemsTotalGrosze = fiscalItems.reduce(
        (sum, i) => sum + i.priceItem * i.qty,
        0
      );
      const paymentAmountGrosze = itemsTotalGrosze;

      const payload = {
        header: {
          externalrefFR: String(requestId).replace(/_/g, '-').substring(0, 40),
          currency: (order.currency || 'PLN').toUpperCase(),
          customerNIP: order.customerNip || undefined,
        },
        items: fiscalItems,
        payment: [
          {
            paymentMethod: mapPaymentMethod(order.paymentMethod),
            amount: paymentAmountGrosze,
            currency: (order.currency || 'PLN').toUpperCase(),
          },
        ],
        output: {
          autoPrint: false, // E-receipt default (QR / PDF on customer phone)
          showQrScreen: false,
          returnQrCodeBase64: true,
        },
      };

      console.log(`[Fiscal Worker] Issuing fiscal receipt via RYCOS for Order #${order.orderNumber} to device ${displayId}...`);

      // 4. Issue Fiscal Command over MQTT to RYCOS
      let result: any;
      try {
        result = await sendRycosCommand(displayId, '/fiscal/issue', 'POST', payload, 15000);
      } catch (err: any) {
        console.error(`[Fiscal Worker] Failed communicating with RYCOS device ${displayId}:`, err.message);
        throw err;
      }

      const receiptNumber = String(result?.receiptNumber || result?.number || `PAR_${order.orderNumber}`);
      const jpkId = String(result?.jpkId || '');
      const pdfUrl = result?.pdfReceiptUrl || result?.pdfUrl || null;
      const qrCodeBase64 = result?.qrCodeBase64 || result?.qrCode || result?.qrBase64 || null;
      const jobId = result?.jobId || result?.printJob?.jobId || null;

      console.log(`[Fiscal Worker] ✓ RYCOS Success! Receipt #${receiptNumber}, JPK: ${jpkId}, PDF: ${pdfUrl}, Job: ${jobId}`);

      // 5. Store Fiscal Receipt Record in PostgreSQL
      await db
        .insert(fiscalReceipts)
        .values({
          orderId,
          companyId,
          displayId,
          requestId,
          receiptNumber,
          jpkId,
          jobId,
          grossAmountGrosze: paymentAmountGrosze,
          currency: order.currency,
          customerNip: order.customerNip,
          pdfReceiptUrl: pdfUrl,
          rawResult: result,
        })
        .onConflictDoUpdate({
          target: fiscalReceipts.orderId,
          set: {
            receiptNumber,
            jpkId,
            jobId,
            pdfReceiptUrl: pdfUrl,
            rawResult: result,
          },
        });

      // 6. Update Order Fiscal Status
      await db
        .update(orders)
        .set({
          fiscalStatus: 'issued',
          fiscalDeviceId: displayId,
          fiscalReceiptNumber: receiptNumber,
          fiscalPdfUrl: pdfUrl,
          fiscalJobId: jobId,
          fiscalQrCode: qrCodeBase64,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, orderId));

      // 7. Publish WebSocket Live Event
      await redisConnection.publish(
        'rycos:ws:order',
        JSON.stringify({
          orderId,
          event: {
            type: 'order.fiscalized',
            timestamp: new Date().toISOString(),
            companyId,
            brandId: order.brandId,
            payload: {
              orderId,
              orderNumber: order.orderNumber,
              receiptNumber,
              pdfUrl,
              qrCode: qrCodeBase64,
              jobId,
            },
          },
        })
      );

      console.log(`[Fiscal Worker] ✓ Order ${orderId} successfully fiscalized & broadcasted`);
    },
    {
      connection: redisConnection,
      concurrency: 5,
    }
  );

  worker.on('failed', (job, err) => {
    console.error(`[Fiscal Worker] ✗ Job ${job?.id} failed:`, err.message);
  });
}
