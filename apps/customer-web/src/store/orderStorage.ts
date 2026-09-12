'use client';

export interface StoredOrder {
  id: string; // Order UUID
  brandId?: number;
  brandName?: string;
  orderNumber: string; // e.g. "#42" or "42"
  orderDate: string; // ISO date string
  status: string; // 'pending_payment' | 'paid' | 'in_progress' | 'ready_to_collect' | 'completed' | 'cancelled'
  totalAmount: number;
  currency: string;
  itemsSummary: string; // e.g. "2x Classic Burger, 1x Frytki"
  itemsCount: number;
  collectionPin?: string | null;
  tableLabel?: string | null;
  parkingSpot?: string | null;
}

const STORAGE_KEY = 'rycos_customer_order_history';
const MAX_STORED_ORDERS = 50;

export function getStoredOrders(): StoredOrder[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (err) {
    console.warn('[OrderStorage] Failed to read order history:', err);
    return [];
  }
}

export function saveStoredOrder(order: StoredOrder): void {
  if (typeof window === 'undefined') return;
  try {
    const current = getStoredOrders();
    // Check if order already exists
    const existingIndex = current.findIndex((o) => o.id === order.id);
    let updated: StoredOrder[];

    if (existingIndex >= 0) {
      // Merge updates
      updated = [...current];
      updated[existingIndex] = {
        ...updated[existingIndex],
        ...order,
      };
    } else {
      // Add to front
      updated = [order, ...current];
    }

    if (updated.length > MAX_STORED_ORDERS) {
      updated = updated.slice(0, MAX_STORED_ORDERS);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

    // Dispatch a custom event so components can react across the app
    window.dispatchEvent(new Event('rycos_order_history_updated'));
  } catch (err) {
    console.warn('[OrderStorage] Failed to save order:', err);
  }
}

export function updateStoredOrderStatus(orderId: string, status: string, collectionPin?: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    const current = getStoredOrders();
    const existingIndex = current.findIndex((o) => o.id === orderId);
    if (existingIndex >= 0) {
      current[existingIndex].status = status;
      if (collectionPin) {
        current[existingIndex].collectionPin = collectionPin;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
      window.dispatchEvent(new Event('rycos_order_history_updated'));
    }
  } catch (err) {
    console.warn('[OrderStorage] Failed to update order status:', err);
  }
}

export function clearStoredOrders(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event('rycos_order_history_updated'));
  } catch (err) {
    console.warn('[OrderStorage] Failed to clear order history:', err);
  }
}
