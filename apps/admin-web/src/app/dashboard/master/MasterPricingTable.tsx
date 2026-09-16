'use client'

import React, { useState } from 'react';
import { updatePricingAction } from './actions';

export interface PricingItem {
  id?: number;
  itemKey?: string;
  item_key?: string;
  title: string;
  description?: string;
  monthlyPricePln?: number;
  monthly_price_pln?: number;
  discount6mPercent?: number;
  discount_6m_percent?: number;
  discount12mPercent?: number;
  discount_12m_percent?: number;
}

export function MasterPricingTable({ initialPricing }: { initialPricing: PricingItem[] }) {
  const [items, setItems] = useState<PricingItem[]>(initialPricing || []);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handlePriceChange = (key: string, val: number) => {
    setItems((prev) =>
      prev.map((item) => {
        const itemKey = item.itemKey || item.item_key;
        if (itemKey === key) {
          return {
            ...item,
            monthlyPricePln: val,
            monthly_price_pln: val,
          };
        }
        return item;
      })
    );
  };

  const handleDiscountChange = (field: 'discount6mPercent' | 'discount12mPercent', val: number) => {
    setItems((prev) =>
      prev.map((item) => ({
        ...item,
        [field]: val,
        ...(field === 'discount6mPercent' ? { discount_6m_percent: val } : { discount_12m_percent: val }),
      }))
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await updatePricingAction(items);
      if (res.success) {
        setMsg({ type: 'success', text: 'Cennik został pomyślnie zaktualizowany!' });
        setTimeout(() => setMsg(null), 3000);
      } else {
        setMsg({ type: 'error', text: res.error || 'Błąd zapisu cennika' });
      }
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Błąd zapisu cennika' });
    } finally {
      setSaving(false);
    }
  };

  const disc6 = items[0]?.discount6mPercent ?? items[0]?.discount_6m_percent ?? 10;
  const disc12 = items[0]?.discount12mPercent ?? items[0]?.discount_12m_percent ?? 20;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-neutral-100 pb-4">
        <div>
          <h3 className="text-sm font-bold text-neutral-900">Cennik sklepu on-line (100k.rycos.eu/go)</h3>
          <p className="text-xs text-neutral-500">
            Zmieniaj stawki bazowe (PLN netto / miesiąc) oraz globalne rabaty okresowe.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-brand text-xs py-1.5 px-4"
          >
            {saving ? 'Zapisywanie...' : 'Zapisz cennik'}
          </button>
        </div>
      </div>

      {msg && (
        <div
          className={`rounded-xl p-3 text-xs font-semibold ${
            msg.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Global discounts bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl bg-neutral-50 p-4 border border-neutral-200">
        <div>
          <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-1">
            Rabat za 6 miesięcy (%)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={100}
              value={disc6}
              onChange={(e) => handleDiscountChange('discount6mPercent', parseInt(e.target.value, 10) || 0)}
              className="input w-32 font-mono text-sm"
            />
            <span className="text-xs text-neutral-500">% zniżki</span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-1">
            Rabat za 12 miesięcy / 1 rok (%)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={100}
              value={disc12}
              onChange={(e) => handleDiscountChange('discount12mPercent', parseInt(e.target.value, 10) || 0)}
              className="input w-32 font-mono text-sm"
            />
            <span className="text-xs text-neutral-500">% zniżki</span>
          </div>
        </div>
      </div>

      {/* Table of products */}
      <div className="overflow-x-auto rounded-xl border border-neutral-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-xs font-semibold text-neutral-600 uppercase border-b border-neutral-200">
            <tr>
              <th className="py-3 px-4">Pakiet / Pozycja</th>
              <th className="py-3 px-4">Klucz systemowy</th>
              <th className="py-3 px-4 text-right">Cena PLN netto / mc</th>
              <th className="py-3 px-4 text-right">Cena 6 m-cy (-{disc6}%)</th>
              <th className="py-3 px-4 text-right">Cena 1 rok (-{disc12}%)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {items.map((item) => {
              const key = (item.itemKey || item.item_key) as string;
              const price = item.monthlyPricePln ?? item.monthly_price_pln ?? 0;
              const price6m = Math.round(price * 6 * (1 - disc6 / 100));
              const price12m = Math.round(price * 12 * (1 - disc12 / 100));

              return (
                <tr key={key} className="hover:bg-neutral-50/50 transition">
                  <td className="py-3.5 px-4">
                    <div className="font-bold text-neutral-900">{item.title}</div>
                    <div className="text-xs text-neutral-500">{item.description}</div>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-xs text-neutral-500">
                    {key}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="inline-flex items-center gap-1.5 justify-end">
                      <input
                        type="number"
                        min={0}
                        value={price}
                        onChange={(e) => handlePriceChange(key, parseInt(e.target.value, 10) || 0)}
                        className="input w-24 text-right font-mono font-bold text-sm py-1"
                      />
                      <span className="text-xs text-neutral-500">zł</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-xs text-neutral-700">
                    {price6m} zł
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-xs font-bold text-brand">
                    {price12m} zł
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
