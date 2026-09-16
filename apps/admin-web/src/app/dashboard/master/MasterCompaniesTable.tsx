'use client';

import React, { useState, useTransition } from 'react';
import type { AdminLocale } from '@/lib/i18n';
import { getTranslation } from '@/lib/i18n';
import { updateCompanyStatusAction, createCompanyAction } from './actions';

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

export function MasterCompaniesTable({ initialCompanies, locale = 'pl' }: { initialCompanies: CompanyRow[]; locale?: AdminLocale }) {
  const [companies, setCompanies] = useState<CompanyRow[]>(initialCompanies);
  const [loadingId, setLoadingId] = useState<number | null>(null);

  // Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  // Form fields
  const [companyName, setCompanyName] = useState('');
  const [nip, setNip] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState('PL');
  const [currency, setCurrency] = useState('PLN');
  const [businessType, setBusinessType] = useState('product');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');

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

  const handleCreateCompany = (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) {
      setFormError(locale === 'pl' ? 'Wprowadź nazwę firmy' : 'Enter company name');
      return;
    }

    setFormError(null);
    startTransition(async () => {
      try {
        const created = await createCompanyAction({
          name: companyName.trim(),
          nip: nip.trim() || undefined,
          email: email.trim() || undefined,
          country: country.trim() || 'PL',
          currency: currency.trim() || 'PLN',
          business_type: businessType,
          address: address.trim() || undefined,
          phone: phone.trim() || undefined,
        });

        const newRow: CompanyRow = {
          id: created.id,
          name: created.name,
          nip: nip.trim() || null,
          country: created.country || country,
          currency: created.currency || currency,
          status: 'active',
          createdAt: created.createdAt || new Date().toISOString(),
          ordersCount: 0,
          totalVolume: 0,
        };

        setCompanies((prev) => [newRow, ...prev]);
        setIsCreateModalOpen(false);

        // Reset form
        setCompanyName('');
        setNip('');
        setEmail('');
        setAddress('');
        setPhone('');
      } catch (err: any) {
        setFormError(err.message || 'Błąd tworzenia firmy');
      }
    });
  };

  return (
    <div>
      {/* Action bar on top of table */}
      <div className="border-b border-neutral-100 bg-neutral-50/50 px-6 py-3 flex items-center justify-between gap-3">
        <span className="text-xs text-neutral-500 font-medium">
          {locale === 'pl' ? 'Wszystkie podmioty w klastrze RYCOS' : 'All tenant accounts in RYCOS cluster'} ({companies.length})
        </span>

        <button
          type="button"
          onClick={() => setIsCreateModalOpen(true)}
          className="rounded-xl bg-brand hover:bg-brand-600 text-white font-bold text-xs px-3.5 py-2 transition-all shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
        >
          <span className="text-sm leading-none font-black">+</span>
          <span>{locale === 'pl' ? 'Dodaj nową firmę' : locale === 'de' ? 'Firma hinzufügen' : 'Add new company'}</span>
        </button>
      </div>

      {companies.length === 0 ? (
        <div className="p-8 text-center text-sm text-neutral-400">
          {getTranslation(locale, 'master.empty', 'Brak firm w systemie.')}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-neutral-700">
            <thead className="bg-neutral-50/70 border-b border-neutral-200 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-6 py-3.5">{getTranslation(locale, 'master.table.company', 'ID / Firma')}</th>
                <th className="px-6 py-3.5">{getTranslation(locale, 'master.table.nip', 'NIP')}</th>
                <th className="px-6 py-3.5">{getTranslation(locale, 'master.table.country_currency', 'Kraj / Waluta')}</th>
                <th className="px-6 py-3.5">{getTranslation(locale, 'master.table.orders', 'Zamówienia')}</th>
                <th className="px-6 py-3.5">{getTranslation(locale, 'master.table.gmv', 'Obrót (GMV)')}</th>
                <th className="px-6 py-3.5">{getTranslation(locale, 'master.table.status', 'Status')}</th>
                <th className="px-6 py-3.5 text-right">{getTranslation(locale, 'master.table.actions', 'Zarządzanie')}</th>
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
                        {locale === 'pl' ? 'Od' : 'Since'}: {new Date(c.createdAt).toLocaleDateString(locale === 'pl' ? 'pl-PL' : locale === 'de' ? 'de-DE' : 'en-US')}
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
                        {isActive ? getTranslation(locale, 'master.status.active', 'Aktywna') : isSuspended ? getTranslation(locale, 'master.status.suspended', 'Zablokowana') : c.status}
                      </span>
                    </td>

                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleStatusToggle(c.id, c.status)}
                        disabled={loadingId === c.id}
                        className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer ${
                          isActive
                            ? 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                            : 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        }`}
                      >
                        {loadingId === c.id
                          ? (locale === 'pl' ? 'Zapis...' : 'Saving...')
                          : isActive
                          ? (locale === 'pl' ? 'Zawieś konto' : locale === 'de' ? 'Konto sperren' : 'Suspend account')
                          : (locale === 'pl' ? 'Aktywuj konto' : locale === 'de' ? 'Konto aktivieren' : 'Activate account')}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: Create Company */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="text-lg font-bold text-neutral-900">
                {locale === 'pl' ? 'Dodaj nową firmę (Tenant)' : 'Create new company account'}
              </h3>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-500 hover:bg-neutral-200"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">
                ⚠️ {formError}
              </div>
            )}

            <form onSubmit={handleCreateCompany} className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-neutral-700 block mb-1">
                  {locale === 'pl' ? 'Nazwa firmy *' : 'Company name *'}
                </label>
                <input
                  type="text"
                  required
                  placeholder={locale === 'pl' ? 'np. Stadion Arena Gastronomia' : 'e.g. Acme Foods'}
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full rounded-xl border border-neutral-300 bg-white p-2.5 text-sm font-semibold text-neutral-900 focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-neutral-700 block mb-1">NIP / Tax ID</label>
                  <input
                    type="text"
                    placeholder="np. 5252899123"
                    value={nip}
                    onChange={(e) => setNip(e.target.value)}
                    className="w-full rounded-xl border border-neutral-300 bg-white p-2.5 text-sm font-semibold text-neutral-900 focus:outline-none focus:ring-2 focus:ring-brand font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-neutral-700 block mb-1">
                    {locale === 'pl' ? 'Adres e-mail' : 'Email'}
                  </label>
                  <input
                    type="email"
                    placeholder="manager@firma.pl"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-neutral-300 bg-white p-2.5 text-sm font-semibold text-neutral-900 focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-neutral-700 block mb-1">
                    {locale === 'pl' ? 'Kraj' : 'Country'}
                  </label>
                  <input
                    type="text"
                    maxLength={4}
                    value={country}
                    onChange={(e) => setCountry(e.target.value.toUpperCase())}
                    className="w-full rounded-xl border border-neutral-300 bg-white p-2.5 text-sm font-semibold text-neutral-900 focus:outline-none focus:ring-2 focus:ring-brand font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-neutral-700 block mb-1">
                    {locale === 'pl' ? 'Waluta' : 'Currency'}
                  </label>
                  <input
                    type="text"
                    maxLength={4}
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                    className="w-full rounded-xl border border-neutral-300 bg-white p-2.5 text-sm font-semibold text-neutral-900 focus:outline-none focus:ring-2 focus:ring-brand font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-neutral-700 block mb-1">
                    {locale === 'pl' ? 'Typ' : 'Type'}
                  </label>
                  <select
                    value={businessType}
                    onChange={(e) => setBusinessType(e.target.value)}
                    className="w-full rounded-xl border border-neutral-300 bg-white p-2.5 text-sm font-semibold text-neutral-900 focus:outline-none focus:ring-2 focus:ring-brand"
                  >
                    <option value="product">Gastronomia / Retail</option>
                    <option value="service">Usługi</option>
                    <option value="ticket">Bilety / Imprezy</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-neutral-700 block mb-1">
                    {locale === 'pl' ? 'Adres siedziby' : 'Address'}
                  </label>
                  <input
                    type="text"
                    placeholder="ul. Główna 1, Warszawa"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full rounded-xl border border-neutral-300 bg-white p-2.5 text-sm font-semibold text-neutral-900 focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-neutral-700 block mb-1">
                    {locale === 'pl' ? 'Telefon' : 'Phone'}
                  </label>
                  <input
                    type="text"
                    placeholder="+48 500 600 700"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full rounded-xl border border-neutral-300 bg-white p-2.5 text-sm font-semibold text-neutral-900 focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-neutral-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-neutral-600 hover:bg-neutral-100 transition-colors"
                >
                  {locale === 'pl' ? 'Anuluj' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 rounded-xl bg-brand hover:bg-brand-600 text-white font-bold text-xs transition-all shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {isPending ? (locale === 'pl' ? 'Tworzenie firmy...' : 'Creating...') : (locale === 'pl' ? 'Utwórz firmę' : 'Create company')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
