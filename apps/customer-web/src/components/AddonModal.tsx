'use client';

import React, { useState } from 'react';
import { Product, AddonOption } from '@rycos/shared';
import { X, Check } from 'lucide-react';

interface AddonModalProps {
  product: Product | null;
  onClose: () => void;
  onAddToCart: (product: Product, selectedAddons: AddonOption[], instructions?: string) => void;
}

export function AddonModal({ product, onClose, onAddToCart }: AddonModalProps) {
  if (!product) return null;

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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <h2 className="font-extrabold text-slate-900 text-lg">{product.name}</h2>
            <p className="text-brand-600 font-bold text-sm">{product.price.toFixed(2)} zł</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body - Scrollable */}
        <div className="p-5 overflow-y-auto flex-1 space-y-6">
          {product.description && (
            <p className="text-slate-600 text-sm leading-relaxed">{product.description}</p>
          )}

          {/* Add-on Groups */}
          {product.addonGroups.map((group) => (
            <div key={group.id} className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-900 text-sm">{group.name}</h4>
                <span className="text-xs text-slate-400">
                  {group.required ? 'Wymagane' : 'Opcjonalne'}
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
                      className={`w-full p-3 rounded-xl border flex items-center justify-between transition-all ${
                        isSelected
                          ? 'border-brand-500 bg-brand-50/50 text-slate-900'
                          : 'border-slate-200 hover:border-slate-300 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-5 h-5 rounded-md flex items-center justify-center border ${
                            isSelected
                              ? 'bg-brand-500 border-brand-500 text-white'
                              : 'border-slate-300'
                          }`}
                        >
                          {isSelected && <Check size={14} />}
                        </div>
                        <span className="text-sm font-medium">{opt.name}</span>
                      </div>

                      {opt.priceDelta > 0 && (
                        <span className="text-xs font-bold text-slate-600">
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
          <div className="space-y-2">
            <label className="font-bold text-slate-900 text-sm">Uwagi do pozycji</label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="np. bez cebuli, sos osobno..."
              maxLength={200}
              className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none"
              rows={2}
            />
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-100 bg-white sticky bottom-0">
          <button
            onClick={() => {
              onAddToCart(product, selectedAddons, instructions);
              onClose();
            }}
            className="w-full py-3.5 bg-brand-500 hover:bg-brand-600 active:scale-[0.98] transition-all text-white font-extrabold rounded-2xl flex items-center justify-between px-6 shadow-lg shadow-brand-500/25"
          >
            <span>Dodaj do zamówienia</span>
            <span>{finalPrice.toFixed(2)} zł</span>
          </button>
        </div>
      </div>
    </div>
  );
}
