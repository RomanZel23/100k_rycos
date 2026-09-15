'use client';

import React, { useState } from 'react';
import type { AdminLocale } from '@/lib/i18n';

interface Capabilities {
  can_sell?: boolean;
  can_kds?: boolean;
  can_pickup?: boolean;
  has_softpos?: boolean;
  has_printer?: boolean;
}

const ROLE_DEFAULTS: Record<string, Capabilities> = {
  all_in_one: {
    can_sell: true,
    can_kds: true,
    can_pickup: true,
    has_softpos: true,
    has_printer: true,
  },
  pos: {
    can_sell: true,
    can_kds: false,
    can_pickup: true,
    has_softpos: true,
    has_printer: true,
  },
  kds: {
    can_sell: false,
    can_kds: true,
    can_pickup: true,
    has_softpos: false,
    has_printer: false,
  },
  pickup: {
    can_sell: false,
    can_kds: false,
    can_pickup: true,
    has_softpos: false,
    has_printer: false,
  },
  kiosk: {
    can_sell: true,
    can_kds: false,
    can_pickup: false,
    has_softpos: false,
    has_printer: false,
  },
  fiscal_hub: {
    can_sell: false,
    can_kds: false,
    can_pickup: false,
    has_softpos: false,
    has_printer: false,
  },
};

const ROLES: Record<AdminLocale, Array<{ id: string; title: string; desc: string; badge: string }>> = {
  pl: [
    {
      id: 'all_in_one',
      title: '⚡ All-in-One Foodtruck Master',
      desc: 'Kasa POS + Kuchnia KDS + Skaner Wydań + SoftPOS i Drukarka SBR-*',
      badge: 'Zalecane na ladę',
    },
    {
      id: 'pos',
      title: '🖥️ Kasa na Ladzie (POS)',
      desc: 'Sprzedaż bezpośrednia, obsługa gotówki, SoftPOS, druk paragonów',
      badge: 'Tylko sprzedaż',
    },
    {
      id: 'kds',
      title: '🍳 Kuchnia (KDS)',
      desc: 'Ekran zamówień w kuchni / przy grillu, oznaczanie dań jako gotowe',
      badge: 'Dla kucharzy',
    },
    {
      id: 'pickup',
      title: '📱 Skaner Wydań (BYOD)',
      desc: 'Prywatny smartfon pracownika na wydawce, szybkie skanowanie QR',
      badge: 'Mobilne BYOD',
    },
    {
      id: 'kiosk',
      title: '🛎️ Kiosk Samoobsługowy',
      desc: 'Tablet dla klientów na zewnątrz foodtrucka do samodzielnego zamawiania',
      badge: 'Samoobsługa',
    },
    {
      id: 'fiscal_hub',
      title: '🏢 Hub Fiskalny / Manager',
      desc: 'Centralna rejestracja fiskalna w tle (e-paragony / kasa wirtualna)',
      badge: 'Fiskalizacja',
    },
  ],
  en: [
    {
      id: 'all_in_one',
      title: '⚡ All-in-One Foodtruck Master',
      desc: 'POS Counter + Kitchen KDS + Pickup Scanner + SoftPOS & SBR Printer',
      badge: 'Recommended',
    },
    {
      id: 'pos',
      title: '🖥️ Counter POS',
      desc: 'Direct sales, cash handling, SoftPOS card payments, receipt printing',
      badge: 'Sales Only',
    },
    {
      id: 'kds',
      title: '🍳 Kitchen Display (KDS)',
      desc: 'Kitchen/grill order screen, marking dishes ready for pickup',
      badge: 'Kitchen Staff',
    },
    {
      id: 'pickup',
      title: '📱 Pickup Scanner (BYOD)',
      desc: 'Staff personal phone at the pickup window, fast QR scanning',
      badge: 'Mobile BYOD',
    },
    {
      id: 'kiosk',
      title: '🛎️ Self-Order Kiosk',
      desc: 'Customer tablet on the counter or outside for self ordering',
      badge: 'Self Service',
    },
    {
      id: 'fiscal_hub',
      title: '🏢 Fiscal Hub / Manager',
      desc: 'Centralized background fiscalization (e-receipts / virtual register)',
      badge: 'Fiscal Hub',
    },
  ],
  de: [
    {
      id: 'all_in_one',
      title: '⚡ All-in-One Foodtruck Master',
      desc: 'Theken-POS + KDS Küche + Ausgabe-Scanner + SoftPOS & SBR Drucker',
      badge: 'Empfohlen',
    },
    {
      id: 'pos',
      title: '🖥️ Theken-Kasse (POS)',
      desc: 'Direktverkauf, Barzahlung, SoftPOS Kartenzahlung, Belegdruck',
      badge: 'Nur Verkauf',
    },
    {
      id: 'kds',
      title: '🍳 Küchenmonitor (KDS)',
      desc: 'Küchenbildschirm für Bestellungen, Fertigstellung markieren',
      badge: 'Für die Küche',
    },
    {
      id: 'pickup',
      title: '📱 Ausgabe-Scanner (BYOD)',
      desc: 'Mitarbeiter-Smartphone an der Essensausgabe, QR-Scan',
      badge: 'Mobiles BYOD',
    },
    {
      id: 'kiosk',
      title: '🛎️ Selbstbedienungskiosk',
      desc: 'Kundentablet an der Theke für eigenständige Bestellungen',
      badge: 'Selbstbedienung',
    },
    {
      id: 'fiscal_hub',
      title: '🏢 Fiskal-Hub / Manager',
      desc: 'Zentrale Fiskalisierung im Hintergrund (E-Belege / virtuelle Kasse)',
      badge: 'Fiskalisierung',
    },
  ],
};

interface TerminalRoleConfiguratorProps {
  initialRole: string;
  initialCapabilities: Capabilities;
  locale?: AdminLocale;
}

export function TerminalRoleConfigurator({
  initialRole,
  initialCapabilities,
  locale = 'pl',
}: TerminalRoleConfiguratorProps) {
  const [selectedRole, setSelectedRole] = useState(initialRole || 'all_in_one');
  const [caps, setCaps] = useState<Capabilities>(() => {
    if (initialCapabilities && Object.keys(initialCapabilities).length > 0) {
      return initialCapabilities;
    }
    return ROLE_DEFAULTS[initialRole] || ROLE_DEFAULTS.all_in_one;
  });

  const roles = ROLES[locale] || ROLES.pl;

  const handleRoleChange = (roleId: string) => {
    setSelectedRole(roleId);
    const defaults = ROLE_DEFAULTS[roleId] || ROLE_DEFAULTS.all_in_one;
    setCaps({ ...defaults });
  };

  const handleCapToggle = (capKey: keyof Capabilities) => {
    setCaps((prev) => ({
      ...prev,
      [capKey]: !prev[capKey],
    }));
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold text-neutral-900">
          {locale === 'pl' ? '1. Profil i rola stanowiska pracy' : locale === 'de' ? '1. Profil und Rolle des Arbeitsplatzes' : '1. Workstation profile & role'}
        </h2>
        <p className="text-xs text-neutral-500 mt-0.5">
          {locale === 'pl'
            ? 'Wybierz przeznaczenie tego urządzenia. W foodtrucku tablet na ladzie zazwyczaj działa w trybie All-in-One.'
            : locale === 'de'
            ? 'Wählen Sie den Zweck dieses Geräts. Am Foodtruck läuft das Tablet an der Theke meist im All-in-One-Modus.'
            : 'Select the purpose of this workstation. A countertop tablet typically runs in All-in-One mode.'}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {roles.map((r) => {
          const isSelected = selectedRole === r.id;
          return (
            <label
              key={r.id}
              onClick={() => handleRoleChange(r.id)}
              className={`relative flex flex-col justify-between p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                isSelected
                  ? 'border-brand bg-brand/5 shadow-sm ring-1 ring-brand/20'
                  : 'border-neutral-200/80 hover:border-neutral-300 bg-white'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-1 mb-1">
                  <input
                    type="radio"
                    name="role"
                    value={r.id}
                    checked={isSelected}
                    onChange={() => handleRoleChange(r.id)}
                    className="text-brand focus:ring-brand"
                  />
                  <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider bg-neutral-100 px-1.5 py-0.5 rounded">
                    {r.badge}
                  </span>
                </div>
                <div className="font-semibold text-xs text-neutral-900 mt-1">{r.title}</div>
                <div className="text-[11px] text-neutral-500 mt-1 leading-snug">{r.desc}</div>
              </div>
            </label>
          );
        })}
      </div>

      {/* Granular Capabilities */}
      <div className="pt-3 border-t border-neutral-100">
        <span className="text-xs font-semibold text-neutral-700 block mb-2">
          {locale === 'pl' ? 'Włączone moduły i funkcje na tym stanowisku:' : locale === 'de' ? 'Aktivierte Module an diesem Arbeitsplatz:' : 'Enabled workstation modules & capabilities:'}
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
          <label className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
            caps.can_sell ? 'bg-brand/5 border-brand/40 font-medium text-neutral-900' : 'bg-neutral-50/50 border-neutral-200 text-neutral-500'
          }`}>
            <input
              type="checkbox"
              name="cap_sell"
              checked={Boolean(caps.can_sell)}
              onChange={() => handleCapToggle('can_sell')}
              className="rounded text-brand"
            />
            <span>💳 {locale === 'pl' ? 'Sprzedaż (POS)' : locale === 'de' ? 'Verkauf (POS)' : 'Sales (POS)'}</span>
          </label>

          <label className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
            caps.can_kds ? 'bg-brand/5 border-brand/40 font-medium text-neutral-900' : 'bg-neutral-50/50 border-neutral-200 text-neutral-500'
          }`}>
            <input
              type="checkbox"
              name="cap_kds"
              checked={Boolean(caps.can_kds)}
              onChange={() => handleCapToggle('can_kds')}
              className="rounded text-brand"
            />
            <span>🍳 {locale === 'pl' ? 'Kuchnia (KDS)' : locale === 'de' ? 'Küche (KDS)' : 'Kitchen (KDS)'}</span>
          </label>

          <label className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
            caps.can_pickup ? 'bg-brand/5 border-brand/40 font-medium text-neutral-900' : 'bg-neutral-50/50 border-neutral-200 text-neutral-500'
          }`}>
            <input
              type="checkbox"
              name="cap_pickup"
              checked={Boolean(caps.can_pickup)}
              onChange={() => handleCapToggle('can_pickup')}
              className="rounded text-brand"
            />
            <span>📦 {locale === 'pl' ? 'Wydawka (Skaner)' : locale === 'de' ? 'Ausgabe (Scanner)' : 'Pickup (Scanner)'}</span>
          </label>

          <label className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
            caps.has_softpos ? 'bg-brand/5 border-brand/40 font-medium text-neutral-900' : 'bg-neutral-50/50 border-neutral-200 text-neutral-500'
          }`}>
            <input
              type="checkbox"
              name="cap_softpos"
              checked={Boolean(caps.has_softpos)}
              onChange={() => handleCapToggle('has_softpos')}
              className="rounded text-brand"
            />
            <span>📱 {locale === 'pl' ? 'SoftPOS (Karty)' : locale === 'de' ? 'SoftPOS (Karten)' : 'SoftPOS (Cards)'}</span>
          </label>

          <label className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
            caps.has_printer ? 'bg-brand/5 border-brand/40 font-medium text-neutral-900' : 'bg-neutral-50/50 border-neutral-200 text-neutral-500'
          }`}>
            <input
              type="checkbox"
              name="cap_printer"
              checked={Boolean(caps.has_printer)}
              onChange={() => handleCapToggle('has_printer')}
              className="rounded text-brand"
            />
            <span>🖨️ {locale === 'pl' ? 'Druk bonów' : locale === 'de' ? 'Bondruck' : 'Receipt Printer'}</span>
          </label>
        </div>
      </div>
    </div>
  );
}

