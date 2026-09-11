import { Product, AddonOption } from '@rycos/shared';

export interface CartItem {
  id: string; // unique item uuid (product + specific selected addons)
  product: Product;
  quantity: number;
  selectedAddons: AddonOption[];
  specialInstructions?: string;
}

export interface CartState {
  items: CartItem[];
  tableLabel?: string;
  parkingSpot?: string;
  tipAmount: number;
  customerNip?: string;
  addItem: (product: Product, addons?: AddonOption[], instructions?: string) => void;
  removeItem: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  setTip: (tip: number) => void;
  setTableLabel: (label: string) => void;
  setParkingSpot: (spot: string) => void;
  setCustomerNip: (nip: string) => void;
  clearCart: () => void;
}

// Lightweight in-memory state with LocalStorage persistence
const CART_STORAGE_KEY = 'rycos_customer_cart';

export function getStoredCart(): { items: CartItem[]; tipAmount: number; tableLabel?: string; parkingSpot?: string; customerNip?: string } {
  if (typeof window === 'undefined') return { items: [], tipAmount: 0 };
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    return raw ? JSON.parse(raw) : { items: [], tipAmount: 0 };
  } catch {
    return { items: [], tipAmount: 0 };
  }
}

export function saveCartToStorage(data: any) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

export function calculateItemTotal(item: CartItem): number {
  const addonsTotal = item.selectedAddons.reduce((sum, a) => sum + a.priceDelta, 0);
  return (item.product.price + addonsTotal) * item.quantity;
}

export function calculateSubtotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + calculateItemTotal(item), 0);
}
