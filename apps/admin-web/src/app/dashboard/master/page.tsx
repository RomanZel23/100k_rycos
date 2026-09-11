import { adminApiData } from '@/lib/api';
import { MasterCompaniesTable } from './MasterCompaniesTable';

interface MasterOverviewData {
  totalCompanies: number;
  activeCompanies: number;
  totalOrders: number;
  totalVolume: number;
  signups7d: number;
  companies: {
    id: number;
    name: string;
    nip: string | null;
    country: string;
    currency: string;
    status: string;
    createdAt: string;
    ordersCount: number;
    totalVolume: number;
  }[];
}

export const revalidate = 0;

export default async function MasterSaasPage() {
  const data = await adminApiData<MasterOverviewData>('/master/overview');

  const fallbackData: MasterOverviewData = {
    totalCompanies: data?.totalCompanies ?? 1,
    activeCompanies: data?.activeCompanies ?? 1,
    totalOrders: data?.totalOrders ?? 0,
    totalVolume: data?.totalVolume ?? 0,
    signups7d: data?.signups7d ?? 1,
    companies: data?.companies ?? [
      {
        id: 1,
        name: 'Główna Restauracja RYCOS (HQ)',
        nip: '5252899123',
        country: 'PL',
        currency: 'PLN',
        status: 'active',
        createdAt: new Date().toISOString(),
        ordersCount: 0,
        totalVolume: 0,
      },
    ],
  };

  const overview = data || fallbackData;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
              Platform SaaS Master
            </h1>
            <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-semibold text-purple-700">
              Super-Admin
            </span>
          </div>
          <p className="text-sm text-neutral-500 mt-1">
            Globalne zarządzanie wszystkimi firmami, lokalami i wolumenem sprzedaży w platformie RYCOS Cloud.
          </p>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {/* Total Companies */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Wszystkie Firmy</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-neutral-900">{overview.totalCompanies}</span>
            <span className="text-xs text-neutral-400">tenantów</span>
          </div>
        </div>

        {/* Active Companies */}
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Aktywne Konta</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-emerald-800">{overview.activeCompanies}</span>
            <span className="text-xs text-emerald-600">live</span>
          </div>
        </div>

        {/* Total Orders */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Globalne Zamówienia</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-neutral-900">{overview.totalOrders}</span>
            <span className="text-xs text-neutral-400">transakcji</span>
          </div>
        </div>

        {/* Total Volume */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Łączny Wolumen GMV</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-neutral-900">
              {overview.totalVolume.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-neutral-400">zł</span>
          </div>
        </div>

        {/* 7d Signups */}
        <div className="rounded-2xl border border-purple-200 bg-purple-50/50 p-5 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-purple-700">Rejestracje (7 dni)</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-purple-800">+{overview.signups7d}</span>
            <span className="text-xs text-purple-600">nowych</span>
          </div>
        </div>
      </div>

      {/* Tenants Table Section */}
      <div className="rounded-2xl border border-neutral-200 bg-white shadow-xs overflow-hidden">
        <div className="border-b border-neutral-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-neutral-900">Rejestr Tenantów (Klienci B2B)</h2>
            <p className="text-xs text-neutral-500">Lista podmiotów zarejestrowanych w systemie wielotenantowym</p>
          </div>
          <span className="rounded-lg bg-neutral-100 px-3 py-1 font-mono text-xs text-neutral-600 font-bold">
            {overview.companies.length} firm
          </span>
        </div>

        <MasterCompaniesTable initialCompanies={overview.companies} />
      </div>
    </div>
  );
}
