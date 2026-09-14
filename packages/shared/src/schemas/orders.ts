import { z } from 'zod';

export const OrderStatusSchema = z.enum([
  'pending_payment',
  'paid',
  'in_progress',
  'ready_to_collect',
  'completed',
  'cancelled',
  'payment_failed',
]);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const OrderTypeSchema = z.enum(['dine_in', 'takeaway', 'parking']);
export type OrderType = z.infer<typeof OrderTypeSchema>;

export const OrderItemAddonSchema = z.object({
  optionId: z.number(),
  name: z.string(),
  priceDelta: z.number().default(0),
});
export type OrderItemAddon = z.infer<typeof OrderItemAddonSchema>;

export const OrderItemInputSchema = z.object({
  productId: z.number(),
  name: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
  taxRate: z.number().default(23),
  ptuCode: z.string().default('a'),
  addons: z.array(OrderItemAddonSchema).default([]),
  specialInstructions: z.string().max(250).optional(),
});
export type OrderItemInput = z.infer<typeof OrderItemInputSchema>;

export const CreateOrderRequestSchema = z.object({
  brandId: z.number(),
  orderType: OrderTypeSchema.default('dine_in'),
  tableLabel: z.string().max(50).nullable().optional(),
  parkingSpot: z.string().max(50).nullable().optional(),
  customerNote: z.string().max(500).nullable().optional(),
  customerNip: z.string().regex(/^\d{10}$/, 'NIP must be exactly 10 digits').nullable().optional(),
  ageConsentAccepted: z.boolean().default(false),
  items: z.array(OrderItemInputSchema).min(1, 'Order must contain at least one item'),
  tipAmount: z.number().nonnegative().default(0),
  paymentMethod: z.enum(['blik', 'card', 'google_pay', 'apple_pay', 'cash', 'terminal_tap']).default('blik'),
  currency: z.string().default('PLN'),
  idempotencyKey: z.string().uuid().optional(),
});
export type CreateOrderRequest = z.infer<typeof CreateOrderRequestSchema>;

export const OrderItemDetailSchema = OrderItemInputSchema.extend({
  id: z.string().uuid().optional(),
  lineTotal: z.number(),
});
export type OrderItemDetail = z.infer<typeof OrderItemDetailSchema>;

export const OrderDetailSchema = z.object({
  id: z.string().uuid(),
  companyId: z.number(),
  brandId: z.number(),
  brandName: z.string(),
  orderNumber: z.number(), // Human-readable sequential daily/company order number, e.g. #42
  collectionPin: z.string().length(4), // 4-digit verification code, e.g. "4819"
  status: OrderStatusSchema,
  orderType: OrderTypeSchema,
  tableLabel: z.string().nullable(),
  parkingSpot: z.string().nullable(),
  customerNip: z.string().nullable(),
  items: z.array(OrderItemDetailSchema),
  subtotalAmount: z.number(),
  tipAmount: z.number(),
  totalAmount: z.number(),
  currency: z.string(),
  paymentMethod: z.string().nullable(),
  paymentStatus: z.enum(['pending', 'confirmed', 'paid', 'failed', 'refunded']).default('pending'),
  fiscalStatus: z.enum(['none', 'pending', 'issued', 'failed']).default('none'),
  fiscalReceiptNumber: z.string().nullable().optional(),
  fiscalPdfUrl: z.string().nullable().optional(),
  showReceiptQr: z.boolean().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type OrderDetail = z.infer<typeof OrderDetailSchema>;

export const UpdateOrderStatusRequestSchema = z.object({
  status: OrderStatusSchema,
  cancellationReason: z.string().max(250).optional(),
});
export type UpdateOrderStatusRequest = z.infer<typeof UpdateOrderStatusRequestSchema>;
