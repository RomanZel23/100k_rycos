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
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <h2 className="font-black text-slate-900 text-xl tracking-tight">{t.cartTitle}</h2>
            <p className="text-xs sm:text-sm text-slate-500 font-medium">
              {tableLabel ? `${t.table}: ${tableLabel}` : parkingSpot ? `${t.parking}: ${parkingSpot}` : t.takeaway}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 active:scale-95 transition-transform"
          >
            <X size={20} />
          </button>
        </div>

        {/* Drawer Content */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
          {items.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <span className="text-5xl block mb-3">🛒</span>
              <p className="font-bold text-base">{t.cartEmptyNotice}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="p-3.5 bg-slate-50 rounded-2xl flex items-center justify-between gap-3 border border-slate-100"
                >
                  <div className="flex-1 min-w-0">
                    <h4 className="font-black text-slate-900 text-base leading-snug">{item.product.name}</h4>
                    {item.selectedAddons.length > 0 && (
                      <p className="text-xs sm:text-sm text-slate-600 font-semibold mt-0.5">
                        {item.selectedAddons.map((a) => a.name).join(', ')}
                      </p>
                    )}
                    {item.specialInstructions && (
                      <p className="text-xs text-brand-700 italic font-semibold mt-0.5">
                        &quot;{item.specialInstructions}&quot;
                      </p>
                    )}
                    <span className="text-sm sm:text-base font-black text-slate-900 font-mono block mt-1">
                      {calculateItemTotal(item).toFixed(2)} zł
                    </span>
                  </div>

                  {/* Quantity Controls */}
                  <div className="flex items-center gap-2 bg-white px-2.5 py-1.5 rounded-xl border border-slate-200 shadow-sm shrink-0">
                    <button
                      onClick={() =>
                        item.quantity > 1
                          ? onUpdateQuantity(item.id, item.quantity - 1)
                          : onRemoveItem(item.id)
                      }
                      className="text-slate-600 hover:text-slate-950 p-1.5 active:scale-95 transition-transform"
                    >
                      {item.quantity === 1 ? <Trash2 size={16} className="text-red-500" /> : <Minus size={16} />}
                    </button>
                    <span className="font-black text-base w-6 text-center">{item.quantity}</span>
                    <button
                      onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                      className="text-slate-600 hover:text-slate-950 p-1.5 active:scale-95 transition-transform"
                    >
                      <Plus size={16} />
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
                <span className="text-xs sm:text-sm font-black text-slate-700 block mb-2">{t.serviceTip}</span>
                <div className="grid grid-cols-3 gap-2">
                  {tipOptions.map((tip, idx) => (
                    <button
                      key={idx}
                      onClick={() => onSetTip(tip)}
                      className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-black border transition-all ${
                        tipAmount === tip
                          ? 'border-brand-500 bg-brand-50 text-brand-700 shadow-xs'
                          : 'border-slate-200 text-slate-700 bg-white hover:bg-slate-50'
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
                  className="flex items-center gap-2 text-xs sm:text-sm font-black text-slate-800"
                >
                  <FileText size={16} className="text-brand-500" />
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
                      className="w-full p-3 rounded-xl border-2 border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 text-base font-mono font-bold focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 shadow-sm"
                    />
                    <p className="text-xs text-slate-500 font-medium">
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
                  <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-950 space-y-2.5 shadow-2xs">
                    <div className="flex items-start gap-2.5">
                      <span className="px-2.5 py-0.5 rounded-md bg-amber-600 text-white font-black text-xs tracking-wider shrink-0 mt-0.5 shadow-2xs">
                        18+
                      </span>
                      <div className="text-xs sm:text-sm leading-snug flex-1 min-w-0">
                        <span className="font-black text-amber-950 block">{t.ageRestrictedTitle}</span>
                        <span className="text-amber-900 font-medium text-xs block mt-0.5">
                          {t.ageRestrictedCartNotice}
                        </span>
                      </div>
                    </div>

                    <label className="flex items-center gap-2.5 p-3 rounded-xl bg-white border border-amber-300 cursor-pointer select-none active:scale-[0.99] transition-all">
                      <input
                        type="checkbox"
                        checked={ageConsentAccepted}
                        onChange={(e) => onSetAgeConsentAccepted?.(e.target.checked)}
                        className="w-5 h-5 rounded text-brand-500 focus:ring-brand-500 border-slate-300 accent-brand-500 cursor-pointer shrink-0"
                      />
                      <span className="text-xs sm:text-sm font-bold text-slate-900 leading-tight flex-1">
                        {t.ageConsentCheckbox}
                      </span>
                    </label>

                    <p className="text-xs text-amber-800 font-medium">
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
          <div className="p-4 sm:p-5 border-t border-slate-100 bg-white sticky bottom-0 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-bold text-sm sm:text-base">{t.totalToPay}</span>
              <span className="text-2xl font-black text-slate-950 font-mono">{total.toFixed(2)} zł</span>
            </div>

            <button
              onClick={onCheckout}
              disabled={items.some((i) => i.product.isAgeRestricted) && !ageConsentAccepted}
              className={`w-full py-4.5 min-h-[58px] transition-all text-brand-text font-black rounded-2xl flex items-center justify-center gap-2.5 shadow-xl text-base sm:text-lg ${
                items.some((i) => i.product.isAgeRestricted) && !ageConsentAccepted
                  ? 'bg-slate-200 text-slate-400 shadow-none cursor-not-allowed opacity-75'
                  : 'bg-brand-500 hover:bg-brand-600 active:scale-[0.98] shadow-brand-500/25 cursor-pointer'
              }`}
            >
              <CreditCard size={20} />
              <span>{t.proceedToPayment}</span>
              <ChevronRight size={20} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
