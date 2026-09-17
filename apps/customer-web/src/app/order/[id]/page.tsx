'use client';

import React, { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { OrderDetail, OrderStatus } from '@rycos/shared';
import { fetchOrder, getApiBaseUrl } from '../../../lib/api';
import { CheckCircle2, Clock, UtensilsCrossed, BellRing, Receipt, Download, Loader2, Sparkles, CreditCard, AlertCircle, QrCode, ArrowLeft, Banknote } from 'lucide-react';
import QRCode from 'qrcode';
import { PaymentModal } from '../../../components/PaymentModal';
import { saveStoredOrder, updateStoredOrderStatus } from '../../../store/orderStorage';
import { i18n, Language, getStoredLanguage, saveStoredLanguage } from '../../../lib/i18n';

function OrderTrackingContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const orderId = params.id as string;
  const paymentErrorParam = searchParams.get('payment_error');
  const urlLang = searchParams.get('lang') as Language | null;

  const [lang, setLang] = useState<Language>(urlLang || 'pl');
  useEffect(() => {
    if (!urlLang) {
      setLang(getStoredLanguage());
    }
  }, [urlLang]);

  const handleSelectLanguage = (newLang: Language) => {
    setLang(newLang);
    saveStoredLanguage(newLang);
  };

  const t = i18n[lang] || i18n.pl;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [receiptQrDataUrl, setReceiptQrDataUrl] = useState<string | null>(null);

  // 2-Factor Live Handover: PIN is hidden until staff scans the QR code at pickup
  const [revealedPin, setRevealedPin] = useState<string | null>(null);
  const [isChallengeActive, setIsChallengeActive] = useState<boolean>(false);
  const [liveSeconds, setLiveSeconds] = useState<string>('');

  // Live ticking clock for anti-screenshot dynamic verification
  useEffect(() => {
    const updateSec = () => {
      const now = new Date();
      setLiveSeconds(now.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    updateSec();
    const iv = setInterval(updateSec, 1000);
    return () => clearInterval(iv);
  }, []);

  // Generate collection QR code (encodes order ID token, NOT the PIN)
  useEffect(() => {
    if (order?.id) {
      const qrPayload = `rycos:pickup:${order.id}`;
      QRCode.toDataURL(qrPayload, {
        width: 260,
        margin: 1,
        color: {
          dark: '#090d16',
          light: '#ffffff',
        },
      })
        .then(setQrDataUrl)
        .catch(console.error);
    }
  }, [order?.id]);

  // Generate e-receipt QR code (controlled by show_receipt_qr feature)
  useEffect(() => {
    const receiptTarget = order?.fiscalPdfUrl || (order?.fiscalReceiptNumber ? `${window.location.origin}/order/${order.id}#receipt` : null);
    if (receiptTarget && order?.showReceiptQr !== false) {
      QRCode.toDataURL(receiptTarget, {
        width: 180,
        margin: 1,
        color: {
          dark: '#090d16',
          light: '#ffffff',
        },
      })
        .then(setReceiptQrDataUrl)
        .catch(console.error);
    }
  }, [order?.fiscalPdfUrl, order?.fiscalReceiptNumber, order?.showReceiptQr, order?.id]);

  // Initial Fetch & Live WebSocket connection
  useEffect(() => {
    fetchOrder(orderId)
      .then((data) => {
        setOrder(data);
        setLoading(false);

        // Save order to local storage
        saveStoredOrder({
          id: data.id,
          brandId: data.brandId,
          brandName: data.brandName,
          orderNumber: String(data.orderNumber ? `#${data.orderNumber}` : `#${data.id.slice(0, 6)}`),
          orderDate: data.createdAt ? new Date(data.createdAt).toISOString() : new Date().toISOString(),
          status: data.status,
          totalAmount: data.totalAmount,
          currency: data.currency || 'PLN',
          itemsSummary: data.items?.map((i) => `${i.quantity}x ${i.name}`).join(', ') || '',
          itemsCount: data.items?.reduce((sum, i) => sum + i.quantity, 0) || 0,
          collectionPin: data.collectionPin,
          tableLabel: data.tableLabel,
          parkingSpot: data.parkingSpot,
        });
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });

    // WebSocket live tracker
    const apiBase = getApiBaseUrl();
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || (apiBase.replace(/^http/, 'ws') + '/v1/ws');
    let ws: WebSocket | null = null;

    try {
      ws = new WebSocket(`${wsUrl}/orders/${orderId}`);

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'pickup.challenge') {
            setIsChallengeActive(true);
            const pinToReveal = message.pin || message.payload?.pin;
            if (pinToReveal) {
              setRevealedPin(pinToReveal);
            }
            try {
              if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
                navigator.vibrate([150, 100, 150]);
              }
            } catch {}
          } else if (message.type === 'order.status_updated') {
            const nextStatus = message.payload.status;
            setOrder((prev) => (prev ? { ...prev, status: nextStatus } : null));
            updateStoredOrderStatus(orderId, nextStatus);
            if (nextStatus === 'completed') {
              setIsChallengeActive(false);
            }
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
        <span className="text-sm font-bold text-slate-600">{t.fetchingOrderStatus}</span>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <span className="text-5xl mb-4">🔍</span>
        <h2 className="font-extrabold text-xl text-slate-900">{t.orderNotFound}</h2>
        <p className="text-sm text-slate-500 mt-1">{t.orderNotFoundSub}</p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold shadow hover:bg-slate-800 transition-all"
        >
          <ArrowLeft size={16} />
          <span>{t.backToMenu}</span>
        </Link>
      </div>
    );
  }

  const isReady = order.status === 'ready_to_collect';
  const isPending = order.status === 'pending_payment';

  const statusSteps = [
    {
      status: 'paid',
      label: t.orderStatusPaid,
      sublabel: t.orderStatusPaidSub,
      icon: CreditCard,
    },
    {
      status: 'in_progress',
      label: t.orderStatusInProgress,
      sublabel: t.orderStatusInProgressSub,
      icon: UtensilsCrossed,
    },
    {
      status: 'ready_to_collect',
      label: t.orderStatusReady,
      sublabel: t.orderStatusReadySub,
      icon: BellRing,
    },
    {
      status: 'completed',
      label: t.orderStatusCompleted,
      sublabel: t.orderStatusCompletedSub,
      icon: CheckCircle2,
    },
  ];

  const getBannerSubtitle = () => {
    switch (order.status) {
      case 'pending_payment':
        return t.orderPendingBanner;
      case 'paid':
        return t.orderPaidBanner;
      case 'in_progress':
        return t.orderPreparing;
      case 'ready_to_collect':
        return t.orderReadyBanner;
      case 'completed':
        return t.orderCompletedBanner;
      default:
        return t.orderPickupBannerHelp;
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto min-h-screen bg-slate-50 flex flex-col p-4 space-y-4 overflow-x-hidden">
      {/* Top Bar: Back to Menu & Language Switcher */}
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-slate-950 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm transition-all"
        >
          <ArrowLeft size={16} />
          <span>{t.backToMenu}</span>
        </Link>

        {/* Language selector */}
        <div className="flex items-center bg-white border border-slate-200 rounded-xl p-0.5 shadow-sm">
          {(['pl', 'en', 'de'] as Language[]).map((l) => (
            <button
              key={l}
              onClick={() => handleSelectLanguage(l)}
              className={`px-2.5 py-1 text-[11px] font-extrabold uppercase rounded-lg transition-all ${
                lang === l
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Top Banner */}
      <div className={`p-6 rounded-3xl text-center shadow-md transition-all ${
        isReady ? 'bg-emerald-500 text-white animate-bounce' : 'bg-slate-900 text-white'
      }`}>
        <span className="text-xs sm:text-sm font-black uppercase tracking-widest opacity-80">
          {order.brandName}
        </span>
        <h1 className="text-3xl sm:text-4xl font-black mt-1.5">{t.orderWord} #{order.orderNumber}</h1>

        {/* Collection QR Code & Dynamic 2FA PIN Card */}
        <div 
          onContextMenu={(e) => e.preventDefault()}
          className="mt-5 p-5 rounded-3xl bg-white text-slate-900 shadow-xl max-w-xs mx-auto border border-slate-100 select-none relative overflow-hidden"
        >
          {/* Dynamic Anti-Screenshot Live Header */}
          <div className="flex items-center justify-between gap-1.5 text-xs font-black uppercase tracking-wider mb-2.5">
            <div className="flex items-center gap-1.5 text-amber-600">
              <QrCode size={18} />
              <span>{t.pickupPinLabel}</span>
            </div>
            {liveSeconds && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                <span>LIVE {liveSeconds}</span>
              </div>
            )}
          </div>

          {/* QR Code Container */}
          {qrDataUrl ? (
            <div className="bg-white p-2.5 rounded-2xl border-2 border-slate-200 inline-block shadow-sm relative pointer-events-none">
              <img
                src={qrDataUrl}
                alt="QR Kod Odbioru"
                draggable={false}
                className="w-52 h-52 mx-auto rounded-xl object-contain select-none"
              />
            </div>
          ) : (
            <div className="w-52 h-52 mx-auto bg-slate-100 animate-pulse rounded-2xl flex items-center justify-center text-slate-400 text-sm font-bold">
              Generowanie QR...
            </div>
          )}

          {/* PIN Section - Hidden initially, revealed when staff scans QR code */}
          <div className="mt-3.5 pt-3 border-t border-slate-100">
            {revealedPin ? (
              <div className="p-3 bg-emerald-50 border-2 border-emerald-500 rounded-2xl animate-in zoom-in-95 duration-200 space-y-1">
                <span className="text-xs font-black text-emerald-800 uppercase tracking-wider block">
                  🔢 Twój PIN do odbioru:
                </span>
                <span className="text-5xl sm:text-6xl font-mono font-black text-emerald-950 tracking-widest block mt-0.5">
                  {revealedPin}
                </span>
                <p className="text-xs text-emerald-800 font-black mt-1">
                  👉 Podaj ten kod obsłudze przy ladzie!
                </p>
              </div>
            ) : (
              <div className="space-y-1.5 py-1">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-black">
                  <span>🔒</span>
                  <span>PIN zabezpieczony</span>
                </div>
                <p className="text-xs text-slate-600 font-medium leading-relaxed px-1">
                  Pokaż ten kod QR obsłudze przy wydawce. Twój jednorazowy PIN pojawi się tutaj automatycznie po zeskanowaniu.
                </p>
                <div className="text-xl font-mono font-bold text-slate-300 tracking-widest pt-0.5">
                  • • • •
                </div>
              </div>
            )}
          </div>
        </div>

        {isReady ? (
          <p className="font-black text-lg mt-4 flex items-center justify-center gap-2">
            <Sparkles size={22} />
            <span>{t.pickupReadyCall}</span>
          </p>
        ) : (
          <p className="text-sm text-white/90 font-medium mt-3">
            {getBannerSubtitle()}
          </p>
        )}
      </div>

      {/* Cash / Pay at Counter Banner (when paymentStatus === 'pending') */}
      {order.paymentMethod === 'cash' && order.paymentStatus === 'pending' && !['completed', 'cancelled'].includes(order.status) && (
        <div className="bg-slate-900 text-white p-5 rounded-3xl shadow-lg border border-slate-800 space-y-3.5 animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/30">
              <Banknote size={26} />
            </div>
            <div>
              <h3 className="font-black text-base sm:text-lg text-white">{t.orderPayAtCounterBanner}</h3>
              <p className="text-xs sm:text-sm text-slate-300 mt-0.5 font-medium">
                {t.orderPayAtCounterSub}
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsPaymentOpen(true)}
            className="w-full py-3.5 min-h-[50px] bg-white hover:bg-slate-100 active:scale-[0.98] text-slate-900 font-black rounded-2xl shadow-sm transition-all text-sm sm:text-base flex items-center justify-center gap-2 cursor-pointer"
          >
            <CreditCard size={18} className="text-brand-500" />
            <span>{t.orderPayOnlineOption} ({order.totalAmount.toFixed(2)} {order.currency || 'zł'})</span>
          </button>
        </div>
      )}

      {/* Online Payment Error Alert */}
      {paymentErrorParam && order.paymentMethod !== 'cash' && isPending && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl text-sm font-bold flex items-center gap-2.5">
          <AlertCircle size={20} className="shrink-0 text-red-600" />
          <span>{t.paymentFailedBanner}</span>
        </div>
      )}

      {/* Pending Online Payment CTA Banner */}
      {order.paymentMethod !== 'cash' && isPending && (
        <div className="bg-amber-500 text-white p-5 rounded-3xl shadow-lg shadow-amber-500/20 space-y-3.5 animate-fade-in">
          <div className="flex items-center gap-3">
            <Clock size={28} className="text-white shrink-0" />
            <div>
              <h3 className="font-black text-base sm:text-lg">{t.orderPendingBanner}</h3>
              <p className="text-xs sm:text-sm text-white/95 font-medium">
                {paymentErrorParam ? t.paymentFailedBanner : 'Opłać zamówienie, aby przekazać je do realizacji w kuchni.'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsPaymentOpen(true)}
            className="w-full py-4 min-h-[54px] bg-white text-slate-900 font-black rounded-2xl shadow-md hover:bg-slate-50 active:scale-[0.98] transition-all text-base flex items-center justify-center gap-2 cursor-pointer"
          >
            <CreditCard size={20} className="text-brand-500" />
            <span>
              {paymentErrorParam ? t.retryPayment : t.orderPayNow} ({order.totalAmount.toFixed(2)} {order.currency || 'zł'})
            </span>
          </button>
        </div>
      )}

      {/* Progress Stepper */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-6">
        <h3 className="font-black text-slate-900 text-sm sm:text-base uppercase tracking-wider">
          {t.orderTrackingTitle}
        </h3>

        <div className="space-y-6 relative pl-3">
          <div className="absolute left-[25px] top-4 bottom-4 w-0.5 bg-slate-100" />

          {statusSteps.map((step, idx) => {
            // Step completion logic
            const isPaidOrBeyond = ['paid', 'in_progress', 'ready_to_collect', 'completed'].includes(order.status);
            const isInProgressOrBeyond = ['in_progress', 'ready_to_collect', 'completed'].includes(order.status);
            const isReadyOrBeyond = ['ready_to_collect', 'completed'].includes(order.status);
            const isDone = order.status === 'completed';

            let isCompleted = false;
            let isCurrent = false;

            if (idx === 0) {
              // Opłacone
              isCompleted = isPaidOrBeyond;
              isCurrent = false;
            } else if (idx === 1) {
              // W przygotowaniu
              isCompleted = isInProgressOrBeyond;
              isCurrent = order.status === 'paid' || order.status === 'in_progress';
            } else if (idx === 2) {
              // Gotowe do odbioru
              isCompleted = isReadyOrBeyond;
              isCurrent = order.status === 'ready_to_collect';
            } else if (idx === 3) {
              // Odebrane
              isCompleted = isDone;
              isCurrent = isDone;
            }

            const Icon = step.icon;

            return (
              <div key={step.status} className="flex items-center gap-4 relative z-10">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                    isCompleted
                      ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                      : isCurrent
                      ? 'bg-brand-500 text-white shadow-md shadow-brand-500/20 animate-pulse'
                      : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  <Icon size={18} />
                </div>

                <div>
                  <h4
                    className={`font-black ${
                      isCurrent
                        ? 'text-slate-900 text-base sm:text-lg'
                        : isCompleted
                        ? 'text-slate-800 text-sm sm:text-base'
                        : 'text-slate-400 text-sm'
                    }`}
                  >
                    {step.label}
                  </h4>
                  {isCurrent && (
                    <span className="text-xs sm:text-sm text-brand-600 font-bold block mt-0.5">
                      {order.status === 'paid' && `● ${t.waitingForKitchen}`}
                      {order.status === 'in_progress' && `● ${t.dishesBeingPrepared}`}
                      {order.status === 'ready_to_collect' && `● ${t.pickupReadyCall}`}
                      {order.status === 'completed' && `● ${t.thankYouVisitAgain}`}
                    </span>
                  )}
                  {!isCurrent && isCompleted && (
                    <span className="text-xs sm:text-sm text-slate-500 font-medium block mt-0.5">
                      {step.sublabel}
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
        <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-100 space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center">
                <Receipt size={22} />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-500 block">{t.fiscalReceiptTitle}</span>
                <span className="text-sm sm:text-base font-mono font-black text-slate-900">
                  Nr: {order.fiscalReceiptNumber}
                </span>
              </div>
            </div>

            {order.fiscalPdfUrl && (
              <a
                href={order.fiscalPdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-3 rounded-xl bg-brand-50 hover:bg-brand-100 text-brand-700 flex items-center gap-1.5 text-xs sm:text-sm font-black transition-all shadow-sm"
              >
                <Download size={16} />
                <span>{t.downloadPdf}</span>
              </a>
            )}
          </div>

          {order.showReceiptQr !== false && receiptQrDataUrl && (
            <div className="pt-3 border-t border-slate-100 flex flex-col items-center text-center">
              <span className="text-xs font-bold text-slate-500 mb-2">
                {lang === 'de' ? 'QR-Code für eParagon / Quittung:' : lang === 'en' ? 'Scan for e-receipt:' : 'Zeskanuj kod QR e-paragonu:'}
              </span>
              <div className="p-2.5 bg-slate-50 rounded-2xl border border-slate-100">
                <img src={receiptQrDataUrl} alt="eParagon QR" className="w-32 h-32 object-contain" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Order Summary Details */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-100 space-y-3">
        <h3 className="font-black text-slate-900 text-sm sm:text-base">{t.orderSummary}</h3>

        <div className="space-y-2 divide-y divide-slate-100 text-sm">
          {order.items.map((it, idx) => (
            <div key={idx} className="pt-2 flex justify-between items-start">
              <div>
                <span className="font-black text-slate-800">
                  {it.quantity}x {it.name}
                </span>
                {it.addons && it.addons.length > 0 && (
                  <span className="block text-slate-500 text-xs font-medium">
                    {it.addons.map((a: any) => a.name).join(', ')}
                  </span>
                )}
              </div>
              <span className="font-black font-mono text-slate-900">{it.lineTotal.toFixed(2)} {order.currency || 'zł'}</span>
            </div>
          ))}
        </div>

        <div className="pt-3 border-t border-slate-100 flex justify-between items-center text-base sm:text-lg font-black text-slate-950 font-mono">
          <span>{t.total}:</span>
          <span>{order.totalAmount.toFixed(2)} {order.currency || 'zł'}</span>
        </div>
      </div>

      {/* Payment Modal */}
      <PaymentModal
        isOpen={isPaymentOpen}
        onClose={() => setIsPaymentOpen(false)}
        orderId={order.id}
        totalAmount={order.totalAmount}
        lang={lang}
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
