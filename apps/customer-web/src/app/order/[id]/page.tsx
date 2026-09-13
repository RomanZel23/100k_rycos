'use client';

import React, { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { OrderDetail, OrderStatus } from '@rycos/shared';
import { fetchOrder, getApiBaseUrl } from '../../../lib/api';
import { CheckCircle2, Clock, UtensilsCrossed, BellRing, Receipt, Download, Loader2, Sparkles, CreditCard, AlertCircle, QrCode, ArrowLeft } from 'lucide-react';
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

  // Generate collection QR code
  useEffect(() => {
    if (order?.orderNumber && order?.collectionPin) {
      const qrPayload = `${order.orderNumber}:${order.collectionPin}`;
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
  }, [order?.orderNumber, order?.collectionPin]);

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
          if (message.type === 'order.status_updated') {
            const nextStatus = message.payload.status;
            setOrder((prev) => (prev ? { ...prev, status: nextStatus } : null));
            updateStoredOrderStatus(orderId, nextStatus);
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
    <div className="max-w-lg mx-auto min-h-screen bg-slate-50 flex flex-col p-4 space-y-4">
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
        <span className="text-xs font-bold uppercase tracking-widest opacity-80">
          {order.brandName}
        </span>
        <h1 className="text-3xl font-black mt-1">{t.orderWord} #{order.orderNumber}</h1>

        {/* Collection QR Code & PIN Card */}
        <div className="mt-5 p-5 rounded-3xl bg-white text-slate-900 shadow-xl max-w-xs mx-auto border border-slate-100">
          <div className="flex items-center justify-center gap-1.5 text-xs font-black uppercase tracking-wider text-amber-600 mb-2.5">
            <QrCode size={16} />
            <span>{t.pickupPinLabel}</span>
          </div>

          {qrDataUrl ? (
            <div className="bg-white p-2 rounded-2xl border border-slate-200 inline-block shadow-sm">
              <img
                src={qrDataUrl}
                alt="QR Kod Odbioru"
                className="w-48 h-48 mx-auto rounded-xl object-contain"
              />
            </div>
          ) : (
            <div className="w-48 h-48 mx-auto bg-slate-100 animate-pulse rounded-2xl flex items-center justify-center text-slate-400 text-xs">
              Generowanie QR...
            </div>
          )}

          <div className="mt-3.5 pt-3 border-t border-slate-100">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block">
              {t.pin}:
            </span>
            <span className="text-4xl font-mono font-black text-slate-950 tracking-widest block mt-0.5">
              {order.collectionPin}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2 font-medium">
            {t.pickupPinSub}
          </p>
        </div>

        {isReady ? (
          <p className="font-extrabold text-base mt-4 flex items-center justify-center gap-2">
            <Sparkles size={20} />
            <span>{t.pickupReadyCall}</span>
          </p>
        ) : (
          <p className="text-xs text-white/80 mt-3">
            {getBannerSubtitle()}
          </p>
        )}
      </div>

      {/* Payment Error Alert */}
      {paymentErrorParam && isPending && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl text-xs font-bold flex items-center gap-2">
          <AlertCircle size={18} className="shrink-0" />
          <span>{t.paymentFailedBanner}</span>
        </div>
      )}

      {/* Pending Payment CTA Banner */}
      {isPending && (
        <div className="bg-amber-500 text-white p-5 rounded-3xl shadow-lg shadow-amber-500/20 space-y-3 animate-fade-in">
          <div className="flex items-center gap-3">
            <Clock size={24} className="text-white shrink-0" />
            <div>
              <h3 className="font-extrabold text-base">{t.orderPendingBanner}</h3>
              <p className="text-xs text-white/90">
                {t.paymentFailedBanner}
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsPaymentOpen(true)}
            className="w-full py-3.5 bg-white text-slate-900 font-extrabold rounded-2xl shadow-md hover:bg-slate-50 active:scale-[0.98] transition-all text-sm flex items-center justify-center gap-2"
          >
            <CreditCard size={18} className="text-brand-500" />
            <span>{t.retryPayment} ({order.totalAmount.toFixed(2)} {order.currency || 'zł'})</span>
          </button>
        </div>
      )}

      {/* Progress Stepper */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-6">
        <h3 className="font-extrabold text-slate-900 text-sm uppercase tracking-wider">
          {t.orderTrackingTitle}
        </h3>

        <div className="space-y-6 relative pl-3">
          <div className="absolute left-[23px] top-4 bottom-4 w-0.5 bg-slate-100" />

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
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                    isCompleted
                      ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                      : isCurrent
                      ? 'bg-brand-500 text-white shadow-md shadow-brand-500/20 animate-pulse'
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
                    <span className="text-[11px] text-brand-600 font-bold block">
                      {order.status === 'paid' && `● ${t.waitingForKitchen}`}
                      {order.status === 'in_progress' && `● ${t.dishesBeingPrepared}`}
                      {order.status === 'ready_to_collect' && `● ${t.pickupReadyCall}`}
                      {order.status === 'completed' && `● ${t.thankYouVisitAgain}`}
                    </span>
                  )}
                  {!isCurrent && isCompleted && (
                    <span className="text-[11px] text-slate-500 block">
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
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
                <Receipt size={20} />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-500 block">{t.fiscalReceiptTitle}</span>
                <span className="text-sm font-mono font-bold text-slate-900">
                  Nr: {order.fiscalReceiptNumber}
                </span>
              </div>
            </div>

            {order.fiscalPdfUrl && (
              <a
                href={order.fiscalPdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2.5 rounded-xl bg-brand-50 hover:bg-brand-100 text-brand-700 flex items-center gap-1.5 text-xs font-bold transition-all shadow-sm"
              >
                <Download size={14} />
                <span>{t.downloadPdf}</span>
              </a>
            )}
          </div>

          {order.showReceiptQr !== false && receiptQrDataUrl && (
            <div className="pt-3 border-t border-slate-100 flex flex-col items-center text-center">
              <span className="text-[11px] font-bold text-slate-500 mb-2">
                {lang === 'de' ? 'QR-Code für eParagon / Quittung:' : lang === 'en' ? 'Scan for e-receipt:' : 'Zeskanuj kod QR e-paragonu:'}
              </span>
              <div className="p-2 bg-slate-50 rounded-2xl border border-slate-100">
                <img src={receiptQrDataUrl} alt="eParagon QR" className="w-28 h-28 object-contain" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Order Summary Details */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 space-y-3">
        <h3 className="font-extrabold text-slate-900 text-sm">{t.orderSummary}</h3>

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
              <span className="font-bold text-slate-900">{it.lineTotal.toFixed(2)} {order.currency || 'zł'}</span>
            </div>
          ))}
        </div>

        <div className="pt-3 border-t border-slate-100 flex justify-between items-center text-sm font-extrabold text-slate-900">
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
