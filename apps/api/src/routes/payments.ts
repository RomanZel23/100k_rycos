import { FastifyInstance } from 'fastify';
import { InitiatePaymentRequestSchema } from '@rycos/shared';
import { processPayment, finalizeSaferpayPayment } from '../services/paymentService.js';
import { env } from '../config/env.js';

export async function paymentRoutes(fastify: FastifyInstance) {
  // POST /v1/payments/initiate - Initiate payment (BLIK / Card / Mobile Pay / Cash)
  fastify.post('/v1/payments/initiate', async (req, reply) => {
    const parseResult = InitiatePaymentRequestSchema.safeParse(req.body);

    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'Validation failed',
        details: parseResult.error.format(),
      });
    }

    try {
      const result = await processPayment(parseResult.data);
      return reply.send({ data: result });
    } catch (err: any) {
      return reply.code(400).send({ error: err.message || 'Payment processing failed' });
    }
  });

  // GET /v1/payments/saferpay/return - Return URL after customer finishes payment on Saferpay
  fastify.get('/v1/payments/saferpay/return', async (req, reply) => {
    const { orderId } = req.query as { orderId?: string };

    if (!orderId) {
      return reply.redirect(`${env.PUBLIC_CUSTOMER_URL}/`);
    }

    console.log(`[Saferpay:Return] Customer returned for orderId: ${orderId}`);

    try {
      const result = await finalizeSaferpayPayment(orderId);
      if (result.success) {
        return reply.redirect(`${env.PUBLIC_CUSTOMER_URL}/order/${orderId}?payment_success=true`);
      } else {
        console.warn(`[Saferpay:Return] Payment finalization returned failure for ${orderId}: ${result.error}`);
        return reply.redirect(`${env.PUBLIC_CUSTOMER_URL}/order/${orderId}?payment_error=${encodeURIComponent(result.error || 'unconfirmed')}`);
      }
    } catch (err: any) {
      console.error(`[Saferpay:Return] Exception finalizing payment for ${orderId}:`, err);
      return reply.redirect(`${env.PUBLIC_CUSTOMER_URL}/order/${orderId}?payment_error=exception`);
    }
  });

  // POST /v1/payments/saferpay/webhook - Asynchronous webhook notification from Saferpay
  fastify.post('/v1/payments/saferpay/webhook', async (req, reply) => {
    console.log(`[Saferpay:Webhook] Received event:`, req.body);
    return reply.code(200).send({ status: 'received' });
  });
}
