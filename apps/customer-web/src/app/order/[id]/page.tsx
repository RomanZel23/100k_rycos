'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { OrderDetail, OrderStatus } from '@rycos/shared';
import { fetchOrder } from '../../../lib/api';
import { CheckCircle2, Clock, UtensilsCrossed, BellRing, Receipt, Download, Loader2, Sparkles, CreditCard, AlertCircle } from 'lucide-react';
import { PaymentModal } from '../../../components/PaymentModal';

const STATUS_STEPS: { status: OrderStatus; label: string; icon: any }[] = [
  { status: 'paid', label: 'Opłacone', icon: CheckCircle2 },
  { status: 'in_progress', label: 'W przygotowaniu', icon: UtensilsCrossed },
  { status: 'ready_to_collect', label: 'Gotowe do odbioru!', icon: BellRing },
  { status: 'completed', label: 'Odebrane', icon: CheckCircle2 },
];

function OrderTrackingContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const orderId = params.id as string;
  const paymentErrorParam = searchParams.get('payment_error');

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);

  // Initial Fetch & Live WebSocket connection
  useEffect(() => {
    fetchOrder(orderId)
      .then((data) => {
        setOrder(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });

    // WebSocket live tracker
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8008/v1/ws';
    let ws: WebSocket | null = null;

    try {
      ws = new WebSocket(`${wsUrl}/orders/${orderId}`);

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'order.status_updated') {
            setOrder((prev) => (prev ? { ...prev, status: message.payload.status } : null));
          } else if (message.type === 'order.fiscalized') {
            setOrder((prev) =>
              prev
                ? {
                    ...prev,
                    fiscalStatus: 'issued',
                    fiscalReceiptNumber: message.payload.receiptNumber,
                    fiscalPdfUrl: message.payload.pdfUrl,
                  }
                : null
            );
          }
        } catch (e) {
          console.error('[WS Track] Parse error:', e);
        }
      };
    } catch {}

    // Fallback polling every 5s if WS disconnects
    const poller = setInterval(() => {
      fetchOrder(orderId).then((data) => setOrder(data)).catch(() => {});
    }, 5000);

    return () => {
      if (ws) ws.close();
      clearInterval(poller);
    };
  }, [orderId]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-3">
        <Loader2 size={36} className="animate-spin text-brand-500" />
        <span className="text-sm font-bold text-slate-600">Pobieranie statusu zamówienia...</span>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <span className="text-5xl mb-4">🔍</span>
        <h2 className="font-extrabold text-xl text-slate-900">Nie znaleziono zamówienia</h2>
        <p className="text-sm text-slate-500 mt-1">Upewnij się, że link z kodem QR jest poprawny.</p>
      </div>
    );
  }

  const isReady = order.status === 'ready_to_collect';
  const isPending = order.status === 'pending_payment';

  return (
    <div className="max-w-lg mx-auto min-h-screen bg-slate-50 flex flex-col p-4 space-y-4">
      {/* Top Banner */}
      <div className={`p-6 rounded-3xl text-center shadow-md transition-all ${
        isReady ? 'bg-emerald-500 text-white animate-bounce' : 'bg-slate-900 text-white'
      }`}>
        <span className="text-xs font-bold uppercase tracking-widest opacity-80">
          {order.brandName}
        </span>
        <h1 className="text-3xl font-black mt-1">Zamówienie #{order.orderNumber}</h1>

        {/* Collection PIN */}
        <div className="mt-5 p-4 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 inline-block px-8">
          <span className="text-xs font-bold uppercase tracking-wider block opacity-90">
            Twój PIN do odbioru:
          </span>
          <span className="text-4xl font-mono font-black tracking-widest block mt-1">
            {order.collectionPin}
          </span>
        </div>

        {isReady ? (
          <p className="font-extrabold text-base mt-4 flex items-center justify-center gap-2">
            <Sparkles size={20} />
            <span>Zapraszamy po odbiór do punktu wydawania!</span>
          </p>
        ) : (
          <p className="text-xs text-white/80 mt-3">
            Pokaż ten PIN lub numer zamówienia przy odbiorze
          </p>
        )}
      </div>

      {/* Payment Error Alert */}
      {paymentErrorParam && isPending && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl text-xs font-bold flex items-center gap-2">
          <AlertCircle size={18} className="shrink-0" />
          <span>Płatność w banku nie została sfinalizowana. Możesz ponowić próbę poniżej.</span>
        </div>
      )}

      {/* Pending Payment CTA Banner */}
      {isPending && (
        <div className="bg-amber-500 text-white p-5 rounded-3xl shadow-lg shadow-amber-500/20 space-y-3 animate-fade-in">
          <div className="flex items-center gap-3">
            <Clock size={24} className="text-white shrink-0" />
            <div>
              <h3 className="font-extrabold text-base">Oczekiwanie na płatność</h3>
              <p className="text-xs text-white/90">
                To zamówienie nie zostało jeszcze opłacone. Aby kuchnia rozpoczęła przygotowanie, dokończ płatność.
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsPaymentOpen(true)}
            className="w-full py-3.5 bg-white text-slate-900 font-extrabold rounded-2xl shadow-md hover:bg-slate-50 active:scale-[0.98] transition-all text-sm flex items-center justify-center gap-2"
          >
            <CreditCard size={18} className="text-brand-500" />
            <span>Opłać zamówienie ({order.totalAmount.toFixed(2)} zł)</span>
          </button>
        </div>
      )}

      {/* Progress Stepper */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-6">
        <h3 className="font-extrabold text-slate-900 text-sm uppercase tracking-wider">
          Status przygotowania
        </h3>

        <div className="space-y-6 relative pl-3">
          <div className="absolute left-[23px] top-4 bottom-4 w-0.5 bg-slate-100" />

          {STATUS_STEPS.map((step, idx) => {
            const isCompleted =
              (order.status === 'paid' && idx === 0) ||
              (order.status === 'in_progress' && idx <= 1) ||
              (order.status === 'ready_to_collect' && idx <= 2) ||
              (order.status === 'completed' && idx <= 3);

            const isCurrent =
              (order.status === 'paid' && idx === 0) ||
              (order.status === 'in_progress' && idx === 1) ||
              (order.status === 'ready_to_collect' && idx === 2) ||
              (order.status === 'completed' && idx <= 3);

            const Icon = step.icon;

            return (
              <div key={step.status} className="flex items-center gap-4 relative z-10">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                    isCompleted
                      ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                      : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  <Icon size={16} />
                </div>

                <div>
                  <h4
                    className={`text-sm font-bold ${
                      isCurrent
                        ? 'text-slate-900 font-extrabold text-base'
                        : isCompleted
                        ? 'text-slate-800'
                        : 'text-slate-400'
                    }`}
                  >
                    {step.label}
                  </h4>
                  {isCurrent && (
                    <span className="text-[11px] text-emerald-600 font-bold block animate-pulse">
                      ● W trakcie...
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* E-Receipt / RYCOS Fiscal Card */}
      {order.fiscalReceiptNumber && (
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
              <Receipt size={20} />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-500 block">E-Paragon Fiskalny</span>
              <span className="text-sm font-mono font-bold text-slate-900">
                {order.fiscalReceiptNumber}
              </span>
            </div>
          </div>

          {order.fiscalPdfUrl && (
            <a
              href={order.fiscalPdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center gap-1.5 text-xs font-bold transition-all"
            >
              <Download size={14} />
              <span>PDF</span>
            </a>
          )}
        </div>
      )}

      {/* Order Summary Details */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 space-y-3">
        <h3 className="font-extrabold text-slate-900 text-sm">Podsumowanie pozycji</h3>

        <div className="space-y-2 divide-y divide-slate-100 text-xs">
          {order.items.map((it, idx) => (
            <div key={idx} className="pt-2 flex justify-between items-start">
              <div>
                <span className="font-bold text-slate-800">
                  {it.quantity}x {it.name}
                </span>
                {it.addons && it.addons.length > 0 && (
                  <span className="block text-slate-500 text-[11px]">
                    {it.addons.map((a: any) => a.name).join(', ')}
                  </span>
                )}
              </div>
              <span className="font-bold text-slate-900">{it.lineTotal.toFixed(2)} zł</span>
            </div>
          ))}
        </div>

        <div className="pt-3 border-t border-slate-100 flex justify-between items-center text-sm font-extrabold text-slate-900">
          <span>Razem:</span>
          <span>{order.totalAmount.toFixed(2)} zł</span>
        </div>
      </div>

      {/* Payment Modal */}
      <PaymentModal
        isOpen={isPaymentOpen}
        onClose={() => setIsPaymentOpen(false)}
        orderId={order.id}
        totalAmount={order.totalAmount}
      />
    </div>
  );
}

export default function OrderTrackingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-3">
          <Loader2 size={36} className="animate-spin text-brand-500" />
          <span className="text-sm font-bold text-slate-600">Ładowanie...</span>
        </div>
      }
    >
      <OrderTrackingContent />
    </Suspense>
  );
}
