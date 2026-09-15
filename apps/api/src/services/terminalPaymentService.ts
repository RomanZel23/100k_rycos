import mqtt from 'mqtt';
import { randomUUID } from 'crypto';
import { getDatabase, terminals, fiscalDevices, eq, and } from '@rycos/database';
import { env } from '../config/env.js';

export interface TapPaymentRequest {
  companyId?: number;
  terminalId?: string;
  tapDeviceId?: string;
  amountGrosz: number;
  currency?: string;
  reference?: string;
  idPay?: string;
}

export interface TapPaymentCancelRequest {
  companyId?: number;
  terminalId?: string;
  tapDeviceId?: string;
  idPay: string;
}

export interface TapPaymentResult {
  success: boolean;
  result?: string;
  paymentSolutionReference?: string;
  brandName?: string;
  idPay?: string;
  displayId?: string;
  error?: string;
  remark?: string;
  errorCondition?: string;
  raw?: any;
}

/**
 * Resolve target RYCOS display ID (e.g. SBR-C5N34S or SBT-NMLL2M) for card payment.
 */
export async function resolveTapDisplayId(
  companyId?: number,
  terminalId?: string,
  explicitTapDeviceId?: string
): Promise<string> {
  // 1. Explicit tap device ID provided by client
  if (explicitTapDeviceId && explicitTapDeviceId.trim() !== '' && explicitTapDeviceId !== 'self') {
    return explicitTapDeviceId.trim();
  }

  const db = getDatabase();

  // 2. Lookup terminal configuration in DB
  if (terminalId) {
    const cleanTermId = terminalId.trim().toUpperCase();
    const [term] = await db
      .select()
      .from(terminals)
      .where(eq(terminals.terminalId, cleanTermId))
      .limit(1);

    if (term) {
      if (term.tapDeviceId && term.tapDeviceId !== 'self' && term.tapDeviceId.trim() !== '') {
        return term.tapDeviceId.trim();
      }
      if (term.tapDeviceId === 'self' || term.terminalId.startsWith('SBR-') || term.terminalId.startsWith('SBT-')) {
        return term.terminalId;
      }
    }
  }

  // 3. Lookup any registered SBR/SBT terminal or fiscal device for this company
  if (companyId) {
    const companyTerms = await db
      .select()
      .from(terminals)
      .where(eq(terminals.companyId, companyId));

    for (const t of companyTerms) {
      if (t.tapDeviceId && t.tapDeviceId !== 'self' && t.tapDeviceId.trim() !== '') {
        return t.tapDeviceId.trim();
      }
      if (t.terminalId.startsWith('SBR-') || t.terminalId.startsWith('SBT-')) {
        return t.terminalId;
      }
    }

    const companyFiscal = await db
      .select()
      .from(fiscalDevices)
      .where(and(eq(fiscalDevices.companyId, companyId), eq(fiscalDevices.status, 'active')));

    for (const f of companyFiscal) {
      if (f.deviceId.startsWith('SBR-') || f.deviceId.startsWith('SBT-')) {
        return f.deviceId;
      }
    }
  }

  // 4. Default fallback from ENV
  return env.RYCOS_DISPLAY_ID || 'SBT-NMLL2M';
}

/**
 * Request Tap / SoftPOS card payment on physical SBR-* device or RYCOS terminal via MQTT.
 * Synchronous promise: resolves when customer taps card / completes transaction or when declined.
 */
export async function requestTapPayment(params: TapPaymentRequest): Promise<TapPaymentResult> {
  const {
    companyId,
    terminalId,
    tapDeviceId: explicitTap,
    amountGrosz,
    currency = 'PLN',
    reference = `pos-${companyId || 0}-${Date.now()}`,
    idPay = randomUUID(),
  } = params;

  if (!amountGrosz || amountGrosz <= 0) {
    throw new Error('amountGrosz must be a positive integer in grosze');
  }

  const displayId = await resolveTapDisplayId(companyId, terminalId, explicitTap);
  const commandTopic = `rycos/${displayId}/command`;
  const responseTopic = `rycos/${displayId}/response`;
  const commandId = randomUUID();
  const timeoutMs = 60000; // 60s for customer to tap card

  console.log(`[POS Tap Payment] Initiating tap payment on ${displayId} for ${amountGrosz} gr (${currency}), idPay=${idPay}`);

  return new Promise<TapPaymentResult>((resolve, reject) => {
    const client = mqtt.connect({
      host: env.RYCOS_MQTT_HOST,
      port: env.RYCOS_MQTT_PORT,
      protocol: 'mqtts',
      username: env.RYCOS_MQTT_USERNAME,
      password: env.RYCOS_MQTT_PASSWORD,
      clientId: `pos-tap-${randomUUID().slice(0, 8)}`,
      clean: true,
      connectTimeout: 10000,
      reconnectPeriod: 0,
    });

    let settled = false;
    let timer: NodeJS.Timeout | null = null;

    function cleanup(err?: Error | null, result?: TapPaymentResult) {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try {
        client.end(true);
      } catch (_) {}

      if (err) {
        resolve({
          success: false,
          error: err.message,
          remark: err.message,
          idPay,
          displayId,
        });
      } else if (result) {
        resolve(result);
      }
    }

    timer = setTimeout(() => {
      cleanup(new Error(`Przekroczono czas oczekiwania na zbliżenie karty do terminala ${displayId} (timeout 60s)`));
    }, timeoutMs);

    client.on('error', (err) => {
      console.error(`[POS Tap Payment] MQTT connection error:`, err);
      cleanup(new Error(`Błąd połączenia MQTT z terminalem: ${err.message}`));
    });

    client.on('connect', () => {
      client.subscribe(responseTopic, { qos: 1 }, (subErr) => {
        if (subErr) {
          return cleanup(new Error(`Błąd subskrypcji odpowiedzi terminala: ${subErr.message}`));
        }

        const payload = {
          idPay,
          command: 'PAYMENT',
          amount: amountGrosz,
          currency: currency.toUpperCase(),
          reference,
          returnReceipt: false,
        };

        const commandMessage = JSON.stringify({
          id: commandId,
          t_sent: Date.now(),
          action: '/pay',
          method: 'POST',
          payload,
        });

        client.publish(commandTopic, commandMessage, { qos: 1 }, (pubErr) => {
          if (pubErr) {
            return cleanup(new Error(`Błąd wysyłania komendy płatności do terminala ${displayId}: ${pubErr.message}`));
          }
          console.log(`[POS Tap Payment] → Sent /pay command to ${commandTopic} (cmdId: ${commandId}, idPay: ${idPay})`);
        });
      });
    });

    client.on('message', (topic, message) => {
      if (topic !== responseTopic) return;
      try {
        const data = JSON.parse(message.toString());
        if (data.id !== commandId) return; // ignore unrelated messages

        console.log(`[POS Tap Payment] ← Received response from ${displayId}:`, data);

        if (data.status >= 200 && data.status < 300) {
          const res = data.result || {};
          if (res._error || res.result === 'WPI_RESULT_FAILURE') {
            cleanup(null, {
              success: false,
              result: res.result || 'WPI_RESULT_FAILURE',
              errorCondition: res.errorCondition,
              remark: res.remark || 'Płatność kartą odrzucona przez terminal',
              idPay,
              displayId,
              raw: res,
            });
          } else {
            cleanup(null, {
              success: true,
              result: res.result || 'WPI_RESULT_SUCCESS',
              paymentSolutionReference: res.paymentSolutionReference,
              brandName: res.brandName,
              idPay,
              displayId,
              raw: res,
            });
          }
        } else {
          cleanup(null, {
            success: false,
            result: 'WPI_RESULT_FAILURE',
            remark: data.result?.remark || data.result?.message || `Błąd terminala (kod ${data.status})`,
            errorCondition: data.result?.errorCondition,
            idPay,
            displayId,
            raw: data.result,
          });
        }
      } catch (e: any) {
        cleanup(new Error(`Niepoprawny format odpowiedzi z terminala: ${e.message}`));
      }
    });
  });
}

/**
 * Cancel an in-flight Tap-on-Mobile / SBR-* payment transaction.
 */
export async function cancelTapPayment(params: TapPaymentCancelRequest): Promise<{ success: boolean; displayId: string }> {
  const { companyId, terminalId, tapDeviceId: explicitTap, idPay } = params;

  if (!idPay) {
    throw new Error('idPay is required to cancel tap payment');
  }

  const displayId = await resolveTapDisplayId(companyId, terminalId, explicitTap);
  const commandTopic = `rycos/${displayId}/command`;
  const commandId = randomUUID();

  console.log(`[POS Tap Payment] Cancelling payment idPay=${idPay} on ${displayId}`);

  return new Promise<{ success: boolean; displayId: string }>((resolve) => {
    const client = mqtt.connect({
      host: env.RYCOS_MQTT_HOST,
      port: env.RYCOS_MQTT_PORT,
      protocol: 'mqtts',
      username: env.RYCOS_MQTT_USERNAME,
      password: env.RYCOS_MQTT_PASSWORD,
      clientId: `pos-cancel-${randomUUID().slice(0, 8)}`,
      clean: true,
      connectTimeout: 5000,
      reconnectPeriod: 0,
    });

    const payload = {
      idPay,
      command: 'CANCEL_PAYMENT',
      amount: 0,
      currency: 'PLN',
    };

    const commandMessage = JSON.stringify({
      id: commandId,
      t_sent: Date.now(),
      action: '/pay',
      method: 'POST',
      payload,
    });

    client.on('connect', () => {
      client.publish(commandTopic, commandMessage, { qos: 1 }, () => {
        console.log(`[POS Tap Payment] Cancel command published to ${commandTopic}`);
        client.end(true);
        resolve({ success: true, displayId });
      });
    });

    client.on('error', (err) => {
      console.warn(`[POS Tap Payment] Cancel MQTT error:`, err);
      client.end(true);
      resolve({ success: false, displayId });
    });

    setTimeout(() => {
      try { client.end(true); } catch (_) {}
      resolve({ success: true, displayId });
    }, 4000);
  });
}
