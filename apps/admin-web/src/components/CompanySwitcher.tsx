'use client'

import React, { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { switchActiveCompany } from '@/app/dashboard/actions';

export interface CompanyOption {
  id: number;
  name: string;
  slug: string;
  nip?: string | null;
}

interface CompanySwitcherProps {
  companies: CompanyOption[];
  activeCompanyId: number;
  defaultCompanyId: number;
}

export function CompanySwitcher({
  companies,
  activeCompanyId,
  defaultCompanyId,
}: CompanySwitcherProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const isOverridden = activeCompanyId !== defaultCompanyId;
  const currentCompany = companies.find((c) => c.id === activeCompanyId);

  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = parseInt(e.target.value, 10);
    if (isNaN(val)) return;

    startTransition(async () => {
      await switchActiveCompany(val === defaultCompanyId ? null : val);
      router.refresh();
    });
  };

  const handleReset = () => {
    startTransition(async () => {
      await switchActiveCompany(null);
      router.refresh();
    });
  };

  if (!companies || companies.length === 0) {
    return null;
  }

  return (
    <div className={`mx-3 mt-3 rounded-xl border p-2.5 transition ${
      isOverridden
        ? 'border-amber-300 bg-amber-50/60 shadow-2xs'
        : 'border-neutral-200 bg-neutral-50/70'
    }`}>
      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1.5 px-0.5">
        <span className="flex items-center gap-1">
          <span className="text-neutral-500">🏢</span>
          <span>Firma (Tenant)</span>
        </span>
        {isOverridden && (
          <button
            type="button"
            onClick={handleReset}
            disabled={isPending}
            className="text-brand hover:underline font-bold text-[10px] cursor-pointer"
            title="Wróć do firmy domyślnej"
          >
            Reset
          </button>
        )}
      </div>

      <div className="relative">
        <select
          value={activeCompanyId}
          onChange={handleSelect}
          disabled={isPending}
          className={`w-full appearance-none truncate rounded-lg border bg-white px-2.5 py-1.5 pr-7 text-xs font-bold text-techbay-blue shadow-2xs transition focus:outline-none focus:ring-2 focus:ring-techbay-lightblue/30 cursor-pointer ${
            isOverridden ? 'border-amber-300' : 'border-neutral-300'
          }`}
        >
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} (ID: {c.id}){c.id === defaultCompanyId ? ' [Główna]' : ''}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-neutral-400 text-[10px]">
          ▼
        </div>
      </div>

      {isPending && (
        <div className="mt-1.5 flex items-center gap-1 text-[10px] font-medium text-neutral-500 px-0.5">
          <span className="h-1.5 w-1.5 rounded-full bg-brand animate-ping" />
          <span>Przełączanie danych firmy...</span>
        </div>
      )}

      {isOverridden && !isPending && currentCompany && (
        <div className="mt-1.5 flex items-center gap-1 text-[10px] font-semibold text-amber-800 bg-amber-100/70 border border-amber-200 rounded-md px-1.5 py-0.5 truncate">
          <span>👀</span>
          <span className="truncate">Podgląd firmy ID: {activeCompanyId}</span>
        </div>
      )}
    </div>
  );
}
