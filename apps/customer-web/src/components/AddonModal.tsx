'use client';

import React, { useState } from 'react';
import { Product, AddonOption } from '@rycos/shared';
import { X, Check } from 'lucide-react';
import { i18n, Language } from '../lib/i18n';

interface AddonModalProps {
  product: Product | null;
  onClose: () => void;
  lang?: Language;
  onAddToCart: (product: Product, selectedAddons: AddonOption[], instructions?: string) => void;
}

export function AddonModal({ product, onClose, lang = 'pl', onAddToCart }: AddonModalProps) {
  if (!product) return null;

  const t = i18n[lang] || i18n.pl;
  const [selectedAddons, setSelectedAddons] = useState<AddonOption[]>([]);
  const [instructions, setInstructions] = useState('');

  const toggleOption = (opt: AddonOption, selectionMode: 'single' | 'multiple') => {
    if (selectionMode === 'single') {
      // Replace existing choice in this group
      setSelectedAddons((prev) => [...prev.filter((o) => o.id !== opt.id), opt]);
    } else {
      setSelectedAddons((prev) => {
        const exists = prev.some((o) => o.id === opt.id);
        if (exists) return prev.filter((o) => o.id !== opt.id);
        return [...prev, opt];
      });
    }
  };

  const addonsTotal = selectedAddons.reduce((sum, a) => sum + a.priceDelta, 0);
  const finalPrice = product.price + addonsTotal;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs animate-fade-in p-0 sm:p-4 overflow-x-hidden">
      <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden min-w-0">
        {/* Modal Header */}
        <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10 min-w-0">
          <div className="min-w-0 flex-1 pr-2">
            <h2 className="font-extrabold text-slate-900 text-base sm:text-lg truncate">{product.name}</h2>
            <p className="text-brand-600 font-bold text-sm">{product.price.toFixed(2)} zł</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 shrink-0 active:scale-95 transition-transform"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body - Scrollable */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-5 min-w-0">
          {product.description && (
            <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">{product.description}</p>
          )}

          {/* Age Restriction 18+ Disclaimer Banner */}
          {product.isAgeRestricted && (
            <div className="p-3.5 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-950 space-y-1.5 shadow-2xs">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-amber-600 text-white font-black text-xs tracking-wider shadow-2xs">
                  18+
                </span>
                <span className="font-extrabold text-xs sm:text-sm text-amber-950">
                  {t.ageRestrictedTitle}
                </span>
              </div>
              <p className="text-xs text-amber-900 leading-relaxed font-medium">
                {t.ageRestrictedDisclaimer}
              </p>
              <p className="text-[11px] text-amber-800/90 font-medium pt-1 border-t border-amber-200/60">
                ⚠️ {t.ageRestrictedPickupNotice}
              </p>
            </div>
          )}

          {/* Add-on Groups */}
          {product.addonGroups.map((group) => (
            <div key={group.id} className="space-y-2.5">
              <div className="flex items-center justify-between gap-2 min-w-0">
                <h4 className="font-bold text-slate-900 text-sm truncate">{group.name}</h4>
                <span className="text-xs text-slate-400 shrink-0 font-medium">
                  {group.required ? t.required : t.optional}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {group.options.map((opt) => {
                  const isSelected = selectedAddons.some((o) => o.id === opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => toggleOption(opt, group.selectionMode)}
                      className={`w-full p-2.5 sm:p-3 rounded-xl border flex items-center justify-between gap-2 transition-all min-w-0 cursor-pointer ${
                        isSelected
                          ? 'border-brand-500 bg-brand-50/50 text-slate-900'
                          : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div
                          className={`w-5 h-5 rounded-md flex items-center justify-center border shrink-0 ${
                            isSelected
                              ? 'bg-brand-500 border-brand-500 text-brand-text'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {isSelected && <Check size={14} />}
                        </div>
                        <span className="text-xs sm:text-sm font-medium text-slate-900 truncate text-left">{opt.name}</span>
                      </div>

                      {opt.priceDelta > 0 && (
                        <span className="text-xs font-bold text-slate-700 shrink-0">
                          +{opt.priceDelta.toFixed(2)} zł
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Special Instructions */}
          <div className="space-y-1.5">
            <label className="font-bold text-slate-900 text-xs sm:text-sm">{t.specialInstructionsLabel}</label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder={t.specialInstructionsPlaceholder}
              maxLength={200}
              className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 p-2.5 sm:p-3 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none placeholder:text-slate-400"
              rows={2}
            />
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 sm:p-4 border-t border-slate-100 bg-white sticky bottom-0 shrink-0">
          <button
            onClick={() => {
              onAddToCart(product, selectedAddons, instructions);
              onClose();
            }}
            className="w-full py-3.5 bg-brand-500 hover:bg-brand-600 active:scale-[0.98] transition-all text-brand-text font-extrabold rounded-2xl flex items-center justify-between px-4 sm:px-6 shadow-lg shadow-brand-500/25 text-sm sm:text-base min-w-0 cursor-pointer"
          >
            <span className="truncate">{t.addToOrder}</span>
            <span className="shrink-0 font-mono font-black">{finalPrice.toFixed(2)} zł</span>
          </button>
        </div>
      </div>
    </div>
  );
}
