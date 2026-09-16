'use client'

import { useState } from 'react'
import Link from 'next/link'
import QRCode from 'qrcode'
import {
  generatePairingPinAction,
  unpairDeviceAction,
  refreshLicensesAction,
  updateLicenseTokenAction,
  refreshLicenseStatusAction,
} from './actions'

export interface LicensingData {
  company: {
    id: number;
    name: string;
    nip: string | null;
    has_license_token?: boolean;
    token_hint?: string | null;
  };
  integrator: {
    configured: boolean;
    apiKeyPresent: boolean;
    nip: string | null;
    client: {
      id: string;
      name: string;
      nip: string;
    } | null;
    seats: Array<{
      id: string;
      tier: string;
      status: string;
      paired_at: string | null;
      created_at: string;
      devices?: any;
    }>;
    devices: Array<{
      seatId: string;
      tier: string;
      seatStatus: string;
      deviceId: string;
      displayId: string;
      deviceName: string;
      lastSeenAt: string | null;
      isOnline: boolean;
      appVersion: string | null;
      model: string | null;
      companionApps: {
        aplikasa?: boolean;
        worldline?: boolean;
        printer?: boolean;
      };
    }>;
    tierSummary: {
      total: number;
      paired: number;
      available: number;
      byTier: Record<string, { total: number; paired: number; available: number }>;
    };
    error?: string | null;
  };
  server_license: {
    checked: boolean;
    configured: boolean;
    solution?: string;
    instance?: string;
    client?: string;
    status?: string;
    valid_until?: string | null;
    grace_days?: number;
    days_left?: number | null;
    fiscal?: {
      seats: number;
      expires_at: string | null;
    };
    checked_at?: string;
    token_hint?: string;
    error?: string | null;
  } | null;
}

const TIER_LABELS: Record<string, { label: string; bg: string; text: string; desc: string }> = {
  rycos_pf: {
    label: 'Pełna (POS + Kasa)',
    bg: 'bg-emerald-50 border-emerald-200',
    text: 'text-emerald-700',
    desc: 'Kasa fiskalna online + SoftPOS + Terminal POS',
  },
  rycos_f: {
    label: 'Fiskalna (Aplikasa)',
    bg: 'bg-blue-50 border-blue-200',
    text: 'text-blue-700',
    desc: 'Kasa wirtualna zintegrowana z MF',
  },
  rycos_p: {
    label: 'Płatnicza (SoftPOS)',
    bg: 'bg-indigo-50 border-indigo-200',
    text: 'text-indigo-700',
    desc: 'Płatności kartą zbliżeniową (PIN on Glass)',
  },
  rycos_0: {
    label: 'Podstawowa (POS)',
    bg: 'bg-neutral-50 border-neutral-200',
    text: 'text-neutral-700',
    desc: 'Ekran zamówień i obsługa sprzedaży',
  },
};

export function LicensesClient({ data }: { data: LicensingData }) {
  const [loadingSeatId, setLoadingSeatId] = useState<string | null>(null);
  const [pinModal, setPinModal] = useState<{ pin: string; expiresAt: string; seatId: string; qrUrl?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // License token management state
  const [tokenModalOpen, setTokenModalOpen] = useState(false);
  const [inputToken, setInputToken] = useState('');
  const [savingToken, setSavingToken] = useState(false);
  const [refreshingLicense, setRefreshingLicense] = useState(false);

  const { company, integrator, server_license } = data;

  const handleSaveToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingToken(true);
    setActionError(null);
    try {
      await updateLicenseTokenAction(inputToken);
      setTokenModalOpen(false);
      setInputToken('');
    } catch (err: any) {
      setActionError(err.message || 'Nie udało się zapisać tokenu');
    } finally {
      setSavingToken(false);
    }
  };

  const handleRefreshLicense = async () => {
    setRefreshingLicense(true);
    setActionError(null);
    try {
      await refreshLicenseStatusAction();
    } catch (err: any) {
      setActionError(err.message || 'Nie udało się odświeżyć statusu licencji');
    } finally {
      setRefreshingLicense(false);
    }
  };

  const handleGeneratePin = async (seatId: string) => {
    setActionError(null);
    setLoadingSeatId(seatId);
    try {
      const res = await generatePairingPinAction(seatId);
      let qrUrl = '';
      try {
        qrUrl = await QRCode.toDataURL(res.pin, {
          width: 200,
          margin: 1,
          color: {
            dark: '#002633',
            light: '#ffffff',
          },
        });
      } catch (qrErr) {
        console.warn('QR code generation error:', qrErr);
      }
      setPinModal({
        pin: res.pin,
        expiresAt: res.expires_at,
        seatId: res.seat_id,
        qrUrl,
      });
      setCopied(false);
    } catch (err: any) {
      setActionError(err.message || 'Nie udało się wygenerować PIN-u');
    } finally {
      setLoadingSeatId(null);
    }
  };

  const handleUnpair = async (seatId: string, displayId: string) => {
    if (!confirm(`Czy na pewno chcesz rozparować urządzenie ${displayId}?`)) {
      return;
    }
    setActionError(null);
    setLoadingSeatId(seatId);
    try {
      await unpairDeviceAction(seatId);
    } catch (err: any) {
      setActionError(err.message || 'Nie udało się rozparować urządzenia');
    } finally {
      setLoadingSeatId(null);
    }
  };

  const handleCopyPin = () => {
    if (!pinModal?.pin) return;
    navigator.clipboard.writeText(pinModal.pin);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Integration & Server License Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Server License Heartbeat Card */}
        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-2xs space-y-3 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Licencja Serwerowa Firmy</span>
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-blue-50 text-techbay-blue border border-blue-100">
                <span className="h-1.5 w-1.5 rounded-full bg-techbay-blue animate-pulse" />
                {server_license?.token_hint || company.token_hint ? `...${server_license?.token_hint || company.token_hint}` : 'Brak tokenu'}
              </span>
            </div>
            <div>
              <div className="text-lg font-bold text-neutral-900">
                {server_license?.status === 'active' ? (
                  <span className="text-emerald-600 flex items-center gap-1.5">
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    Licencja Aktywna
                  </span>
                ) : server_license?.status === 'grace' ? (
                  <span className="text-amber-600 flex items-center gap-1.5">
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500" />
                    Okres karencji ({server_license.days_left ?? 0} dni)
                  </span>
                ) : server_license?.status === 'expired' ? (
                  <span className="text-red-600 flex items-center gap-1.5">
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" />
                    Licencja Wygasła
                  </span>
                ) : server_license?.status === 'revoked' ? (
                  <span className="text-red-600 flex items-center gap-1.5">
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" />
                    Token Unieważniony
                  </span>
                ) : (
                  <span className="text-neutral-500">Wymaga podpięcia tokenu</span>
                )}
              </div>
              <p className="text-xs text-neutral-500 mt-1">
                Portal: <code className="font-mono text-[11px] bg-neutral-100 px-1 py-0.5 rounded">portal.rycos.eu</code>
              </p>
            </div>
            {server_license?.valid_until && (
              <div className="text-xs text-neutral-600 pt-1 border-t border-neutral-100">
                Ważna do: <strong className="text-neutral-900">{new Date(server_license.valid_until).toLocaleDateString('pl-PL')}</strong>
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-neutral-100 flex items-center justify-between gap-2">
            <button
              onClick={() => {
                setInputToken('');
                setTokenModalOpen(true);
              }}
              className="text-xs font-semibold text-techbay-blue hover:underline cursor-pointer flex items-center gap-1"
            >
              🔑 {company.has_license_token || server_license?.token_hint ? 'Zmień token' : 'Wpisz token (sl_...)'}
            </button>
            <button
              onClick={handleRefreshLicense}
              disabled={refreshingLicense}
              className="text-xs text-neutral-500 hover:text-neutral-800 cursor-pointer disabled:opacity-50"
              title="Sprawdź status licencji w Portalu"
            >
              {refreshingLicense ? 'Odświeżanie...' : '⟳ Sprawdź'}
            </button>
          </div>
        </div>

        {/* Company NIP & Account Card */}
        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Podmiot w Portalu</span>
            {integrator.client ? (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                ✓ Powiązany
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                Brak powiązania
              </span>
            )}
          </div>
          <div>
            <div className="text-base font-bold text-neutral-900 truncate">
              {integrator.client?.name || company.name}
            </div>
            <div className="text-xs text-neutral-500 mt-0.5 flex items-center gap-1.5">
              <span>NIP:</span>
              <strong className="font-mono text-neutral-800">{company.nip || 'Nie ustawiono'}</strong>
              <Link href="/dashboard/settings" className="text-techbay-blue hover:underline text-[11px]">
                (edytuj)
              </Link>
            </div>
          </div>
          <div className="text-xs text-neutral-500 pt-1 border-t border-neutral-100 flex justify-between items-center">
            <span>API Integratora:</span>
            <span className="font-medium text-neutral-700">{integrator.apiKeyPresent ? 'Klucz OK' : 'Brak klucza'}</span>
          </div>
        </div>

        {/* Fleet & Seats Summary Card */}
        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Flota Terminali SBR</span>
            <span className="text-xs font-bold text-neutral-900">{integrator.tierSummary.total} slotów</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-emerald-50 p-2.5 text-center flex-1 border border-emerald-100">
              <div className="text-xl font-black text-emerald-700">{integrator.tierSummary.paired}</div>
              <div className="text-[11px] font-medium text-emerald-800">Sparowanych</div>
            </div>
            <div className="rounded-lg bg-blue-50 p-2.5 text-center flex-1 border border-blue-100">
              <div className="text-xl font-black text-techbay-blue">{integrator.tierSummary.available}</div>
              <div className="text-[11px] font-medium text-techbay-blue">Wolnych PIN</div>
            </div>
          </div>
          <div className="text-[11px] text-neutral-400 flex justify-between pt-1 border-t border-neutral-100">
            <span>Urządzenia w sieci:</span>
            <span className="font-semibold text-neutral-700">
              {integrator.devices.filter((d) => d.isOnline).length} online
            </span>
          </div>
        </div>
      </div>

      {/* Error alert if any */}
      {(integrator.error || actionError) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 flex items-start gap-3">
          <span className="text-amber-500 text-lg">⚠️</span>
          <div className="flex-1">
            <p className="font-semibold">Informacja integracji z portalem RYCOS:</p>
            <p className="mt-0.5 text-xs text-amber-700">{actionError || integrator.error}</p>
          </div>
          <button
            onClick={() => refreshLicensesAction()}
            className="rounded-md bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-200 transition"
          >
            Odśwież
          </button>
        </div>
      )}

      {/* Tier Badges Breakdown */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-neutral-900">Rodzaje i pakiety licencji dla firmy (NIP: {company.nip || '—'})</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Object.entries(TIER_LABELS).map(([tierKey, meta]) => {
            const stats = integrator.tierSummary.byTier[tierKey] || { total: 0, paired: 0, available: 0 };
            return (
              <div key={tierKey} className={`rounded-xl border p-4 transition ${meta.bg}`}>
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-bold uppercase tracking-wider ${meta.text}`}>
                    {meta.label}
                  </span>
                  <span className={`rounded-md px-2 py-0.5 text-xs font-black ${meta.text} bg-white/80 shadow-2xs`}>
                    {stats.total} szt.
                  </span>
                </div>
                <p className="mt-1.5 text-[11px] text-neutral-600 leading-tight">{meta.desc}</p>
                <div className="mt-3 flex items-center justify-between text-xs pt-2 border-t border-black/5 font-medium">
                  <span className="text-emerald-800">Sparowane: {stats.paired}</span>
                  <span className="text-blue-800">Wolne: {stats.available}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Seats & Devices Fleet Table */}
      <div className="rounded-xl border border-neutral-200 bg-white shadow-2xs overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-techbay-blue">Miejsca licencyjne i urządzenia SBR-*</h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Zarządzaj parowaniem terminali fiskalnych i płatniczych za pomocą 6-cyfrowego kodu PIN
            </p>
          </div>
          <button
            onClick={() => refreshLicensesAction()}
            className="btn-secondary text-xs py-1.5 px-3"
          >
            ↻ Odśwież status
          </button>
        </div>

        {integrator.seats.length === 0 ? (
          <div className="p-8 text-center text-neutral-400">
            <p className="text-sm">Brak przypisanych slotów licencyjnych w portalu dla tej firmy.</p>
            <p className="text-xs mt-1">Upewnij się, że w portalu <code className="text-neutral-600">portal.rycos.eu</code> zakupiono pakiety dla NIP {company.nip}.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-neutral-100 bg-neutral-50/75 text-xs font-semibold text-neutral-600 uppercase">
                <tr>
                  <th className="py-3 px-4">Pakiet / Tier</th>
                  <th className="py-3 px-4">Urządzenie SBR</th>
                  <th className="py-3 px-4">Status & Sieć</th>
                  <th className="py-3 px-4">Moduły</th>
                  <th className="py-3 px-4 text-right">Akcja parowania</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {integrator.seats.map((seat) => {
                  const d = Array.isArray(seat.devices) ? seat.devices[0] : seat.devices;
                  const tierInfo = TIER_LABELS[seat.tier] || { label: seat.tier, bg: 'bg-neutral-50', text: 'text-neutral-700' };
                  const isPaired = seat.status === 'paired' && d;
                  const isLoading = loadingSeatId === seat.id;
                  const lastSeen = d?.last_seen_at ? new Date(d.last_seen_at).toLocaleTimeString('pl-PL') : null;
                  const info = d?.device_info || {};

                  return (
                    <tr key={seat.id} className="hover:bg-neutral-50/50 transition">
                      <td className="py-3.5 px-4">
                        <span className={`inline-block rounded-md px-2.5 py-1 text-xs font-bold border ${tierInfo.bg} ${tierInfo.text}`}>
                          {tierInfo.label}
                        </span>
                        <div className="text-[10px] text-neutral-400 mt-1 font-mono">{seat.id.slice(0, 8)}...</div>
                      </td>

                      <td className="py-3.5 px-4">
                        {isPaired ? (
                          <div>
                            <div className="font-mono font-bold text-techbay-blue text-sm">
                              {d.display_id}
                            </div>
                            <div className="text-xs text-neutral-600">
                              {d.device_name || info.model || 'Terminal Android'}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-neutral-400 italic">Brak sparowanego urządzenia</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        {isPaired ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full bg-emerald-500" />
                              <span className="text-xs font-semibold text-emerald-800">Sparowany</span>
                            </div>
                            {lastSeen && (
                              <div className="text-[11px] text-neutral-400">Ostatnio widziany: {lastSeen}</div>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold bg-blue-50 text-techbay-blue border border-blue-200">
                            Wolny slot
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        {isPaired ? (
                          <div className="flex flex-wrap gap-1 text-[11px]">
                            {seat.tier.includes('f') && (
                              <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-medium text-neutral-700">
                                🧾 Fiskalny
                              </span>
                            )}
                            {seat.tier.includes('p') && (
                              <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-medium text-neutral-700">
                                💳 SoftPOS
                              </span>
                            )}
                            {info.app_version && (
                              <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-neutral-500">
                                v{info.app_version}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-neutral-400">—</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        {isPaired ? (
                          <button
                            disabled={isLoading}
                            onClick={() => handleUnpair(seat.id, d.display_id)}
                            className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 transition disabled:opacity-50"
                          >
                            {isLoading ? 'Rozparowywanie...' : 'Rozparuj'}
                          </button>
                        ) : (
                          <button
                            disabled={isLoading}
                            onClick={() => handleGeneratePin(seat.id)}
                            className="btn-brand text-xs py-1.5 px-3 font-bold"
                          >
                            {isLoading ? 'Generowanie...' : '⚡ Generuj PIN parowania'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pairing PIN & QR Modal */}
      {pinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4 animate-in fade-in zoom-in duration-150 max-h-[90vh] overflow-y-auto">
            <div className="text-center space-y-1">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl">
                📱
              </span>
              <h3 className="text-lg font-black text-techbay-blue">Parowanie urządzenia</h3>
              <p className="text-xs text-neutral-500">
                Wpisz 6-cyfrowy PIN lub <strong>zeskanuj kod QR</strong> skanerem w aplikacji <strong>RYCOS POS / SBR</strong>.
              </p>
            </div>

            {/* PIN Code Box */}
            <div className="rounded-xl bg-neutral-50 border-2 border-dashed border-techbay-blue/30 p-4 text-center space-y-1.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                Jednorazowy Kod PIN
              </div>
              <div className="font-mono text-4xl font-black tracking-widest text-techbay-blue">
                {pinModal.pin}
              </div>
              <p className="text-xs text-amber-700 font-medium">
                Ważny przez 10 minut (do {new Date(pinModal.expiresAt).toLocaleTimeString('pl-PL')})
              </p>
            </div>

            {/* QR Code Box */}
            {pinModal.qrUrl && (
              <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-4 text-center space-y-2 flex flex-col items-center">
                <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-600 flex items-center gap-1.5">
                  <span>📷</span> Szybkie parowanie skanerem QR
                </div>
                <div className="p-2.5 bg-white rounded-xl border border-neutral-200 shadow-xs">
                  <img
                    src={pinModal.qrUrl}
                    alt={`Kod QR do PIN ${pinModal.pin}`}
                    className="w-44 h-44 object-contain mx-auto"
                  />
                </div>
                <p className="text-[11px] text-neutral-400">
                  W aplikacji wybierz <em>„Skanuj kod QR”</em> na ekranie logowania/parowania
                </p>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleCopyPin}
                className="flex-1 rounded-lg bg-techbay-blue py-2.5 text-sm font-bold text-white hover:bg-techbay-blue-dark transition cursor-pointer"
              >
                {copied ? '✓ Skopiowano PIN!' : 'Kopiuj PIN'}
              </button>
              <button
                onClick={() => setPinModal(null)}
                className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-100 transition cursor-pointer"
              >
                Zamknij
              </button>
            </div>
          </div>
        </div>
      )}

      {/* License Token Management Modal */}
      {tokenModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl space-y-5 animate-in fade-in zoom-in duration-150">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <h3 className="text-lg font-black text-techbay-blue">Token Licencji Serwerowej (Instance Token)</h3>
                <p className="text-xs text-neutral-500">
                  Firma: <strong>{company.name}</strong> (NIP: {company.nip || 'brak'})
                </p>
              </div>
              <button
                onClick={() => setTokenModalOpen(false)}
                className="text-neutral-400 hover:text-neutral-700 text-lg p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveToken} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-neutral-700">
                  Wklej token instancji z Portalu RYCOS (prefiks: <code className="font-mono text-brand">sl_...</code>)
                </label>
                <textarea
                  required
                  rows={3}
                  value={inputToken}
                  onChange={(e) => setInputToken(e.target.value)}
                  placeholder="sl_i5nsd0iDS-PMD_05VrEWy9oPHD_b4t7oD49yZd7-byI"
                  className="w-full rounded-xl border border-neutral-300 p-3 font-mono text-xs text-neutral-900 focus:border-techbay-blue focus:ring-1 focus:ring-techbay-blue focus:outline-none"
                />
                <p className="text-[11px] text-neutral-500">
                  Token generowany jest w Portalu RYCOS (<strong>portal.rycos.eu</strong>) w karcie klienta w sekcji <em>Server licenses</em> lub automatycznie podczas zakupu na <em>100k.rycos.eu/go</em>.
                </p>
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setTokenModalOpen(false)}
                  className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-100 transition"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  disabled={savingToken || !inputToken.trim()}
                  className="rounded-lg bg-techbay-blue px-5 py-2.5 text-sm font-bold text-white hover:bg-techbay-blue-dark transition disabled:opacity-50"
                >
                  {savingToken ? 'Zapisywanie i weryfikacja...' : 'Zapisz i aktywuj'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
