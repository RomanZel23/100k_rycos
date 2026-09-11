import { z } from 'zod';

export const PaymentMethodSchema = z.enum([
  'blik',
  'card',
  'google_pay',
  'apple_pay',
  'cash',
  'terminal_tap',
]);
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;

export const InitiatePaymentRequestSchema = z.object({
  orderId: z.string().uuid(),
  method: PaymentMethodSchema,
  blikCode: z.string().length(6).regex(/^\d{6}$/).optional(),
  cardToken: z.string().optional(),
  returnUrl: z.string().url().optional(),
});
export type InitiatePaymentRequest = z.infer<typeof InitiatePaymentRequestSchema>;

export const InitiatePaymentResponseSchema = z.object({
  success: z.boolean(),
  paymentId: z.string().uuid(),
  status: z.enum(['authorized', 'captured', 'pending_user_action', 'failed']),
  redirectUrl: z.string().url().nullable().optional(),
  message: z.string().optional(),
});
export type InitiatePaymentResponse = z.infer<typeof InitiatePaymentResponseSchema>;
