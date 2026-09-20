'use client';

import React, { useState } from 'react';
import { Product, AddonOption, AddonGroup } from '@rycos/shared';
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

  const groups = product.addonGroups || [];

  // Which group an option belongs to (options arrive nested per group)
  const groupOfOption = new Map<number, AddonGroup>();
  for (const g of groups) for (const o of g.options) groupOfOption.set(o.id, g);

  const countIn = (list: AddonOption[], group: AddonGroup) =>
    list.filter((o) => groupOfOption.get(o.id)?.id === group.id).length;

  const limitOf = (group: AddonGroup) => {
    if (group.selectionMode === 'single') return 1;
    const max = group.maxSelect || 0;
    return max > 0 ? max : group.options.length || 99;
  };

  const minOf = (group: AddonGroup) => Math.max(group.required ? 1 : 0, group.minSelect || 0);

  const toggleOption = (opt: AddonOption, group: AddonGroup) => {
    setSelectedAddons((prev) => {
      const selected = prev.some((o) => o.id === opt.id);

      if (group.selectionMode === 'single') {
        // Exactly one choice per group: a new pick replaces the previous one
        const withoutGroup = prev.filter((o) => groupOfOption.get(o.id)?.id !== group.id);
        if (selected) return group.required ? prev : withoutGroup;
        return [...withoutGroup, opt];
      }

      if (selected) return prev.filter((o) => o.id !== opt.id);
      if (countIn(prev, group) >= limitOf(group)) return prev; // group already full
      return [...prev, opt];
    });
  };

  const missingGroup = groups.find((g) => countIn(selectedAddons, g) < minOf(g));

  const groupHint = (group: AddonGroup) => {
    const min = minOf(group);
    const limit = limitOf(group);
    const openEnded = limit >= (group.options.length || 99);
    if (group.selectionMode === 'single') return min > 0 ? t.required : t.optional;
    if (min > 0 && !openEnded) return `${t.required} · ${min}-${limit}`;
    if (min > 0) return `${t.required} · min. ${min}`;
    if (!openEnded) return `${t.optional} · max. ${limit}`;
    return t.optional;
  };

  const addonsTotal = selectedAddons.reduce((sum, a) => sum + a.priceDelta, 0);
  const finalPrice = product.price + addonsTotal;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs animate-fade-in p-0 sm:p-4 overflow-x-hidden">
      <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden min-w-0">
        {/* Modal Header */}
        <div className="px-4 py-4 sm:py-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10 min-w-0">
          <div className="min-w-0 flex-1 pr-2">
            <h2 className="font-black text-slate-900 text-lg sm:text-xl truncate">{product.name}</h2>
            <p className="text-brand-600 font-black font-mono text-base">{product.price.toFixed(2)} zł</p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 shrink-0 active:scale-95 transition-transform"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body - Scrollable */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-5 min-w-0">
          {product.description && (
            <p className="text-slate-600 text-sm leading-relaxed font-medium">{product.description}</p>
          )}

          {/* Age Restriction 18+ Disclaimer Banner */}
          {product.isAgeRestricted && (
            <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-950 space-y-2 shadow-2xs">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-md bg-amber-600 text-white font-black text-xs tracking-wider shadow-2xs">
                  18+
                </span>
                <span className="font-black text-sm text-amber-950">
                  {t.ageRestrictedTitle}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-amber-900 leading-relaxed font-medium">
                {t.ageRestrictedDisclaimer}
              </p>
              <p className="text-xs text-amber-800 font-medium pt-1 border-t border-amber-200/60">
                ⚠️ {t.ageRestrictedPickupNotice}
              </p>
            </div>
          )}

          {/* Add-on Groups */}
          {groups.map((group) => (
            <div key={group.id} className="space-y-2.5">
              <div className="flex items-center justify-between gap-2 min-w-0">
                <h4 className="font-black text-slate-900 text-base truncate">{group.name}</h4>
                <span className={`text-xs font-bold shrink-0 ${countIn(selectedAddons, group) < minOf(group) ? 'text-rose-600' : 'text-slate-500'}`}>
                  {groupHint(group)}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2.5">
                {group.options.map((opt) => {
                  const isSelected = selectedAddons.some((o) => o.id === opt.id);
                  const groupFull = !isSelected && group.selectionMode !== 'single' && countIn(selectedAddons, group) >= limitOf(group);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={groupFull}
                      onClick={() => toggleOption(opt, group)}
                      className={`w-full p-3 sm:p-3.5 rounded-2xl border flex items-center justify-between gap-2 transition-all min-w-0 active:scale-[0.99] ${
                        isSelected
                          ? 'border-brand-500 bg-brand-50/50 text-slate-900 shadow-xs cursor-pointer'
                          : groupFull
                          ? 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'
                          : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div
                          className={`w-6 h-6 rounded-lg flex items-center justify-center border shrink-0 ${
                            isSelected
                              ? 'bg-brand-500 border-brand-500 text-brand-text shadow-xs'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {isSelected && <Check size={16} />}
                        </div>
                        <span className="text-sm sm:text-base font-bold text-slate-900 truncate text-left">{opt.name}</span>
                      </div>

                      {opt.priceDelta > 0 && (
                        <span className="text-sm font-black font-mono text-slate-800 shrink-0">
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
            <label className="font-black text-slate-900 text-sm">{t.specialInstructionsLabel}</label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder={t.specialInstructionsPlaceholder}
              maxLength={200}
              className="w-full rounded-2xl border border-slate-200 bg-white text-slate-900 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none placeholder:text-slate-400 font-medium"
              rows={2}
            />
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-100 bg-white sticky bottom-0 shrink-0 space-y-2">
          {missingGroup && (
            <p className="text-xs font-bold text-rose-600 text-center">
              {t.required}: {missingGroup.name}
            </p>
          )}
          <button
            disabled={!!missingGroup}
            onClick={() => {
              if (missingGroup) return;
              onAddToCart(product, selectedAddons, instructions);
              onClose();
            }}
            className={`w-full py-4 min-h-[56px] transition-all text-brand-text font-black rounded-2xl flex items-center justify-between px-5 sm:px-6 text-base sm:text-lg min-w-0 ${
              missingGroup
                ? 'bg-slate-300 cursor-not-allowed'
                : 'bg-brand-500 hover:bg-brand-600 active:scale-[0.98] cursor-pointer shadow-xl shadow-brand-500/25'
            }`}
          >
            <span className="truncate">{t.addToOrder}</span>
            <span className="shrink-0 font-mono font-black">{finalPrice.toFixed(2)} zł</span>
          </button>
        </div>
      </div>
    </div>
  );
}
