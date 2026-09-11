import { getDatabase, orders, outboxEvents } from '@rycos/database';
import { eq } from 'drizzle-orm';
import { InitiatePaymentRequest, InitiatePaymentResponse } from '@rycos/shared';
import { updateOrderStatus } from './orderEngine.js';

export async function processPayment(input: InitiatePaymentRequest): Promise<InitiatePaymentResponse> {
  const db = getDatabase();

  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, input.orderId))
    .limit(1);

  if (!order) {
    throw new Error(`Order ${input.orderId} not found`);
  }

  if (order.status !== 'pending_payment') {
    return {
      success: true,
      paymentId: order.id,
      status: 'captured',
      message: `Order is already in status: ${order.status}`,
    };
  }

  // Handle Payment Method
  if (input.method === 'blik') {
    if (!input.blikCode || input.blikCode.length !== 6) {
      throw new Error('Valid 6-digit BLIK code is required');
    }

    // In production, dispatch to Payment Gateway (e.g. Saferpay / Przelewy24 / PayU).
    // Here we transition order to 'paid' and trigger outbox fiscalization.
    await updateOrderStatus(order.id, 'paid');

    await db
      .update(orders)
      .set({
        paymentMethod: 'blik',
        paymentStatus: 'confirmed',
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id));

    return {
      success: true,
      paymentId: order.id,
      status: 'captured',
      message: 'BLIK payment successfully confirmed',
    };
  }

  if (input.method === 'card' || input.method === 'apple_pay' || input.method === 'google_pay') {
    // Card / Mobile Wallet payment
    await updateOrderStatus(order.id, 'paid');

    await db
      .update(orders)
      .set({
        paymentMethod: input.method,
        paymentStatus: 'confirmed',
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id));

    return {
      success: true,
      paymentId: order.id,
      status: 'captured',
      message: `${input.method.toUpperCase()} payment successfully captured`,
    };
  }

  // Cash / Pay at counter
  return {
    success: true,
    paymentId: order.id,
    status: 'pending_user_action',
    message: 'Please pay at the counter / to the waiter',
  };
}
