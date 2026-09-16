import { adminApiData } from '@/lib/api';
import { currentUser, isManager } from '@/lib/auth';
import { NoAccess } from '@/components/NoAccess';
import { getTranslation } from '@/lib/i18n';
import { getAdminLocale } from '@/lib/i18n-server';
import { MasterCompaniesTable } from './MasterCompaniesTable';
import { MasterPricingTable, type PricingItem } from './MasterPricingTable';

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
  const user = await currentUser();
  if (!isManager(user)) return <NoAccess />;
  const locale = await getAdminLocale();

  const [rawData, rawPricing]: [any, any] = await Promise.all([
    adminApiData('/master/overview'),
    adminApiData<PricingItem[]>('/master/pricing'),
  ]);

  const pricingItems: PricingItem[] = Array.isArray(rawPricing) && rawPricing.length > 0 ? rawPricing : [
    { itemKey: 'platform_100k', title: 'Platforma 100k-RYCOS', description: 'Wysokowydajny silnik zamówień (100k/min), KDS, POS, Master SaaS', monthlyPricePln: 199, discount6mPercent: 10, discount12mPercent: 20 },
    { itemKey: 'rycos_pf', title: 'SBR Pełna (POS + Kasa fiskalna + SoftPOS)', description: 'Wszystko w jednym na terminalu SBR: sprzedaż, e-paragony i płatności zbliżeniowe', monthlyPricePln: 89, discount6mPercent: 10, discount12mPercent: 20 },
    { itemKey: 'rycos_f', title: 'SBR Fiskalna (Aplikasa)', description: 'Wirtualna kasa fiskalna zintegrowana z Centralnym Repozytorium Kas (MF)', monthlyPricePln: 49, discount6mPercent: 10, discount12mPercent: 20 },
    { itemKey: 'rycos_p', title: 'SBR Płatnicza (SoftPOS)', description: 'Akceptacja płatności kartami VISA / MasterCard / Apple Pay / Google Pay (PIN-on-Glass)', monthlyPricePln: 39, discount6mPercent: 10, discount12mPercent: 20 },
    { itemKey: 'rycos_0', title: 'SBR Podstawowa (POS)', description: 'Stanowisko kelnerskie / mobilny terminal zamówień POS', monthlyPricePln: 19, discount6mPercent: 10, discount12mPercent: 20 },
  ];

  const totalCompanies = Number(rawData?.totalCompanies ?? rawData?.total_companies ?? 1);
  const activeCompanies = Number(rawData?.activeCompanies ?? rawData?.active_companies ?? 1);
  const totalOrders = Number(rawData?.totalOrders ?? rawData?.total_orders ?? 0);
  const totalVolume = Number(rawData?.totalVolume ?? rawData?.total_volume ?? 0);
  const signups7d = Number(rawData?.signups7d ?? rawData?.signups_7d ?? 0);

  const rawCompanies = Array.isArray(rawData?.companies) ? rawData.companies : [];
  const companies = rawCompanies.length > 0
    ? rawCompanies.map((c: any) => ({
        id: c.id,
        name: c.name || 'Firma',
        nip: c.nip || null,
        country: c.country || 'PL',
        currency: c.currency || 'PLN',
        status: c.status || (c.isAcceptingOrders !== false ? 'active' : 'suspended'),
        createdAt: c.createdAt || c.created_at || new Date().toISOString(),
        ordersCount: Number(c.ordersCount ?? c.orders_count ?? 0),
        totalVolume: Number(c.totalVolume ?? c.total_volume ?? 0),
      }))
    : [
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
      ];

  const overview: MasterOverviewData = {
    totalCompanies,
    activeCompanies,
    totalOrders,
    totalVolume,
    signups7d,
    companies,
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
              {getTranslation(locale, 'master.title', 'Platform SaaS Master')}
            </h1>
            <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-semibold text-purple-700">
              {getTranslation(locale, 'master.super_admin_badge', 'Super-Admin')}
            </span>
          </div>
          <p className="text-sm text-neutral-500 mt-1">
            {getTranslation(locale, 'master.subtitle', 'Globalne zarządzanie wszystkimi firmami, lokalami i wolumenem sprzedaży w platformie RYCOS Cloud.')}
          </p>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {/* Total Companies */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
            {getTranslation(locale, 'master.kpi.total_companies', 'Wszystkie Firmy')}
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-neutral-900">{overview.totalCompanies}</span>
            <span className="text-xs text-neutral-400">{getTranslation(locale, 'master.kpi.tenants', 'tenantów')}</span>
          </div>
        </div>

        {/* Active Companies */}
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
            {getTranslation(locale, 'master.kpi.active_companies', 'Aktywne Lokale')}
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-emerald-800">{overview.activeCompanies}</span>
            <span className="text-xs text-emerald-600">live</span>
          </div>
        </div>

        {/* Total Orders */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
            {getTranslation(locale, 'master.kpi.total_orders', 'Globalne Zamówienia')}
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-neutral-900">{overview.totalOrders}</span>
            <span className="text-xs text-neutral-400">{getTranslation(locale, 'master.kpi.processed', 'transakcji')}</span>
          </div>
        </div>

        {/* Total Volume */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
            {getTranslation(locale, 'master.kpi.total_volume', 'Łączny Wolumen GMV')}
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-neutral-900">
              {overview.totalVolume.toLocaleString(locale === 'pl' ? 'pl-PL' : locale === 'de' ? 'de-DE' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-neutral-400">zł</span>
          </div>
        </div>

        {/* 7d Signups */}
        <div className="rounded-2xl border border-purple-200 bg-purple-50/50 p-5 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-purple-700">
            {getTranslation(locale, 'master.kpi.signups_7d', 'Rejestracje (7 dni)')}
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-purple-800">+{overview.signups7d}</span>
            <span className="text-xs text-purple-600">{getTranslation(locale, 'master.kpi.last_7d', 'nowych')}</span>
          </div>
        </div>
      </div>

      {/* Tenants Table Section */}
      <div className="rounded-2xl border border-neutral-200 bg-white shadow-xs overflow-hidden">
        <div className="border-b border-neutral-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-neutral-900">
              {locale === 'pl' ? 'Rejestr Tenantów (Klienci B2B)' : locale === 'de' ? 'Mandanten-Register (B2B)' : 'Tenant Directory (B2B)'}
            </h2>
            <p className="text-xs text-neutral-500">
              {locale === 'pl' ? 'Lista podmiotów zarejestrowanych w systemie' : 'List of registered tenant accounts'}
            </p>
          </div>
          <span className="rounded-lg bg-neutral-100 px-3 py-1 font-mono text-xs text-neutral-600 font-bold">
            {overview.companies.length} {locale === 'pl' ? 'firm' : 'accounts'}
          </span>
        </div>

        <MasterCompaniesTable initialCompanies={overview.companies} locale={locale} />
      </div>

      {/* Onboarding Shop Pricing Configuration */}
      <div className="rounded-2xl border border-neutral-200 bg-white shadow-xs overflow-hidden">
        <div className="border-b border-neutral-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-neutral-900">
              {locale === 'pl' ? 'Zarządzanie Cennikiem Sklepu (100k.rycos.eu/go)' : 'Shop Pricing & Discounts'}
            </h2>
            <p className="text-xs text-neutral-500">
              {locale === 'pl' ? 'Stawki abonamentowe, licencje SBR i rabaty czasowe dla nowych klientów' : 'Subscription rates and discounts for self-service checkout'}
            </p>
          </div>
          <span className="rounded-lg bg-brand/10 text-brand px-3 py-1 font-mono text-xs font-bold">
            Live Pricing
          </span>
        </div>

        <MasterPricingTable initialPricing={pricingItems} />
      </div>
    </div>
  );
}

