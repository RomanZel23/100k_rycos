import { MenuResponse, CreateOrderRequest, OrderDetail, InitiatePaymentResponse } from '@rycos/shared';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8008';

export async function fetchMenu(slug: string): Promise<MenuResponse> {
  const res = await fetch(`${API_BASE}/v1/brands/${slug}/menu`, {
    next: { revalidate: 60 }, // Cache on edge/Next.js for 60 seconds
  });

  if (!res.ok) {
    throw new Error(`Failed to load menu: ${res.statusText}`);
  }

  const json = await res.json();
  return json.data;
}

export async function submitOrder(orderData: CreateOrderRequest): Promise<OrderDetail> {
  const res = await fetch(`${API_BASE}/v1/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(orderData.idempotencyKey ? { 'Idempotency-Key': orderData.idempotencyKey } : {}),
    },
    body: JSON.stringify(orderData),
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new Error(errorJson.error || 'Order placement failed');
  }

  const json = await res.json();
  return json.data;
}

export async function fetchOrder(orderId: string): Promise<OrderDetail> {
  const res = await fetch(`${API_BASE}/v1/orders/${orderId}`, {
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error('Order not found');
  }

  const json = await res.json();
  return json.data;
}

export async function payWithBlik(orderId: string, blikCode: string): Promise<InitiatePaymentResponse> {
  const res = await fetch(`${API_BASE}/v1/payments/initiate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId,
      method: 'blik',
      blikCode,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Payment failed');
  }

  const json = await res.json();
  return json.data;
}
