import { z } from 'zod';
import { OrderDetailSchema, OrderStatusSchema } from './orders.js';

export const WSEventTypeSchema = z.enum([
  'order.created',
  'order.status_updated',
  'order.fiscalized',
  'order.pin_verified',
  'pickup.challenge',
  'catalog.updated',
  'device.status',
  'terminal.config_updated',
]);
export type WSEventType = z.infer<typeof WSEventTypeSchema>;

export const WSEventSchema = z.object({
  type: WSEventTypeSchema,
  timestamp: z.string(),
  companyId: z.number(),
  brandId: z.number().nullable().optional(),
  payload: z.any(),
});
export type WSEvent = z.infer<typeof WSEventSchema>;

export const WSOrderCreatedEventSchema = WSEventSchema.extend({
  type: z.literal('order.created'),
  payload: OrderDetailSchema,
});

export const WSOrderStatusUpdatedEventSchema = WSEventSchema.extend({
  type: z.literal('order.status_updated'),
  payload: z.object({
    orderId: z.string().uuid(),
    orderNumber: z.number(),
    status: OrderStatusSchema,
    collectionPin: z.string().length(4),
  }),
});
