import { FastifyInstance } from 'fastify';
import { InitiatePaymentRequestSchema } from '@rycos/shared';
import { processPayment, finalizeSaferpayPayment } from '../services/paymentService.js';
import { env } from '../config/env.js';
import { sendHttpError } from '../lib/response.js';
import { rateLimit } from '../lib/rateLimit.js';
import { isUuid } from '../lib/ids.js';

function safeNext(next: string | undefined, orderId: string): string {
  const fallback = `${env.PUBLIC_CUSTOMER_URL}/order/${orderId}`;
  if (!next) return fallback;
  try {
    const base = new URL(env.PUBLIC_CUSTOMER_URL);
    const url = new URL(next, base);
    return url.origin === base.origin ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

function withParam(url: string, key: string, value: string): string {
  const u = new URL(url);
  u.searchParams.set(key, value);
  return u.toString();
}

export async function paymentRoutes(fastify: FastifyInstance) {
  // POST /v1/payments/initiate - Initiate payment (BLIK / Card / Mobile Pay / Cash at counter)
  fastify.post('/v1/payments/initiate', async (req, reply) => {
    const parseResult = InitiatePaymentRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: 'Validation failed', details: parseResult.error.format() });
    }
    if (!(await rateLimit(`payinit:${req.ip}`, 30, 60))) {
      return reply.code(429).send({ error: 'Zbyt wiele prób płatności. Spróbuj za chwilę.' });
    }

    try {
      const result = await processPayment(parseResult.data);
      return reply.send({ data: result });
    } catch (err: any) {
      return sendHttpError(reply, err, 'Payment processing failed');
    }
  });

  // GET /v1/payments/saferpay/return - Customer comes back from Saferpay
  fastify.get('/v1/payments/saferpay/return', async (req, reply) => {
    const { orderId, next } = req.query as { orderId?: string; next?: string };

    if (!orderId || !isUuid(orderId)) {
      return reply.redirect(`${env.PUBLIC_CUSTOMER_URL}/`);
    }
    const target = safeNext(next, orderId);

    try {
      const result = await finalizeSaferpayPayment(orderId);
      if (result.success) {
        return reply.redirect(withParam(target, 'payment_success', 'true'));
      }
      if (result.pending) {
        return reply.redirect(withParam(target, 'payment_pending', 'true'));
      }
      return reply.redirect(withParam(target, 'payment_error', result.error || 'unconfirmed'));
    } catch (err: any) {
      console.error(`[Saferpay:Return] Exception finalizing payment for ${orderId}:`, err);
      return reply.redirect(withParam(target, 'payment_error', 'exception'));
    }
  });

  // Saferpay server-to-server notification (Success/FailNotifyUrl). The payload is NOT trusted:
  // we only use the orderId and re-verify the payment with Saferpay (Assert).
  const webhookHandler = async (req: any, reply: any) => {
    const orderId = (req.query as any)?.orderId || (req.body as any)?.orderId;
    if (!orderId || !isUuid(orderId)) return reply.code(200).send({ status: 'ignored' });
    try {
      const result = await finalizeSaferpayPayment(orderId);
      return reply.code(200).send({ status: result.success ? 'captured' : result.pending ? 'pending' : 'failed' });
    } catch (err: any) {
      console.error('[Saferpay:Webhook] finalize error:', err.message);
      // non-2xx makes Saferpay retry the notification
      return reply.code(500).send({ status: 'error' });
    }
  };
  fastify.post('/v1/payments/saferpay/webhook', webhookHandler);
  fastify.get('/v1/payments/saferpay/webhook', webhookHandler);
}
