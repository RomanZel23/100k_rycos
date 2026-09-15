import mqtt from 'mqtt';
import { randomUUID } from 'crypto';
import { getDatabase, orders, orderItems, fiscalReceipts, fiscalDevices, terminals, eq, and, sql } from '@rycos/database';
import { env } from '../config/env.js';
import { broadcastToStaff, broadcastToOrder } from '../plugins/websocket.js';

export interface FiscalizeOptions {
  orderId: string;
  autoPrint?: boolean;
  printerDeviceId?: string;
  terminalId?: string;
}

export interface FiscalizeResult {
  success: boolean;
  receiptNumber?: string;
  pdfReceiptUrl?: string | null;
  qrCodeBase64?: string | null;
  jobId?: string | null;
  displayId?: string;
  error?: string;
  raw?: any;
}

export interface PrintJobOptions {
  companyId?: number;
  terminalId?: string;
  printerDeviceId?: string;
  jobId?: string;
  orderId?: string;
}

const PAYMENT_METHOD_MAP: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  google_pay: 'Mobile',
  apple_pay: 'Mobile',
  blik: 'Transfer',
};

function mapPaymentMethod(method?: string | null): string {
  return PAYMENT_METHOD_MAP[method || 'cash'] || 'Other';
}

function taxRateToPtuCode(taxRate: number): string {
  if (taxRate === 23) return 'a';
  if (taxRate === 8) return 'b';
  if (taxRate === 5) return 'c';
  if (taxRate === 0) return 'd';
  return 'a';
}

/**
 * Send a generic correlated command to RYCOS device via MQTT.
 */
export async function sendMqttCommand(
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
      clientId: `api-fiscal-${randomUUID().slice(0, 8)}`,
      clean: true,
      connectTimeout: 8000,
      reconnectPeriod: 0,
    });

    let settled = false;
    let timer: NodeJS.Timeout | null = null;

    function cleanup(err?: Error | null, result?: any) {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try { client.end(true); } catch (_) {}
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
          console.log(`[Fiscal Service] → Sent ${method} ${action} (id: ${commandId}) to ${displayId}`);
        });
      });
    });

    client.on('message', (topic, message) => {
      if (topic !== responseTopic) return;
      try {
        const data = JSON.parse(message.toString());
        if (data.id !== commandId) return;

        console.log(`[Fiscal Service] ← Received response (id: ${commandId}, status: ${data.status})`);
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

/**
 * Resolve target Fiscal device ID (e.g. SBR-C5N34S or SBT-NMLL2M) for an order.
 */
export async function resolveFiscalDisplayId(
  companyId: number,
  orderTerminalId?: string | null
): Promise<string> {
  const db = getDatabase();

  if (orderTerminalId) {
    const cleanTerm = orderTerminalId.trim().toUpperCase();
    const [term] = await db
      .select()
      .from(terminals)
      .where(eq(terminals.terminalId, cleanTerm))
      .limit(1);

    if (term) {
      if (term.fiscalDeviceId && term.fiscalDeviceId !== 'self' && term.fiscalDeviceId.trim() !== '') {
        return term.fiscalDeviceId.trim();
      }
      if (term.terminalId.startsWith('SBR-') || term.terminalId.startsWith('SBT-')) {
        return term.terminalId;
      }
    }
  }

  // Primary fiscal device configured for company
  const [primaryDevice] = await db
    .select()
    .from(fiscalDevices)
    .where(and(eq(fiscalDevices.companyId, companyId), eq(fiscalDevices.isPrimary, true)))
    .limit(1);

  if (primaryDevice?.deviceId) {
    return primaryDevice.deviceId;
  }

  // Any active fiscal device
  const [anyDevice] = await db
    .select()
    .from(fiscalDevices)
    .where(and(eq(fiscalDevices.companyId, companyId), eq(fiscalDevices.status, 'active')))
    .limit(1);

  if (anyDevice?.deviceId) {
    return anyDevice.deviceId;
  }

  return env.RYCOS_DISPLAY_ID || 'SBT-NMLL2M';
}

/**
 * Resolve target thermal printer display ID (SBR-* printer).
 */
export async function resolvePrinterDisplayId(
  companyId?: number,
  terminalId?: string | null,
  explicitPrinterDeviceId?: string | null,
  fallbackFiscalDeviceId?: string | null
): Promise<string> {
  if (explicitPrinterDeviceId && explicitPrinterDeviceId.trim() !== '' && explicitPrinterDeviceId !== 'self') {
    return explicitPrinterDeviceId.trim();
  }

  const db = getDatabase();

  if (terminalId) {
    const cleanTerm = terminalId.trim().toUpperCase();
    const [term] = await db
      .select()
      .from(terminals)
      .where(eq(terminals.terminalId, cleanTerm))
      .limit(1);

    if (term) {
      if (term.printerDeviceId && term.printerDeviceId !== 'self' && term.printerDeviceId.trim() !== '') {
        return term.printerDeviceId.trim();
      }
      if (term.printerDeviceId === 'self' || term.terminalId.startsWith('SBR-') || term.terminalId.startsWith('SBT-')) {
        return term.terminalId;
      }
    }
  }

  if (fallbackFiscalDeviceId && fallbackFiscalDeviceId.trim() !== '') {
    return fallbackFiscalDeviceId.trim();
  }

  if (companyId) {
    const companyTerms = await db
      .select()
      .from(terminals)
      .where(eq(terminals.companyId, companyId));

    for (const t of companyTerms) {
      if (t.printerDeviceId && t.printerDeviceId !== 'self') return t.printerDeviceId.trim();
      if (t.terminalId.startsWith('SBR-')) return t.terminalId;
    }
  }

  return env.RYCOS_DISPLAY_ID || 'SBT-NMLL2M';
}

/**
 * Execute fiscal receipt issuance via RYCOS MQTT.
 * Requests QR code (returnQrCodeBase64: true) and captures jobId for optional thermal printing.
 */
export async function fiscalizeOrder(options: FiscalizeOptions): Promise<FiscalizeResult> {
  const { orderId, autoPrint = false, terminalId } = options;
  const db = getDatabase();

  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!order) {
    throw new Error(`Order ${orderId} not found`);
  }

  // If already fiscalized, return existing fiscal data
  if (order.fiscalStatus === 'issued' && (order.fiscalReceiptNumber || order.fiscalPdfUrl || order.fiscalQrCode)) {
    return {
      success: true,
      receiptNumber: order.fiscalReceiptNumber || undefined,
      pdfReceiptUrl: order.fiscalPdfUrl,
      qrCodeBase64: order.fiscalQrCode,
      jobId: order.fiscalJobId,
      displayId: order.fiscalDeviceId || undefined,
    };
  }

  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  const displayId = await resolveFiscalDisplayId(order.companyId, terminalId || order.terminalId);
  const requestId = `REQ-${order.orderNumber}-${Date.now()}`;

  const fiscalItems = items.map((item) => {
    const rawPrice = parseFloat(item.unitPrice as string) || 0;
    const priceGrosze = Math.round(rawPrice * 100);
    return {
      nameItem: String(item.name).substring(0, 40),
      ptuCode: item.ptuCode || taxRateToPtuCode(item.taxRate),
      priceItem: priceGrosze,
      qty: item.quantity,
      typeItem: 'GENERAL',
      units: 'szt',
    };
  });

  const paymentAmountGrosze = fiscalItems.reduce((sum, i) => sum + i.priceItem * i.qty, 0);

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
      autoPrint: autoPrint === true,
      showQrScreen: false,
      returnQrCodeBase64: true, // Always request QR code for SB e-paragon!
    },
  };

  console.log(`[Fiscal Service] Issuing fiscal receipt for Order #${order.orderNumber} via ${displayId}...`);

  let result: any;
  try {
    result = await sendMqttCommand(displayId, '/fiscal/issue', 'POST', payload, 20000);
  } catch (err: any) {
    console.error(`[Fiscal Service] Failed communicating with RYCOS device ${displayId}:`, err.message);
    throw err;
  }

  const receiptNumber = String(result?.receiptNumber || result?.number || `PAR_${order.orderNumber}`);
  const jpkId = String(result?.jpkId || '');
  const pdfUrl = result?.pdfReceiptUrl || result?.pdfUrl || null;
  const qrCodeBase64 = result?.qrCodeBase64 || result?.qrCode || result?.qrBase64 || null;
  const jobId = result?.jobId || result?.printJob?.jobId || null;

  // Insert or update fiscal_receipts
  await db
    .insert(fiscalReceipts)
    .values({
      orderId,
      companyId: order.companyId,
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

  // Update order record
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

  // Live broadcast to Staff & Order Tracker
  const fiscalEvent = {
    type: 'order.fiscalized',
    timestamp: new Date().toISOString(),
    companyId: order.companyId,
    brandId: order.brandId,
    payload: {
      orderId,
      orderNumber: order.orderNumber,
      receiptNumber,
      pdfUrl,
      qrCode: qrCodeBase64,
      jobId,
    },
  };

  broadcastToStaff(order.companyId, fiscalEvent as any);
  broadcastToOrder(orderId, fiscalEvent as any);

  return {
    success: true,
    receiptNumber,
    pdfReceiptUrl: pdfUrl,
    qrCodeBase64,
    jobId,
    displayId,
    raw: result,
  };
}

/**
 * Trigger paper print job on thermal printer (SBR-*) via MQTT.
 */
export async function printFiscalJob(options: PrintJobOptions): Promise<{ success: boolean; displayId: string; jobId?: string }> {
  const { companyId, terminalId, printerDeviceId: explicitPrinter, jobId: explicitJobId, orderId } = options;
  const db = getDatabase();

  let targetJobId = explicitJobId;
  let fallbackFiscalDevice: string | null = null;

  if (!targetJobId && orderId) {
    const [ord] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (ord) {
      targetJobId = ord.fiscalJobId || undefined;
      fallbackFiscalDevice = ord.fiscalDeviceId;

      // If not yet fiscalized, run fiscalization with autoPrint = true
      if (!targetJobId && ord.fiscalStatus !== 'issued') {
        const res = await fiscalizeOrder({ orderId, autoPrint: true, terminalId });
        return {
          success: true,
          displayId: res.displayId || 'SBR',
          jobId: res.jobId || undefined,
        };
      }
    }
  }

  if (!targetJobId) {
    throw new Error('Brak numeru zadania druku (jobId) do wydrukowania paragonu.');
  }

  const printerDisplayId = await resolvePrinterDisplayId(companyId, terminalId, explicitPrinter, fallbackFiscalDevice);

  console.log(`[Fiscal Service] Printing job ${targetJobId} on thermal printer ${printerDisplayId}...`);
  await sendMqttCommand(printerDisplayId, `/printer/jobs/print/${encodeURIComponent(targetJobId)}`, 'POST', {}, 15000);

  if (orderId) {
    await db
      .update(fiscalReceipts)
      .set({ printedAt: new Date() })
      .where(eq(fiscalReceipts.orderId, orderId));
  }

  return {
    success: true,
    displayId: printerDisplayId,
    jobId: targetJobId,
  };
}
