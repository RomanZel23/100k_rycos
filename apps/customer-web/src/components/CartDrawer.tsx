'use client';

import React, { useState } from 'react';
import { CartItem, calculateItemTotal, calculateSubtotal } from '../store/cartStore';
import { X, Trash2, Plus, Minus, CreditCard, ChevronRight, FileText } from 'lucide-react';
import { i18n, Language } from '../lib/i18n';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  tableLabel?: string;
  parkingSpot?: string;
  tipAmount: number;
  customerNip?: string;
  ageConsentAccepted?: boolean;
  lang?: Language;
  onUpdateQuantity: (id: string, qty: number) => void;
  onRemoveItem: (id: string) => void;
  onSetTip: (tip: number) => void;
  onSetCustomerNip: (nip: string) => void;
  onSetAgeConsentAccepted?: (accepted: boolean) => void;
  onCheckout: () => void;
}

export function CartDrawer({
  isOpen,
  onClose,
  items,
  tableLabel,
  parkingSpot,
  tipAmount,
  customerNip,
  ageConsentAccepted = false,
  lang = 'pl',
  onUpdateQuantity,
  onRemoveItem,
  onSetTip,
  onSetCustomerNip,
  onSetAgeConsentAccepted,
  onCheckout,
}: CartDrawerProps) {
  if (!isOpen) return null;

  const t = i18n[lang] || i18n.pl;
  const [showNipInput, setShowNipInput] = useState(!!customerNip);
  const subtotal = calculateSubtotal(items);
  const total = subtotal + tipAmount;

  const tipOptions = [0, Math.round(subtotal * 0.1), Math.round(subtotal * 0.15)];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm animate-fade-in overflow-x-hidden">
      <div className="bg-white w-full max-w-lg rounded-t-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden min-w-0">
        {/* Drawer Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <h2 className="font-extrabold text-slate-900 text-lg">{t.cartTitle}</h2>
            <p className="text-xs text-slate-500">
              {tableLabel ? `${t.table}: ${tableLabel}` : parkingSpot ? `${t.parking}: ${parkingSpot}` : t.takeaway}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200"
          >
            <X size={18} />
          </button>
        </div>

        {/* Drawer Content */}
        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          {items.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <span className="text-4xl block mb-2">🛒</span>
              <p className="font-medium">{t.cartEmptyNotice}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="p-3 bg-slate-50 rounded-2xl flex items-center justify-between gap-3"
                >
                  <div className="flex-1">
                    <h4 className="font-bold text-slate-900 text-sm">{item.product.name}</h4>
                    {item.selectedAddons.length > 0 && (
                      <p className="text-xs text-slate-500">
                        {item.selectedAddons.map((a) => a.name).join(', ')}
                      </p>
                    )}
                    {item.specialInstructions && (
                      <p className="text-[11px] text-brand-600 italic mt-0.5">
                        &quot;{item.specialInstructions}&quot;
                      </p>
                    )}
                    <span className="text-xs font-bold text-slate-700 block mt-1">
                      {calculateItemTotal(item).toFixed(2)} zł
                    </span>
                  </div>

                  {/* Quantity Controls */}
                  <div className="flex items-center gap-2 bg-white px-2 py-1 rounded-xl border border-slate-200 shadow-sm">
                    <button
                      onClick={() =>
                        item.quantity > 1
                          ? onUpdateQuantity(item.id, item.quantity - 1)
                          : onRemoveItem(item.id)
                      }
                      className="text-slate-500 hover:text-slate-900 p-1"
                    >
                      {item.quantity === 1 ? <Trash2 size={14} className="text-red-500" /> : <Minus size={14} />}
                    </button>
                    <span className="font-bold text-sm w-4 text-center">{item.quantity}</span>
                    <button
                      onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                      className="text-slate-500 hover:text-slate-900 p-1"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {items.length > 0 && (
            <>
              {/* Gratuity / Napiwek */}
              <div className="pt-2 border-t border-slate-100">
                <span className="text-xs font-bold text-slate-600 block mb-2">{t.serviceTip}</span>
                <div className="grid grid-cols-3 gap-2">
                  {tipOptions.map((tip, idx) => (
                    <button
                      key={idx}
                      onClick={() => onSetTip(tip)}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                        tipAmount === tip
                          ? 'border-brand-500 bg-brand-50 text-brand-700'
                          : 'border-slate-200 text-slate-600'
                      }`}
                    >
                      {tip === 0 ? t.noTip : `+${tip.toFixed(2)} zł`}
                    </button>
                  ))}
                </div>
              </div>

              {/* NIP / Faktura checkbox */}
              <div className="pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNipInput(!showNipInput)}
                  className="flex items-center gap-2 text-xs font-bold text-slate-700"
                >
                  <FileText size={15} className="text-brand-500" />
                  <span>{t.nipOptional}</span>
                </button>

                {showNipInput && (
                  <div className="mt-2 space-y-1">
                    <input
                      type="text"
                      maxLength={10}
                      placeholder={t.nipPlaceholder}
                      value={customerNip || ''}
                      onChange={(e) => onSetCustomerNip(e.target.value.replace(/\D/g, ''))}
                      className="w-full p-2.5 rounded-xl border-2 border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 shadow-sm"
                    />
                    <p className="text-[10px] text-slate-400 font-medium">
                      {lang === 'de'
                        ? '10 Ziffern ohne Bindestriche oder Leerzeichen eingeben'
                        : lang === 'en'
                        ? 'Enter 10 digits without dashes or spaces'
                        : 'Wpisz 10 cyfr NIP bez kresek i spacji'}
                    </p>
                  </div>
                )}
              </div>

              {/* 18+ Age Restriction Consent */}
              {items.some((i) => i.product.isAgeRestricted) && (
                <div className="pt-2 border-t border-slate-100">
                  <div className="p-3.5 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-950 space-y-2.5 shadow-2xs">
                    <div className="flex items-start gap-2.5">
                      <span className="px-2 py-0.5 rounded-md bg-amber-600 text-white font-black text-xs tracking-wider shrink-0 mt-0.5 shadow-2xs">
                        18+
                      </span>
                      <div className="text-xs leading-snug flex-1 min-w-0">
                        <span className="font-extrabold text-amber-950 block">{t.ageRestrictedTitle}</span>
                        <span className="text-amber-900 font-medium text-[11px] block mt-0.5">
                          {t.ageRestrictedCartNotice}
                        </span>
                      </div>
                    </div>

                    <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white border border-amber-300 cursor-pointer select-none active:scale-[0.99] transition-all">
                      <input
                        type="checkbox"
                        checked={ageConsentAccepted}
                        onChange={(e) => onSetAgeConsentAccepted?.(e.target.checked)}
                        className="w-4 h-4 rounded text-brand-500 focus:ring-brand-500 border-slate-300 accent-brand-500 cursor-pointer shrink-0"
                      />
                      <span className="text-xs font-bold text-slate-900 leading-tight flex-1">
                        {t.ageConsentCheckbox}
                      </span>
                    </label>

                    <p className="text-[10px] text-amber-800/80 font-medium">
                      ⚠️ {t.ageRestrictedPickupNotice}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Drawer Footer */}
        {items.length > 0 && (
          <div className="p-4 border-t border-slate-100 bg-white sticky bottom-0 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">{t.totalToPay}</span>
              <span className="text-xl font-extrabold text-slate-900">{total.toFixed(2)} zł</span>
            </div>

            <button
              onClick={onCheckout}
              disabled={items.some((i) => i.product.isAgeRestricted) && !ageConsentAccepted}
              className={`w-full py-4 transition-all text-brand-text font-extrabold rounded-2xl flex items-center justify-center gap-2 shadow-lg text-base ${
                items.some((i) => i.product.isAgeRestricted) && !ageConsentAccepted
                  ? 'bg-slate-200 text-slate-400 shadow-none cursor-not-allowed opacity-75'
                  : 'bg-brand-500 hover:bg-brand-600 active:scale-[0.98] shadow-brand-500/25 cursor-pointer'
              }`}
            >
              <CreditCard size={18} />
              <span>{t.proceedToPayment}</span>
              <ChevronRight size={18} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
