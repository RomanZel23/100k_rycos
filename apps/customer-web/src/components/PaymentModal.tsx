'use client';

import React, { useState } from 'react';
import { X, Smartphone, CreditCard, Banknote, Loader2, CheckCircle2 } from 'lucide-react';
import { payWithBlik } from '../lib/api.js';
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
      if (selectedMethod === 'blik') {
        if (blikCode.length !== 6) {
          throw new Error('Kod BLIK musi mieć 6 cyfr');
        }
        await payWithBlik(orderId, blikCode);
      }

      // Successful payment or order placed -> redirect to live order status screen
      router.push(`/order/${orderId}`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Płatność nie powiodła się');
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
            className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500"
          >
            <X size={18} />
          </button>
        </div>

        {/* Amount */}
        <div className="bg-slate-50 p-3.5 rounded-2xl flex items-center justify-between">
          <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Kwota:</span>
          <span className="text-xl font-extrabold text-slate-900">{totalAmount.toFixed(2)} zł</span>
        </div>

        {/* Payment Methods */}
        <div className="grid grid-cols-1 gap-2.5">
          {/* BLIK */}
          <button
            onClick={() => setSelectedMethod('blik')}
            className={`p-3.5 rounded-2xl border flex items-center justify-between transition-all ${
              selectedMethod === 'blik'
                ? 'border-brand-500 bg-brand-50/50 shadow-sm'
                : 'border-slate-200 text-slate-700'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="font-extrabold text-xs px-2 py-1 rounded bg-black text-white tracking-widest">
                BLIK
              </span>
              <span className="font-bold text-sm">Płatność kodem BLIK</span>
            </div>
            {selectedMethod === 'blik' && <CheckCircle2 size={18} className="text-brand-500" />}
          </button>

          {/* Apple / Google Pay */}
          <button
            onClick={() => setSelectedMethod('apple_pay')}
            className={`p-3.5 rounded-2xl border flex items-center justify-between transition-all ${
              selectedMethod === 'apple_pay'
                ? 'border-brand-500 bg-brand-50/50 shadow-sm'
                : 'border-slate-200 text-slate-700'
            }`}
          >
            <div className="flex items-center gap-3">
              <Smartphone size={20} className="text-slate-800" />
              <span className="font-bold text-sm">Apple Pay / Google Pay</span>
            </div>
            {selectedMethod === 'apple_pay' && <CheckCircle2 size={18} className="text-brand-500" />}
          </button>

          {/* Karta płatnicza */}
          <button
            onClick={() => setSelectedMethod('card')}
            className={`p-3.5 rounded-2xl border flex items-center justify-between transition-all ${
              selectedMethod === 'card'
                ? 'border-brand-500 bg-brand-50/50 shadow-sm'
                : 'border-slate-200 text-slate-700'
            }`}
          >
            <div className="flex items-center gap-3">
              <CreditCard size={20} className="text-slate-800" />
              <span className="font-bold text-sm">Karta płatnicza online</span>
            </div>
            {selectedMethod === 'card' && <CheckCircle2 size={18} className="text-brand-500" />}
          </button>

          {/* Gotówka / u kelnera */}
          <button
            onClick={() => setSelectedMethod('cash')}
            className={`p-3.5 rounded-2xl border flex items-center justify-between transition-all ${
              selectedMethod === 'cash'
                ? 'border-brand-500 bg-brand-50/50 shadow-sm'
                : 'border-slate-200 text-slate-700'
            }`}
          >
            <div className="flex items-center gap-3">
              <Banknote size={20} className="text-slate-800" />
              <span className="font-bold text-sm">Płatność przy odbiorze</span>
            </div>
            {selectedMethod === 'cash' && <CheckCircle2 size={18} className="text-brand-500" />}
          </button>
        </div>

        {/* BLIK Code Input field */}
        {selectedMethod === 'blik' && (
          <div className="space-y-2 pt-1 animate-fade-in">
            <label className="text-xs font-bold text-slate-600 block">Wpisz 6-cyfrowy kod z banku:</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={blikCode}
              onChange={(e) => setBlikCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000 000"
              className="w-full text-center text-2xl tracking-[0.3em] font-mono font-extrabold p-3 rounded-2xl border-2 border-brand-500 bg-white text-slate-900 focus:outline-none"
            />
          </div>
        )}

        {errorMessage && (
          <p className="text-xs font-bold text-red-600 text-center">{errorMessage}</p>
        )}

        {/* Submit Pay Button */}
        <button
          onClick={handlePay}
          disabled={isProcessing || (selectedMethod === 'blik' && blikCode.length !== 6)}
          className="w-full py-4 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-extrabold rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-brand-500/25 transition-all text-base"
        >
          {isProcessing ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              <span>Potwierdzanie w banku...</span>
            </>
          ) : (
            <span>Zapłać {totalAmount.toFixed(2)} zł</span>
          )}
        </button>
      </div>
    </div>
  );
}
