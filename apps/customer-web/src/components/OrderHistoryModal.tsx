'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { getStoredOrders, clearStoredOrders, StoredOrder } from '../store/orderStorage';
import { X, Clock, CheckCircle2, UtensilsCrossed, BellRing, ChevronRight, Trash2, ArrowUpRight, ShoppingBag } from 'lucide-react';

interface OrderHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang?: 'pl' | 'en' | 'de';
}

const translations = {
  pl: {
    title: 'Moje zamówienia',
    activeTitle: 'Aktywne zamówienia',
    historyTitle: 'Historia zamówień',
    emptyTitle: 'Brak zamówień w historii',
    emptyDesc: 'Złóż swoje pierwsze zamówienie przy stoliku lub barze, a pojawi się ono tutaj!',
    pinLabel: 'Kod PIN do odbioru:',
    trackOrder: 'Szczegóły i kod QR',
    clearHistory: 'Wyczyść historię',
    confirmClear: 'Czy na pewno chcesz usunąć historię zamówień z tego urządzenia?',
    status: {
      pending_payment: 'Oczekuje na płatność',
      paid: 'Opłacone',
      in_progress: 'W przygotowaniu',
      ready_to_collect: 'Gotowe do odbioru!',
      completed: 'Zrealizowane',
      cancelled: 'Anulowane',
      payment_failed: 'Nieopłacone',
    },
  },
  en: {
    title: 'My Orders',
    activeTitle: 'Active Orders',
    historyTitle: 'Past Orders',
    emptyTitle: 'No order history',
    emptyDesc: 'Place your first order to track its status right here!',
    pinLabel: 'Collection PIN:',
    trackOrder: 'Details & QR code',
    clearHistory: 'Clear history',
    confirmClear: 'Are you sure you want to clear order history from this device?',
    status: {
      pending_payment: 'Awaiting Payment',
      paid: 'Paid',
      in_progress: 'In Preparation',
      ready_to_collect: 'Ready for Pickup!',
      completed: 'Completed',
      cancelled: 'Cancelled',
      payment_failed: 'Payment Failed',
    },
  },
  de: {
    title: 'Meine Bestellungen',
    activeTitle: 'Aktive Bestellungen',
    historyTitle: 'Bestellhistorie',
    emptyTitle: 'Keine Bestellhistorie',
    emptyDesc: 'Geben Sie Ihre erste Bestellung auf, um den Status hier zu verfolgen!',
    pinLabel: 'Abhol-PIN:',
    trackOrder: 'Details & QR-Code',
    clearHistory: 'Verlauf löschen',
    confirmClear: 'Möchten Sie den Bestellverlauf wirklich von diesem Gerät löschen?',
    status: {
      pending_payment: 'Warten auf Zahlung',
      paid: 'Bezahlt',
      in_progress: 'In Zubereitung',
      ready_to_collect: 'Abholbereit!',
      completed: 'Abgeschlossen',
      cancelled: 'Storniert',
      payment_failed: 'Zahlung fehlgeschlagen',
    },
  },
};

export function OrderHistoryModal({ isOpen, onClose, lang = 'pl' }: OrderHistoryModalProps) {
  const [orders, setOrders] = useState<StoredOrder[]>([]);
  const t = translations[lang] || translations.pl;

  useEffect(() => {
    if (isOpen) {
      setOrders(getStoredOrders());
    }

    const handleUpdate = () => {
      setOrders(getStoredOrders());
    };

    window.addEventListener('rycos_order_history_updated', handleUpdate);
    return () => {
      window.removeEventListener('rycos_order_history_updated', handleUpdate);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const activeOrders = orders.filter((o) =>
    ['pending_payment', 'paid', 'in_progress', 'ready_to_collect'].includes(o.status)
  );
  const pastOrders = orders.filter((o) =>
    ['completed', 'cancelled', 'payment_failed'].includes(o.status)
  );

  const handleClear = () => {
    if (window.confirm(t.confirmClear)) {
      clearStoredOrders();
      setOrders([]);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ready_to_collect':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-500 text-white animate-pulse shadow-sm">
            <BellRing size={12} />
            {t.status.ready_to_collect}
          </span>
        );
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
            <UtensilsCrossed size={12} className="animate-spin" />
            {t.status.in_progress}
          </span>
        );
      case 'paid':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
            <CheckCircle2 size={12} />
            {t.status.paid}
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600">
            <CheckCircle2 size={11} />
            {t.status.completed}
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-700">
            {t.status.cancelled}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
            <Clock size={12} />
            {t.status[status as keyof typeof t.status] || status}
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-200 overflow-x-hidden">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl max-w-lg w-full max-h-[88vh] flex flex-col shadow-2xl relative overflow-hidden min-w-0">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur-md z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center shadow-2xs">
              <Clock size={20} />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 tracking-tight">{t.title}</h2>
              <p className="text-xs text-slate-500">Zapisane na tym urządzeniu</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-6 flex-1">
          {orders.length === 0 ? (
            <div className="text-center py-16 px-4 space-y-3">
              <div className="w-16 h-16 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <ShoppingBag size={28} />
              </div>
              <h3 className="text-base font-extrabold text-slate-800">{t.emptyTitle}</h3>
              <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
                {t.emptyDesc}
              </p>
            </div>
          ) : (
            <>
              {/* Active Orders Section */}
              {activeOrders.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                      {t.activeTitle} ({activeOrders.length})
                    </span>
                  </div>

                  <div className="space-y-3">
                    {activeOrders.map((order) => (
                      <div
                        key={order.id}
                        className={`rounded-2xl p-4 border transition-all shadow-sm ${
                          order.status === 'ready_to_collect'
                            ? 'border-emerald-300 bg-emerald-50/40 ring-2 ring-emerald-400/30'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-base text-slate-900">
                                {order.orderNumber}
                              </span>
                              {getStatusBadge(order.status)}
                            </div>
                            <p className="text-xs text-slate-400 mt-1">
                              {new Date(order.orderDate).toLocaleString('pl-PL', {
                                day: '2-digit',
                                month: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                              {order.tableLabel && ` · Stolik ${order.tableLabel}`}
                              {order.parkingSpot && ` · Miejsce ${order.parkingSpot}`}
                            </p>
                          </div>
                          <span className="font-black text-base text-slate-900 whitespace-nowrap">
                            {order.totalAmount.toFixed(2)} {order.currency}
                          </span>
                        </div>

                        {/* PIN Code Box if available */}
                        {order.collectionPin && (
                          <div className="mt-3 py-2 px-3 rounded-xl bg-slate-900 text-white flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-300">{t.pinLabel}</span>
                            <span className="font-mono font-black text-base tracking-widest text-emerald-400">
                              {order.collectionPin}
                            </span>
                          </div>
                        )}

                        {/* Items Summary */}
                        {order.itemsSummary && (
                          <p className="text-xs text-slate-600 mt-2.5 line-clamp-2">
                            {order.itemsSummary}
                          </p>
                        )}

                        {/* Action Link to Order Page */}
                        <div className="mt-3 pt-3 border-t border-slate-100 flex justify-end">
                          <Link
                            href={`/order/${order.id}`}
                            onClick={onClose}
                            className="inline-flex items-center gap-1.5 text-xs font-extrabold text-brand-600 hover:text-brand-700 active:scale-95 transition-transform"
                          >
                            <span>{t.trackOrder}</span>
                            <ArrowUpRight size={14} />
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Past Orders Section */}
              {pastOrders.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                      {t.historyTitle} ({pastOrders.length})
                    </span>
                  </div>

                  <div className="space-y-2">
                    {pastOrders.map((order) => (
                      <Link
                        key={order.id}
                        href={`/order/${order.id}`}
                        onClick={onClose}
                        className="block rounded-2xl p-3.5 bg-slate-50/70 hover:bg-slate-100 border border-slate-100 transition-all active:scale-[0.99]"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-slate-800">
                                {order.orderNumber}
                              </span>
                              {getStatusBadge(order.status)}
                            </div>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              {new Date(order.orderDate).toLocaleString('pl-PL', {
                                day: '2-digit',
                                month: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </p>
                            {order.itemsSummary && (
                              <p className="text-xs text-slate-500 mt-1 truncate">
                                {order.itemsSummary}
                              </p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <span className="font-bold text-sm text-slate-800">
                              {order.totalAmount.toFixed(2)} {order.currency}
                            </span>
                            <div className="text-slate-400 flex justify-end mt-1">
                              <ChevronRight size={16} />
                            </div>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {orders.length > 0 && (
          <div className="p-3 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between px-5">
            <button
              onClick={handleClear}
              className="text-xs font-semibold text-slate-400 hover:text-red-600 flex items-center gap-1.5 transition-colors"
            >
              <Trash2 size={13} />
              <span>{t.clearHistory}</span>
            </button>
            <span className="text-[11px] text-slate-400">
              Łącznie: {orders.length}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
