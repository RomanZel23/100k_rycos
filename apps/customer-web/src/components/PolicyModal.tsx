'use client';

import React from 'react';
import { X, FileText, ShieldCheck } from 'lucide-react';
import { Language } from '../lib/i18n';

interface PolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'terms' | 'privacy';
  title?: string;
  content: string;
  lang?: Language;
}

export function PolicyModal({ isOpen, onClose, type, title, content, lang = 'pl' }: PolicyModalProps) {
  if (!isOpen) return null;

  const defaultTitles = {
    terms: {
      pl: 'Regulamin',
      en: 'Terms & Conditions',
      de: 'Allgemeine Geschäftsbedingungen',
    },
    privacy: {
      pl: 'Polityka prywatności',
      en: 'Privacy Policy',
      de: 'Datenschutzerklärung',
    },
  };

  const modalTitle = title || defaultTitles[type][lang] || defaultTitles[type].pl;
  const Icon = type === 'privacy' ? ShieldCheck : FileText;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in overflow-x-hidden">
      <div className="bg-white rounded-3xl max-w-lg w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 min-w-0">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
              <Icon size={18} />
            </div>
            <h3 className="text-base font-extrabold text-slate-900">{modalTitle}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            aria-label="Zamknij"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 text-xs text-slate-600 leading-relaxed space-y-3 whitespace-pre-wrap selection:bg-brand-100">
          {content ? (
            content
          ) : (
            <p className="italic text-slate-400">
              {lang === 'de' ? 'Kein Inhalt verfügbar.' : lang === 'en' ? 'No policy content provided.' : 'Brak wprowadzonej treści.'}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold transition-all shadow-xs"
          >
            {lang === 'de' ? 'Schließen' : lang === 'en' ? 'Close' : 'Zamknij'}
          </button>
        </div>
      </div>
    </div>
  );
}
