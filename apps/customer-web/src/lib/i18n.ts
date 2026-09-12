export type Language = 'pl' | 'en' | 'de';

const LANG_STORAGE_KEY = 'rycos_selected_language';

export function getStoredLanguage(): Language {
  if (typeof window === 'undefined') return 'pl';
  try {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    if (stored === 'pl' || stored === 'en' || stored === 'de') {
      return stored;
    }
  } catch {}
  return 'pl';
}

export function saveStoredLanguage(lang: Language): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
    window.dispatchEvent(new Event('rycos_language_changed'));
  } catch {}
}

export interface Translations {
  // Navigation & General
  cart: string;
  orderAndPay: string;
  table: string;
  parking: string;
  takeaway: string;
  emptyCart: string;
  emptyCartSub: string;
  add: string;
  total: string;
  tip: string;
  subtotal: string;
  payWithBlik: string;
  payCard: string;
  cash: string;
  kdsTitle: string;
  preparing: string;
  ready: string;
  completed: string;
  newOrder: string;
  pin: string;
  allCategories: string;
  chooseAddons: string;
  optional: string;
  required: string;
  orderSummary: string;
  nipOptional: string;
  nipPlaceholder: string;
  tipPrompt: string;
  callWaiter: string;
  orderHistory: string;

  // Cart Drawer
  cartTitle: string;
  cartEmptyNotice: string;
  serviceTip: string;
  noTip: string;
  totalToPay: string;
  proceedToPayment: string;

  // Addon Modal
  specialInstructionsLabel: string;
  specialInstructionsPlaceholder: string;
  addToOrder: string;

  // Payment Modal
  selectPaymentMethod: string;
  amountToPay: string;
  blikFast: string;
  cardWallet: string;
  payAtCounterTitle: string;
  payAtCounterSub: string;
  connectingGateway: string;
  confirmOrder: string;
  payAmount: string;
  paymentError: string;

  // Order Tracking Screen (/order/[id])
  orderTrackingTitle: string;
  orderStatusPaid: string;
  orderStatusPaidSub: string;
  orderStatusInProgress: string;
  orderStatusInProgressSub: string;
  orderStatusReady: string;
  orderStatusReadySub: string;
  orderStatusCompleted: string;
  orderStatusCompletedSub: string;
  pickupPinLabel: string;
  pickupPinSub: string;
  pickupQrSub: string;
  orderDetails: string;
  downloadReceipt: string;
  fiscalRegistered: string;
  backToMenu: string;
  paymentFailedBanner: string;
  retryPayment: string;
  orderWord: string;
  orderPreparing: string;
  orderReadyBanner: string;
  orderCompletedBanner: string;
  orderPendingBanner: string;
  orderPaidBanner: string;
  orderPickupBannerHelp: string;
  pickupReadyCall: string;
  waitingForKitchen: string;
  dishesBeingPrepared: string;
  thankYouVisitAgain: string;
  fiscalReceiptTitle: string;
  downloadPdf: string;
  orderNotFound: string;
  orderNotFoundSub: string;
  fetchingOrderStatus: string;
}

export const i18n: Record<Language, Translations> = {
  pl: {
    cart: 'Koszyk',
    orderAndPay: 'Zamów i zapłać',
    table: 'Stolik',
    parking: 'Miejsce parkingowe',
    takeaway: 'Na wynos',
    emptyCart: 'Twój koszyk jest pusty',
    emptyCartSub: 'Wybierz pyszne pozycje z menu i dodaj je do zamówienia',
    add: 'Dodaj',
    total: 'Razem',
    tip: 'Napiwek dla załogi',
    subtotal: 'Wartość zamówienia',
    payWithBlik: 'Zapłać BLIKiem',
    payCard: 'Karta płatnicza / Apple Pay',
    cash: 'Płatność przy odbiorze',
    kdsTitle: 'Ekran Kuchenny (KDS)',
    preparing: 'W przygotowaniu',
    ready: 'Gotowe do odbioru',
    completed: 'Wydano',
    newOrder: 'Nowe zamówienie!',
    pin: 'Kod odbioru PIN',
    allCategories: 'Wszystkie pozycje',
    chooseAddons: 'Dostosuj swoje danie',
    optional: 'Opcjonalnie',
    required: 'Wymagane',
    orderSummary: 'Podsumowanie zamówienia',
    nipOptional: 'Chcę paragon z NIP',
    nipPlaceholder: 'Wpisz NIP firmy',
    tipPrompt: 'Doceniasz pracę kuchni? Zostaw drobny napiwek:',
    callWaiter: 'Wezwij obsługę',
    orderHistory: 'Moje zamówienia',

    // Cart Drawer
    cartTitle: 'Twój Koszyk',
    cartEmptyNotice: 'Koszyk jest pusty',
    serviceTip: 'Napiwek dla obsługi:',
    noTip: 'Brak',
    totalToPay: 'Razem do zapłaty:',
    proceedToPayment: 'Przejdź do płatności',

    // Addon Modal
    specialInstructionsLabel: 'Uwagi do pozycji',
    specialInstructionsPlaceholder: 'np. bez cebuli, sos osobno...',
    addToOrder: 'Dodaj do zamówienia',

    // Payment Modal
    selectPaymentMethod: 'Wybierz metodę płatności',
    amountToPay: 'Kwota do zapłaty:',
    blikFast: 'Szybka płatność kodem BLIK',
    cardWallet: 'Karta płatnicza / Apple Pay / Google Pay',
    payAtCounterTitle: 'Płatność przy odbiorze / u obsługi',
    payAtCounterSub: 'Gotówka lub tradycyjny terminal',
    connectingGateway: 'Łączenie z bramką Saferpay...',
    confirmOrder: 'Zatwierdź zamówienie',
    payAmount: 'Zapłać',
    paymentError: 'Błąd połączenia z bramką płatności',

    // Order Tracking Screen
    orderTrackingTitle: 'Status Twojego zamówienia',
    orderStatusPaid: 'Opłacone',
    orderStatusPaidSub: 'Płatność potwierdzona',
    orderStatusInProgress: 'W przygotowaniu',
    orderStatusInProgressSub: 'Dania przygotowywane w kuchni',
    orderStatusReady: 'Gotowe do odbioru!',
    orderStatusReadySub: 'Czeka na odbiór przy ladzie',
    orderStatusCompleted: 'Odebrane',
    orderStatusCompletedSub: 'Zamówienie zrealizowane',
    pickupPinLabel: 'Kod odbioru PIN',
    pickupPinSub: 'Pokaż ten kod obsłudze przy odbiorze',
    pickupQrSub: 'Zeskanuj przy odbiorze przy ladzie',
    orderDetails: 'Szczegóły zamówienia',
    downloadReceipt: 'Pobierz paragon fiskalny (PDF)',
    fiscalRegistered: 'Kasa fiskalna zarejestrowała transakcję',
    backToMenu: 'Wróć do menu',
    paymentFailedBanner: 'Płatność nie powiodła się. Możesz spróbować ponownie.',
    retryPayment: 'Spróbuj zapłacić ponownie',
    orderWord: 'Zamówienie',
    orderPreparing: 'Kuchnia przygotowuje Twoje dania',
    orderReadyBanner: 'Zamówienie jest GOTOWE do odbioru!',
    orderCompletedBanner: 'Zamówienie odebrane • Dziękujemy!',
    orderPendingBanner: 'Oczekiwanie na opłacenie zamówienia',
    orderPaidBanner: 'Płatność potwierdzona • Przekazano do kuchni',
    orderPickupBannerHelp: 'Pokaż ten PIN lub numer zamówienia przy odbiorze',
    pickupReadyCall: 'Zapraszamy po odbiór do punktu wydawania!',
    waitingForKitchen: 'Oczekuje na realizację w kuchni...',
    dishesBeingPrepared: 'Dania są przygotowywane w kuchni...',
    thankYouVisitAgain: 'Dziękujemy i zapraszamy ponownie!',
    fiscalReceiptTitle: 'E-Paragon Fiskalny (RYCOS)',
    downloadPdf: 'Pobierz PDF',
    orderNotFound: 'Nie znaleziono zamówienia',
    orderNotFoundSub: 'Upewnij się, że link z kodem QR jest poprawny.',
    fetchingOrderStatus: 'Pobieranie statusu zamówienia...',
  },

  en: {
    cart: 'Cart',
    orderAndPay: 'Order & Pay',
    table: 'Table',
    parking: 'Parking spot',
    takeaway: 'Takeaway',
    emptyCart: 'Your cart is empty',
    emptyCartSub: 'Choose delicious items from the menu to start your order',
    add: 'Add',
    total: 'Total',
    tip: 'Tip for the crew',
    subtotal: 'Order subtotal',
    payWithBlik: 'Pay with BLIK',
    payCard: 'Credit card / Apple Pay',
    cash: 'Pay at counter / Cash',
    kdsTitle: 'Kitchen Display System (KDS)',
    preparing: 'In Preparation',
    ready: 'Ready for Pickup',
    completed: 'Completed',
    newOrder: 'New order received!',
    pin: 'Pickup PIN',
    allCategories: 'All Items',
    chooseAddons: 'Customize your item',
    optional: 'Optional',
    required: 'Required',
    orderSummary: 'Order Summary',
    nipOptional: 'Company invoice (Tax ID / VAT)',
    nipPlaceholder: 'Enter Tax ID',
    tipPrompt: 'Enjoyed the food? Leave a small tip for the team:',
    callWaiter: 'Call Waiter',
    orderHistory: 'My Orders',

    // Cart Drawer
    cartTitle: 'Your Cart',
    cartEmptyNotice: 'Your cart is empty',
    serviceTip: 'Gratuity for staff:',
    noTip: 'None',
    totalToPay: 'Total to pay:',
    proceedToPayment: 'Proceed to Payment',

    // Addon Modal
    specialInstructionsLabel: 'Special instructions',
    specialInstructionsPlaceholder: 'e.g. no onions, sauce on the side...',
    addToOrder: 'Add to order',

    // Payment Modal
    selectPaymentMethod: 'Select payment method',
    amountToPay: 'Amount to pay:',
    blikFast: 'Fast payment with BLIK code',
    cardWallet: 'Credit card / Apple Pay / Google Pay',
    payAtCounterTitle: 'Pay upon pickup / with waiter',
    payAtCounterSub: 'Cash or standard terminal',
    connectingGateway: 'Connecting to Saferpay gateway...',
    confirmOrder: 'Confirm order',
    payAmount: 'Pay',
    paymentError: 'Payment gateway connection error',

    // Order Tracking Screen
    orderTrackingTitle: 'Your Order Status',
    orderStatusPaid: 'Paid',
    orderStatusPaidSub: 'Payment confirmed',
    orderStatusInProgress: 'In Preparation',
    orderStatusInProgressSub: 'Dishes being prepared in the kitchen',
    orderStatusReady: 'Ready for Pickup!',
    orderStatusReadySub: 'Waiting for pickup at the counter',
    orderStatusCompleted: 'Completed',
    orderStatusCompletedSub: 'Order fulfilled',
    pickupPinLabel: 'Pickup PIN Code',
    pickupPinSub: 'Show this code when collecting your order',
    pickupQrSub: 'Scan at the counter upon pickup',
    orderDetails: 'Order Details',
    downloadReceipt: 'Download fiscal receipt (PDF)',
    fiscalRegistered: 'Fiscal cash register processed this transaction',
    backToMenu: 'Back to Menu',
    paymentFailedBanner: 'Payment failed. You can try again.',
    retryPayment: 'Try payment again',
    orderWord: 'Order',
    orderPreparing: 'Kitchen is preparing your meal',
    orderReadyBanner: 'Order is READY for pickup!',
    orderCompletedBanner: 'Order picked up • Thank you!',
    orderPendingBanner: 'Waiting for order payment',
    orderPaidBanner: 'Payment confirmed • Sent to kitchen',
    orderPickupBannerHelp: 'Show this PIN or order number upon pickup',
    pickupReadyCall: 'Please proceed to pickup counter!',
    waitingForKitchen: 'Waiting for preparation in kitchen...',
    dishesBeingPrepared: 'Dishes are being prepared in the kitchen...',
    thankYouVisitAgain: 'Thank you and visit us again!',
    fiscalReceiptTitle: 'E-Fiscal Receipt (RYCOS)',
    downloadPdf: 'Download PDF',
    orderNotFound: 'Order not found',
    orderNotFoundSub: 'Please ensure your QR code link is correct.',
    fetchingOrderStatus: 'Loading order status...',
  },

  de: {
    cart: 'Warenkorb',
    orderAndPay: 'Bestellen & Bezahlen',
    table: 'Tisch',
    parking: 'Parkplatz',
    takeaway: 'Zum Mitnehmen',
    emptyCart: 'Ihr Warenkorb ist leer',
    emptyCartSub: 'Wählen Sie köstliche Gerichte aus der Speisekarte',
    add: 'Hinzufügen',
    total: 'Gesamt',
    tip: 'Trinkgeld für das Team',
    subtotal: 'Zwischensumme',
    payWithBlik: 'Mit BLIK bezahlen',
    payCard: 'Kreditkarte / Apple Pay',
    cash: 'Barzahlung bei Abholung',
    kdsTitle: 'Küchenbildschirm (KDS)',
    preparing: 'In Zubereitung',
    ready: 'Abholbereit',
    completed: 'Ausgegeben',
    newOrder: 'Neue Bestellung eingegangen!',
    pin: 'Abholcode PIN',
    allCategories: 'Alle Gerichte',
    chooseAddons: 'Gericht anpassen',
    optional: 'Optional',
    required: 'Erforderlich',
    orderSummary: 'Bestellübersicht',
    nipOptional: 'Rechnung für Unternehmen (USt-IdNr.)',
    nipPlaceholder: 'USt-IdNr. eingeben',
    tipPrompt: 'Zufrieden mit dem Service? Ein kleines Trinkgeld dalassen:',
    callWaiter: 'Kellner rufen',
    orderHistory: 'Meine Bestellungen',

    // Cart Drawer
    cartTitle: 'Ihr Warenkorb',
    cartEmptyNotice: 'Ihr Warenkorb ist leer',
    serviceTip: 'Trinkgeld für das Personal:',
    noTip: 'Keines',
    totalToPay: 'Gesamtbetrag:',
    proceedToPayment: 'Zur Kasse',

    // Addon Modal
    specialInstructionsLabel: 'Besondere Hinweise',
    specialInstructionsPlaceholder: 'z.B. ohne Zwiebeln, Sauce separat...',
    addToOrder: 'Zur Bestellung hinzufügen',

    // Payment Modal
    selectPaymentMethod: 'Zahlungsmethode wählen',
    amountToPay: 'Zu zahlender Betrag:',
    blikFast: 'Schnelle Zahlung mit BLIK-Code',
    cardWallet: 'Kreditkarte / Apple Pay / Google Pay',
    payAtCounterTitle: 'Barzahlung bei Abholung / beim Kellner',
    payAtCounterSub: 'Bargeld oder normales Terminal',
    connectingGateway: 'Verbindung zur Saferpay-Zahlungsplattform...',
    confirmOrder: 'Bestellung bestätigen',
    payAmount: 'Bezahlen',
    paymentError: 'Verbindungsfehler zur Zahlungsplattform',

    // Order Tracking Screen
    orderTrackingTitle: 'Status Ihrer Bestellung',
    orderStatusPaid: 'Bezahlt',
    orderStatusPaidSub: 'Zahlung bestätigt',
    orderStatusInProgress: 'In Zubereitung',
    orderStatusInProgressSub: 'Gerichte werden in der Küche zubereitet',
    orderStatusReady: 'Abholbereit!',
    orderStatusReadySub: 'Wartet an der Ausgabe auf Sie',
    orderStatusCompleted: 'Ausgegeben',
    orderStatusCompletedSub: 'Bestellung abgeschlossen',
    pickupPinLabel: 'Abhol-PIN',
    pickupPinSub: 'Diesen Code bei der Abholung vorzeigen',
    pickupQrSub: 'Bei Abholung an der Theke scannen',
    orderDetails: 'Bestelldetails',
    downloadReceipt: 'Kassenbon herunterladen (PDF)',
    fiscalRegistered: 'Fiskalkasse hat die Transaktion registriert',
    backToMenu: 'Zurück zur Speisekarte',
    paymentFailedBanner: 'Zahlung fehlgeschlagen. Bitte versuchen Sie es erneut.',
    retryPayment: 'Zahlung erneut versuchen',
    orderWord: 'Bestellung',
    orderPreparing: 'Küche bereitet Ihre Speisen zu',
    orderReadyBanner: 'Bestellung ist ABHOLBEREIT!',
    orderCompletedBanner: 'Bestellung abgeholt • Vielen Dank!',
    orderPendingBanner: 'Warten auf Bezahlung der Bestellung',
    orderPaidBanner: 'Zahlung bestätigt • An die Küche übermittelt',
    orderPickupBannerHelp: 'Diesen PIN oder Bestellnummer bei Abholung vorzeigen',
    pickupReadyCall: 'Bitte an der Ausgabetheke abholen!',
    waitingForKitchen: 'Wartet auf Zubereitung in der Küche...',
    dishesBeingPrepared: 'Gerichte werden in der Küche zubereitet...',
    thankYouVisitAgain: 'Vielen Dank und bis zum nächsten Mal!',
    fiscalReceiptTitle: 'E-Kassenbon (RYCOS)',
    downloadPdf: 'PDF herunterladen',
    orderNotFound: 'Bestellung nicht gefunden',
    orderNotFoundSub: 'Bitte überprüfen Sie den QR-Code-Link.',
    fetchingOrderStatus: 'Bestellstatus wird geladen...',
  },
};
