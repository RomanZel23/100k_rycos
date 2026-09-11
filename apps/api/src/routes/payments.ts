import { FastifyInstance } from 'fastify';
import { InitiatePaymentRequestSchema } from '@rycos/shared';
import { processPayment } from '../services/paymentService.js';

export async function paymentRoutes(fastify: FastifyInstance) {
  // POST /v1/payments/initiate - Initiate payment (BLIK / Card / Mobile Pay)
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
}
