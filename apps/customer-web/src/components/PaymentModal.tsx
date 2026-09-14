'use client';

import React, { useState } from 'react';
import { X, Smartphone, CreditCard, Banknote, Loader2, CheckCircle2 } from 'lucide-react';
import { initiatePayment } from '../lib/api';
import { useRouter } from 'next/navigation';
import { i18n, Language } from '../lib/i18n';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  totalAmount: number;
  allowPayAtCounter?: boolean;
  lang?: Language;
}

export function PaymentModal({
  isOpen,
  onClose,
  orderId,
  totalAmount,
  allowPayAtCounter = false,
  lang = 'pl',
}: PaymentModalProps) {
  const router = useRouter();
  const t = i18n[lang] || i18n.pl;
  const [selectedMethod, setSelectedMethod] = useState<'blik' | 'apple_pay' | 'card' | 'cash'>('blik');
  const [blikCode, setBlikCode] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handlePay = async () => {
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const result = await initiatePayment(orderId, selectedMethod, blikCode);

      if (result.redirectUrl) {
        // Przekierowanie do bezpiecznej bramki Saferpay (BLIK / Karta / Portfel)
        window.location.href = result.redirectUrl;
        return;
      }

      // Gotówka lub płatność już opłacona -> przejdź do ekranu śledzenia
      router.push(`/order/${orderId}`);
    } catch (err: any) {
      setErrorMessage(err.message || t.paymentError);
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in overflow-x-hidden">
      <div className="bg-white w-full max-w-sm rounded-3xl p-5 shadow-2xl space-y-5 min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="font-extrabold text-slate-900 text-lg">{t.selectPaymentMethod}</h3>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-900 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Amount */}
        <div className="bg-slate-50 p-3.5 rounded-2xl flex items-center justify-between">
          <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">{t.amountToPay}</span>
          <span className="text-xl font-extrabold text-slate-900">{totalAmount.toFixed(2)} zł</span>
        </div>

        {/* Payment Methods */}
        <div className="grid grid-cols-1 gap-2.5">
          {/* BLIK */}
          <button
            type="button"
            onClick={() => setSelectedMethod('blik')}
            className={`p-3.5 rounded-2xl border-2 flex items-center justify-between transition-all text-left cursor-pointer ${
              selectedMethod === 'blik'
                ? 'border-brand-500 bg-brand-50/70 shadow-xs'
                : 'border-slate-200 hover:border-slate-300 bg-white'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="font-extrabold text-xs px-2 py-1 rounded bg-black text-white tracking-widest shrink-0">
                BLIK
              </span>
              <div className="min-w-0">
                <span className="font-bold text-sm text-slate-900 block truncate">BLIK</span>
                <span className="text-[11px] text-slate-600 font-medium block truncate">{t.blikFast}</span>
              </div>
            </div>
            {selectedMethod === 'blik' && <CheckCircle2 size={20} className="text-brand-500 shrink-0" />}
          </button>

          {/* Apple / Google Pay */}
          <button
            type="button"
            onClick={() => setSelectedMethod('apple_pay')}
            className={`p-3.5 rounded-2xl border-2 flex items-center justify-between transition-all text-left cursor-pointer ${
              selectedMethod === 'apple_pay'
                ? 'border-brand-500 bg-brand-50/70 shadow-xs'
                : 'border-slate-200 hover:border-slate-300 bg-white'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <Smartphone size={22} className="text-slate-800 shrink-0" />
              <div className="min-w-0">
                <span className="font-bold text-sm text-slate-900 block truncate">Apple Pay / Google Pay</span>
                <span className="text-[11px] text-slate-600 font-medium block truncate">{t.cardWallet}</span>
              </div>
            </div>
            {selectedMethod === 'apple_pay' && <CheckCircle2 size={20} className="text-brand-500 shrink-0" />}
          </button>

          {/* Karta płatnicza */}
          <button
            type="button"
            onClick={() => setSelectedMethod('card')}
            className={`p-3.5 rounded-2xl border-2 flex items-center justify-between transition-all text-left cursor-pointer ${
              selectedMethod === 'card'
                ? 'border-brand-500 bg-brand-50/70 shadow-xs'
                : 'border-slate-200 hover:border-slate-300 bg-white'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <CreditCard size={22} className="text-slate-800 shrink-0" />
              <div className="min-w-0">
                <span className="font-bold text-sm text-slate-900 block truncate">{t.payCard}</span>
                <span className="text-[11px] text-slate-600 font-medium block truncate">Visa, Mastercard</span>
              </div>
            </div>
            {selectedMethod === 'card' && <CheckCircle2 size={20} className="text-brand-500 shrink-0" />}
          </button>

          {/* Gotówka / u kelnera (tylko gdy włączona w adminie) */}
          {allowPayAtCounter && (
            <button
              type="button"
              onClick={() => setSelectedMethod('cash')}
              className={`p-3.5 rounded-2xl border-2 flex items-center justify-between transition-all text-left cursor-pointer ${
                selectedMethod === 'cash'
                  ? 'border-brand-500 bg-brand-50/70 shadow-xs'
                  : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Banknote size={22} className="text-slate-800 shrink-0" />
                <div className="min-w-0">
                  <span className="font-bold text-sm text-slate-900 block truncate">{t.payAtCounterTitle}</span>
                  <span className="text-[11px] text-slate-600 font-medium block truncate">{t.payAtCounterSub}</span>
                </div>
              </div>
              {selectedMethod === 'cash' && <CheckCircle2 size={20} className="text-brand-500 shrink-0" />}
            </button>
          )}
        </div>

        {errorMessage && (
          <p className="text-xs font-bold text-red-600 text-center bg-red-50 p-2.5 rounded-xl border border-red-100">
            {errorMessage}
          </p>
        )}

        {/* Submit Pay Button */}
        <button
          onClick={handlePay}
          disabled={isProcessing}
          className="w-full py-4 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-brand-text font-extrabold rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-brand-500/25 transition-all text-base"
        >
          {isProcessing ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              <span>{t.connectingGateway}</span>
            </>
          ) : (
            <span>
              {selectedMethod === 'cash' ? t.confirmOrder : `${t.payAmount} ${totalAmount.toFixed(2)} zł`}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
