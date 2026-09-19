import { MenuResponse, CreateOrderRequest, OrderDetail, InitiatePaymentResponse } from '@rycos/shared';

export function getApiBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (envUrl && !envUrl.includes('localhost:8008')) {
    return envUrl;
  }
  if (typeof window !== 'undefined') {
    if (window.location.hostname.includes('rycos.eu')) {
      return 'https://100k-api.rycos.eu';
    }
  }
  return envUrl || 'http://localhost:8000';
}

/**
 * Auth headers of the paired workstation (POS / KDS / Pickup). The terminal token is issued by
 * POST /v1/terminals/claim and is required by all staff endpoints.
 */
export function getTerminalToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem('rycos_terminal');
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    return parsed?.terminal_token || null;
  } catch {
    return null;
  }
}

export function terminalAuthHeaders(): Record<string, string> {
  const token = getTerminalToken();
  return token ? { 'x-terminal-token': token } : {};
}

/** True when a staff request should be retried on the /v1/admin/* twin (route missing on older API). */
export async function isRouteMissing(res: Response): Promise<boolean> {
  if (res.status !== 404) return false;
  const body = await res.clone().json().catch(() => ({} as any));
  return body?.error === 'Not Found' && typeof body?.message === 'string' && body.message.startsWith('Route ');
}

export async function fetchMenu(slug: string, lang: string = 'pl'): Promise<MenuResponse> {
  const apiBase = getApiBaseUrl();
  const query = lang ? `?lang=${encodeURIComponent(lang)}` : '';
  const res = await fetch(`${apiBase}/v1/brands/${slug}/menu${query}`, {
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Failed to load menu: ${res.statusText}`);
  }

  const json = await res.json();
  return json.data;
}

export async function submitOrder(orderData: CreateOrderRequest): Promise<OrderDetail> {
  const apiBase = getApiBaseUrl();
  const res = await fetch(`${apiBase}/v1/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(orderData.idempotencyKey ? { 'Idempotency-Key': orderData.idempotencyKey } : {}),
      ...terminalAuthHeaders(),
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
  const apiBase = getApiBaseUrl();
  const res = await fetch(`${apiBase}/v1/orders/${orderId}`, {
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error('Order not found');
  }

  const json = await res.json();
  return json.data;
}

export async function payWithBlik(orderId: string, blikCode: string): Promise<InitiatePaymentResponse> {
  return initiatePayment(orderId, 'blik', blikCode);
}

export async function initiatePayment(
  orderId: string,
  method: 'blik' | 'apple_pay' | 'google_pay' | 'card' | 'cash',
  blikCode?: string
): Promise<InitiatePaymentResponse> {
  const apiBase = getApiBaseUrl();
  const res = await fetch(`${apiBase}/v1/payments/initiate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId,
      method,
      blikCode: blikCode && blikCode.length === 6 ? blikCode : undefined,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Payment failed');
  }

  const json = await res.json();
  return json.data;
}

export async function fetchOnboardingPricing(): Promise<{
  items: Array<{
    itemKey: string;
    title: string;
    description: string;
    monthlyPricePln: number;
    discount6mPercent: number;
    discount12mPercent: number;
  }>;
  discounts: Record<string, number>;
  vat_rate: number;
  currency: string;
}> {
  const apiBase = getApiBaseUrl();
  const res = await fetch(`${apiBase}/v1/onboarding/pricing`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Nie udało się pobrać cennika');
  const json = await res.json();
  return json.data;
}

export async function checkoutOnboarding(payload: {
  nip: string;
  company_name: string;
  email: string;
  phone?: string;
  address?: string;
  password?: string;
  months: number;
  plan: {
    platform_100k: boolean;
    seats_pf: number;
    seats_f: number;
    seats_p: number;
    seats_0: number;
  };
}): Promise<{
  order_token: string;
  redirect_url: string;
  amount_gross_pln: number;
  amount_net_pln: number;
  months: number;
  discount_percent: number;
}> {
  const apiBase = getApiBaseUrl();
  const res = await fetch(`${apiBase}/v1/onboarding/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || 'Błąd inicjalizacji zamówienia');
  }

  const json = await res.json();
  return json.data;
}

export async function lookupGus(nip: string): Promise<{
  nip: string;
  regon: string;
  name: string;
  street?: string;
  propertyNumber?: string;
  apartmentNumber?: string;
  city: string;
  postalCode: string;
  voivodeship?: string;
  formattedAddress: string;
  statusNip?: string;
}> {
  const apiBase = getApiBaseUrl();
  const res = await fetch(`${apiBase}/v1/onboarding/gus-lookup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nip }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || 'Nie udało się pobrać danych z GUS');
  }

  const json = await res.json();
  return json.data;
}

export async function getOnboardingOrderInfo(orderToken: string): Promise<{
  order_token: string;
  nip: string;
  company_name: string;
  email: string;
  status: string;
  completed: boolean;
}> {
  const apiBase = getApiBaseUrl();
  const res = await fetch(`${apiBase}/v1/onboarding/order-info?order_token=${encodeURIComponent(orderToken)}`, {
    cache: 'no-store',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || 'Nie znaleziono zamówienia');
  }

  const json = await res.json();
  return json.data;
}

export async function finalizeOnboarding(orderToken: string, password?: string): Promise<{
  completed: boolean;
  company_id: number;
  company_name: string;
  nip: string;
  token: string;
  redirect_to: string;
}> {
  const apiBase = getApiBaseUrl();
  const res = await fetch(`${apiBase}/v1/onboarding/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order_token: orderToken, password }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || 'Błąd finalizacji zamówienia');
  }

  const json = await res.json();
  return json.data;
}


