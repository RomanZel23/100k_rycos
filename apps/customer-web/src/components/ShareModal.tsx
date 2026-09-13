'use client';

import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { X, Share2, Copy, Check, QrCode } from 'lucide-react';
import { Language } from '../lib/i18n';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  brandName?: string;
  lang?: Language;
}

export function ShareModal({ isOpen, onClose, brandName, lang = 'pl' }: ShareModalProps) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [currentUrl, setCurrentUrl] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = window.location.href;
      setCurrentUrl(url);
      setCanNativeShare(typeof navigator !== 'undefined' && !!navigator.share);

      QRCode.toDataURL(url, {
        width: 240,
        margin: 1,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      })
        .then(setQrUrl)
        .catch(console.error);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(currentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
      const input = document.createElement('input');
      input.value = currentUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: brandName || '100k-RYCOS Menu',
          text: lang === 'de' ? `Schau dir das Menü von ${brandName || 'uns'} an!` : lang === 'en' ? `Check out the menu of ${brandName || 'ours'}!` : `Zobacz menu ${brandName || ''}!`,
          url: currentUrl,
        });
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          console.error(err);
        }
      }
    }
  };

  const titles = {
    pl: { title: 'Udostępnij menu', desc: 'Zeskanuj kod QR lub skopiuj link, aby udostępnić menu znajomemu przy stoliku.', copy: 'Kopiuj link', copied: 'Link skopiowany!', share: 'Udostępnij', close: 'Zamknij' },
    en: { title: 'Share menu', desc: 'Scan the QR code or copy the link to share the menu with friends at your table.', copy: 'Copy link', copied: 'Link copied!', share: 'Share', close: 'Close' },
    de: { title: 'Menü teilen', desc: 'Scannen Sie den QR-Code oder kopieren Sie den Link, um das Menü zu teilen.', copy: 'Link kopieren', copied: 'Link kopiert!', share: 'Teilen', close: 'Schließen' },
  };
  const t = titles[lang] || titles.pl;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 flex flex-col items-center text-center relative animate-in zoom-in-95">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          aria-label={t.close}
        >
          <X size={20} />
        </button>

        <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mb-3">
          <QrCode size={24} />
        </div>

        <h3 className="text-lg font-black text-slate-900">{t.title}</h3>
        {brandName && <p className="text-xs font-bold text-slate-500 mt-0.5">{brandName}</p>}
        <p className="text-xs text-slate-400 mt-2 max-w-xs">{t.desc}</p>

        {/* QR Code Container */}
        <div className="my-5 p-3.5 bg-white rounded-2xl border-2 border-slate-100 shadow-sm flex items-center justify-center">
          {qrUrl ? (
            <img src={qrUrl} alt="QR Code" className="w-48 h-48 object-contain rounded-lg" />
          ) : (
            <div className="w-48 h-48 bg-slate-100 animate-pulse rounded-lg flex items-center justify-center text-xs text-slate-400">
              Generowanie QR...
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="w-full space-y-2">
          {canNativeShare && (
            <button
              onClick={handleNativeShare}
              className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-extrabold flex items-center justify-center gap-2 transition-all active:scale-[0.99] shadow-sm"
            >
              <Share2 size={16} />
              <span>{t.share}</span>
            </button>
          )}

          <button
            onClick={handleCopy}
            className={`w-full py-3 px-4 rounded-xl border text-xs font-extrabold flex items-center justify-center gap-2 transition-all active:scale-[0.99] ${
              copied
                ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800'
            }`}
          >
            {copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
            <span>{copied ? t.copied : t.copy}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
