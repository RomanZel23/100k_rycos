'use client';

import React, { useState } from 'react';

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

const ROLES = [
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
];

interface TerminalRoleConfiguratorProps {
  initialRole: string;
  initialCapabilities: Capabilities;
}

export function TerminalRoleConfigurator({
  initialRole,
  initialCapabilities,
}: TerminalRoleConfiguratorProps) {
  const [selectedRole, setSelectedRole] = useState(initialRole || 'all_in_one');
  const [caps, setCaps] = useState<Capabilities>(() => {
    if (initialCapabilities && Object.keys(initialCapabilities).length > 0) {
      return initialCapabilities;
    }
    return ROLE_DEFAULTS[initialRole] || ROLE_DEFAULTS.all_in_one;
  });

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
        <h2 className="text-base font-bold text-neutral-900">1. Profil i rola stanowiska pracy</h2>
        <p className="text-xs text-neutral-500 mt-0.5">
          Wybierz przeznaczenie tego urządzenia. W foodtrucku tablet na ladzie zazwyczaj działa w trybie <strong className="text-neutral-700">All-in-One</strong>.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {ROLES.map((r) => {
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
          Włączone moduły i funkcje na tym stanowisku:
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
            <span>💳 Sprzedaż (POS)</span>
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
            <span>🍳 Kuchnia (KDS)</span>
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
            <span>📦 Wydawka (Skaner)</span>
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
            <span>📱 SoftPOS (Karty)</span>
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
            <span>🖨️ Druk bonów</span>
          </label>
        </div>
      </div>
    </div>
  );
}
