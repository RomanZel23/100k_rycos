import { orders, sql } from '@rycos/database';

/**
 * The single definition of "an order that brought money in", used by every revenue,
 * commission and order-count figure in the panel (company analytics, billing, Master SaaS).
 *
 * Counted: payment recorded by the POS, the gateway or the card terminal.
 * Not counted: unpaid / open tickets, failed payments, cancelled orders and load tests.
 */
export function paidOrdersOnly() {
  return sql`${orders.paymentStatus} IN ('paid', 'confirmed')
    AND ${orders.status} <> 'cancelled'
    AND ${orders.orderType} <> 'test'`;
}

/** Same rule expressed for a raw SQL query on the `orders` table (no Drizzle column refs). */
export const PAID_ORDERS_RAW_SQL =
  "payment_status IN ('paid', 'confirmed') AND status <> 'cancelled' AND order_type <> 'test'";
