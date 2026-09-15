'use client';

import React, { useState } from 'react';
import { Bell, Receipt, Utensils, X, CheckCircle2, Loader2 } from 'lucide-react';
import { getApiBaseUrl } from '../lib/api';
import { Language } from '../lib/i18n';

interface ServiceCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  brandId?: number;
  tableLabel?: string;
  parkingSpot?: string;
  lang?: Language;
}

const serviceTranslations = {
  pl: {
    title: 'Wezwij obsługę',
    yourTable: 'Twój stolik',
    table: 'Stolik',
    parking: 'Parking',
    sentTitle: 'Wezwanie wysłane!',
    sentDesc: 'Obsługa została powiadomiona i już zmierza do Twojego',
    option1Title: 'Podejdź do stolika',
    option1Sub: 'Potrzebuję pomocy kelnera lub menu',
    option2Title: 'Poproś o rachunek',
    option2Sub: 'Chcę zapłacić gotówką lub kartą',
    option3Title: 'Sztućce / serwetki / woda',
    option3Sub: 'Drobna prośba do obsługi',
    noteLabel: 'Dodatkowa uwaga (opcjonalnie):',
    notePlaceholder: 'np. płatność kartą, dodatkowy sos',
    sending: 'Wysyłanie...',
    sendButton: 'Wyślij wezwanie do obsługi →',
    sendError: 'Nie udało się wysłać wezwania',
  },
  en: {
    title: 'Call staff',
    yourTable: 'Your table',
    table: 'Table',
    parking: 'Parking spot',
    sentTitle: 'Request sent!',
    sentDesc: 'Staff has been notified and is heading to your',
    option1Title: 'Come to table',
    option1Sub: 'Need waiter assistance or physical menu',
    option2Title: 'Request the bill',
    option2Sub: 'Want to pay with cash or card',
    option3Title: 'Cutlery / napkins / water',
    option3Sub: 'Small request for staff',
    noteLabel: 'Additional note (optional):',
    notePlaceholder: 'e.g. card payment, extra sauce',
    sending: 'Sending...',
    sendButton: 'Send request to staff →',
    sendError: 'Failed to send request',
  },
  de: {
    title: 'Service rufen',
    yourTable: 'Ihr Tisch',
    table: 'Tisch',
    parking: 'Parkplatz',
    sentTitle: 'Anfrage gesendet!',
    sentDesc: 'Das Personal wurde benachrichtigt und kommt zu Ihrem',
    option1Title: 'Zum Tisch kommen',
    option1Sub: 'Brauche Hilfe der Bedienung oder Speisekarte',
    option2Title: 'Rechnung anfordern',
    option2Sub: 'Möchte bar oder mit Karte zahlen',
    option3Title: 'Besteck / Servietten / Wasser',
    option3Sub: 'Kleine Bitte an das Personal',
    noteLabel: 'Zusätzlicher Hinweis (optional):',
    notePlaceholder: 'z.B. Kartenzahlung, extra Sauce',
    sending: 'Wird gesendet...',
    sendButton: 'Anfrage an Personal senden →',
    sendError: 'Anfrage konnte nicht gesendet werden',
  },
};

export function ServiceCallModal({
  isOpen,
  onClose,
  brandId = 1,
  tableLabel,
  parkingSpot,
  lang = 'pl',
}: ServiceCallModalProps) {
  const t = serviceTranslations[lang] || serviceTranslations.pl;
  const [selectedType, setSelectedType] = useState<'call_waiter' | 'request_bill' | 'custom'>('call_waiter');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  if (!isOpen) return null;

  const handleSend = async () => {
    setLoading(true);
    try {
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/v1/orders/service-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId,
          tableLabel,
          parkingSpot,
          serviceType: selectedType,
          note: note.trim() || undefined,
        }),
      });

      if (!res.ok) {
        throw new Error(t.sendError);
      }

      setSent(true);
      setTimeout(() => {
        setSent(false);
        onClose();
      }, 2500);
    } catch (err: any) {
      alert(err.message || t.sendError);
    } finally {
      setLoading(false);
    }
  };

  const spotLabel = tableLabel
    ? `${t.table.toLowerCase()} ${tableLabel}`
    : parkingSpot
    ? `${t.parking.toLowerCase()} ${parkingSpot}`
    : t.yourTable.toLowerCase();

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200 overflow-x-hidden">
      <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl relative min-w-0">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-all"
        >
          <X size={18} />
        </button>

        {sent ? (
          <div className="text-center py-8 space-y-3">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto animate-bounce">
              <CheckCircle2 size={36} />
            </div>
            <h3 className="font-extrabold text-xl text-slate-900">{t.sentTitle}</h3>
            <p className="text-sm text-slate-500">
              {t.sentDesc} {spotLabel}.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-brand-50 text-brand-600">
                  <Bell size={20} />
                </span>
                <h3 className="font-extrabold text-lg text-slate-900">{t.title}</h3>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {tableLabel ? `${t.table}: ${tableLabel}` : parkingSpot ? `${t.parking}: ${parkingSpot}` : t.yourTable}
              </p>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => setSelectedType('call_waiter')}
                className={`w-full p-3.5 rounded-2xl border text-left flex items-center gap-3 transition-all ${
                  selectedType === 'call_waiter'
                    ? 'border-brand-500 bg-brand-50/50 text-slate-900 shadow-xs'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                  <Bell size={18} />
                </div>
                <div>
                  <p className="text-sm font-bold">{t.option1Title}</p>
                  <p className="text-xs text-slate-400">{t.option1Sub}</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedType('request_bill')}
                className={`w-full p-3.5 rounded-2xl border text-left flex items-center gap-3 transition-all ${
                  selectedType === 'request_bill'
                    ? 'border-brand-500 bg-brand-50/50 text-slate-900 shadow-xs'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                  <Receipt size={18} />
                </div>
                <div>
                  <p className="text-sm font-bold">{t.option2Title}</p>
                  <p className="text-xs text-slate-400">{t.option2Sub}</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedType('custom')}
                className={`w-full p-3.5 rounded-2xl border text-left flex items-center gap-3 transition-all ${
                  selectedType === 'custom'
                    ? 'border-brand-500 bg-brand-50/50 text-slate-900 shadow-xs'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                  <Utensils size={18} />
                </div>
                <div>
                  <p className="text-sm font-bold">{t.option3Title}</p>
                  <p className="text-xs text-slate-400">{t.option3Sub}</p>
                </div>
              </button>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">
                {t.noteLabel}
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t.notePlaceholder}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-brand-500"
              />
            </div>

            <button
              onClick={handleSend}
              disabled={loading}
              className="w-full py-3.5 bg-slate-900 hover:bg-black text-white font-extrabold rounded-xl text-sm transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50 shadow-md"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>{t.sending}</span>
                </>
              ) : (
                <span>{t.sendButton}</span>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
