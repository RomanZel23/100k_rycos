export type Language = 'pl' | 'en' | 'de';

export interface Translations {
  cart: string;
  orderAndPay: string;
  table: string;
  parking: string;
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
}

export const i18n: Record<Language, Translations> = {
  pl: {
    cart: 'Koszyk',
    orderAndPay: 'Zamów i zapłać',
    table: 'Stolik',
    parking: 'Miejsce parkingowe',
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
  },
  en: {
    cart: 'Cart',
    orderAndPay: 'Order & Pay',
    table: 'Table',
    parking: 'Parking spot',
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
  },
  de: {
    cart: 'Warenkorb',
    orderAndPay: 'Bestellen & Bezahlen',
    table: 'Tisch',
    parking: 'Parkplatz',
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
  },
};
