'use client';

import React, { useState } from 'react';
import { updateCompanyStatusAction } from './actions';

interface CompanyRow {
  id: number;
  name: string;
  nip: string | null;
  country: string;
  currency: string;
  status: string;
  createdAt: string;
  ordersCount: number;
  totalVolume: number;
}

export function MasterCompaniesTable({ initialCompanies }: { initialCompanies: CompanyRow[] }) {
  const [companies, setCompanies] = useState<CompanyRow[]>(initialCompanies);
  const [loadingId, setLoadingId] = useState<number | null>(null);

  const handleStatusToggle = async (companyId: number, currentStatus: string) => {
    const nextStatus = currentStatus === 'active' ? 'suspended' : 'active';
    setLoadingId(companyId);

    try {
      await updateCompanyStatusAction(companyId, nextStatus);
      setCompanies((prev) =>
        prev.map((c) => (c.id === companyId ? { ...c, status: nextStatus } : c))
      );
    } catch (e: any) {
      alert(`Błąd zmiany statusu: ${e.message}`);
    } finally {
      setLoadingId(null);
    }
  };

  if (companies.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-neutral-400">
        Brak firm w systemie.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm text-neutral-700">
        <thead className="bg-neutral-50/70 border-b border-neutral-200 text-xs font-semibold uppercase tracking-wider text-neutral-500">
          <tr>
            <th className="px-6 py-3.5">ID / Firma</th>
            <th className="px-6 py-3.5">NIP</th>
            <th className="px-6 py-3.5">Kraj / Waluta</th>
            <th className="px-6 py-3.5">Zamówienia</th>
            <th className="px-6 py-3.5">Obrót (GMV)</th>
            <th className="px-6 py-3.5">Status</th>
            <th className="px-6 py-3.5 text-right">Zarządzanie</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {companies.map((c) => {
            const isActive = c.status === 'active';
            const isSuspended = c.status === 'suspended';

            return (
              <tr key={c.id} className="hover:bg-neutral-50/80 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-neutral-400">#{c.id}</span>
                    <span className="font-bold text-neutral-900">{c.name}</span>
                  </div>
                  <span className="text-xs text-neutral-400">
                    Od: {new Date(c.createdAt).toLocaleDateString('pl-PL')}
                  </span>
                </td>

                <td className="px-6 py-4 font-mono text-xs text-neutral-600">
                  {c.nip || '—'}
                </td>

                <td className="px-6 py-4 text-xs font-semibold">
                  <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-neutral-700 font-mono">
                    {c.country} · {c.currency}
                  </span>
                </td>

                <td className="px-6 py-4 font-semibold text-neutral-800">
                  {c.ordersCount}
                </td>

                <td className="px-6 py-4 font-bold text-neutral-900 font-mono">
                  {Number(c.totalVolume).toFixed(2)} {c.currency}
                </td>

                <td className="px-6 py-4">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      isActive
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : isSuspended
                        ? 'bg-red-50 text-red-700 border border-red-200'
                        : 'bg-neutral-100 text-neutral-600 border border-neutral-200'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        isActive ? 'bg-emerald-500' : isSuspended ? 'bg-red-500' : 'bg-neutral-400'
                      }`}
                    />
                    {isActive ? 'Aktywna' : isSuspended ? 'Zablokowana' : c.status}
                  </span>
                </td>

                <td className="px-6 py-4 text-right">
                  <button
                    onClick={() => handleStatusToggle(c.id, c.status)}
                    disabled={loadingId === c.id}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all disabled:opacity-50 ${
                      isActive
                        ? 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                        : 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    }`}
                  >
                    {loadingId === c.id
                      ? 'Zapis...'
                      : isActive
                      ? 'Zawieś konto'
                      : 'Aktywuj konto'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
