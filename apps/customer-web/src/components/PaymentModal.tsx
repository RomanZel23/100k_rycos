'use client';

import React, { useState } from 'react';
import { X, Smartphone, CreditCard, Banknote, Loader2, CheckCircle2 } from 'lucide-react';
import { initiatePayment } from '../lib/api';
import { useRouter } from 'next/navigation';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  totalAmount: number;
}

export function PaymentModal({ isOpen, onClose, orderId, totalAmount }: PaymentModalProps) {
  const router = useRouter();
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
      setErrorMessage(err.message || 'Błąd połączenia z bramką płatności');
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white w-full max-w-sm rounded-3xl p-5 shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="font-extrabold text-slate-900 text-lg">Wybierz metodę płatności</h3>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-900"
          >
            <X size={18} />
          </button>
        </div>

        {/* Amount */}
        <div className="bg-slate-50 p-3.5 rounded-2xl flex items-center justify-between">
          <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Kwota do zapłaty:</span>
          <span className="text-xl font-extrabold text-slate-900">{totalAmount.toFixed(2)} zł</span>
        </div>

        {/* Payment Methods */}
        <div className="grid grid-cols-1 gap-2.5">
          {/* BLIK */}
          <button
            onClick={() => setSelectedMethod('blik')}
            className={`p-3.5 rounded-2xl border flex items-center justify-between transition-all text-left ${
              selectedMethod === 'blik'
                ? 'border-brand-500 bg-brand-50/50 shadow-sm'
                : 'border-slate-200 text-slate-700'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="font-extrabold text-xs px-2 py-1 rounded bg-black text-white tracking-widest">
                BLIK
              </span>
              <div>
                <span className="font-bold text-sm block">BLIK (Saferpay)</span>
                <span className="text-[11px] text-slate-500">Szybka płatność kodem</span>
              </div>
            </div>
            {selectedMethod === 'blik' && <CheckCircle2 size={18} className="text-brand-500" />}
          </button>

          {/* Apple / Google Pay */}
          <button
            onClick={() => setSelectedMethod('apple_pay')}
            className={`p-3.5 rounded-2xl border flex items-center justify-between transition-all text-left ${
              selectedMethod === 'apple_pay'
                ? 'border-brand-500 bg-brand-50/50 shadow-sm'
                : 'border-slate-200 text-slate-700'
            }`}
          >
            <div className="flex items-center gap-3">
              <Smartphone size={20} className="text-slate-800" />
              <div>
                <span className="font-bold text-sm block">Apple Pay / Google Pay</span>
                <span className="text-[11px] text-slate-500">Płatność jednym kliknięciem</span>
              </div>
            </div>
            {selectedMethod === 'apple_pay' && <CheckCircle2 size={18} className="text-brand-500" />}
          </button>

          {/* Karta płatnicza */}
          <button
            onClick={() => setSelectedMethod('card')}
            className={`p-3.5 rounded-2xl border flex items-center justify-between transition-all text-left ${
              selectedMethod === 'card'
                ? 'border-brand-500 bg-brand-50/50 shadow-sm'
                : 'border-slate-200 text-slate-700'
            }`}
          >
            <div className="flex items-center gap-3">
              <CreditCard size={20} className="text-slate-800" />
              <div>
                <span className="font-bold text-sm block">Karta płatnicza online</span>
                <span className="text-[11px] text-slate-500">Visa, Mastercard</span>
              </div>
            </div>
            {selectedMethod === 'card' && <CheckCircle2 size={18} className="text-brand-500" />}
          </button>

          {/* Gotówka / u kelnera */}
          <button
            onClick={() => setSelectedMethod('cash')}
            className={`p-3.5 rounded-2xl border flex items-center justify-between transition-all text-left ${
              selectedMethod === 'cash'
                ? 'border-brand-500 bg-brand-50/50 shadow-sm'
                : 'border-slate-200 text-slate-700'
            }`}
          >
            <div className="flex items-center gap-3">
              <Banknote size={20} className="text-slate-800" />
              <div>
                <span className="font-bold text-sm block">Płatność przy odbiorze</span>
                <span className="text-[11px] text-slate-500">Gotówką lub kartą u obsługi</span>
              </div>
            </div>
            {selectedMethod === 'cash' && <CheckCircle2 size={18} className="text-brand-500" />}
          </button>
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
              <span>Łączenie z bramką Saferpay...</span>
            </>
          ) : (
            <span>
              {selectedMethod === 'cash' ? 'Zatwierdź zamówienie' : `Zapłać ${totalAmount.toFixed(2)} zł`}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
