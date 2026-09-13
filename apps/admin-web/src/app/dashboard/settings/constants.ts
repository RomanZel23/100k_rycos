// Plain constants (NOT a 'use server' module, so non-function exports are allowed).
// Add-ons and categories used to live here but are now core features (always
// shown when present), so they don't belong as toggles.
export const FEATURE_KEYS = ['show_sharing', 'show_tnc', 'show_pp', 'show_receipt_qr'] as const

export const FEATURE_LABELS: Record<string, { pl: string; en: string; de: string }> = {
  show_sharing: {
    pl: 'Udostępnianie menu (kod QR i link)',
    en: 'Share menu (QR code & link)',
    de: 'Menü teilen (QR-Code & Link)',
  },
  show_tnc: {
    pl: 'Regulamin w menu i koszyku',
    en: 'Terms & conditions in menu & cart',
    de: 'AGB im Menü & Warenkorb',
  },
  show_pp: {
    pl: 'Polityka prywatności w stopce',
    en: 'Privacy policy in footer',
    de: 'Datenschutzerklärung in der Fußzeile',
  },
  show_receipt_qr: {
    pl: 'Kod QR e-paragonu na odebranym zamówieniu',
    en: 'Receipt QR code on collected orders',
    de: 'Quittungs-QR-Code bei abgeholten Bestellungen',
  },
}

export const FEATURE_DESCRIPTIONS: Record<string, { pl: string; en: string; de: string }> = {
  show_sharing: {
    pl: 'Wyświetla przycisk i okno z kodem QR do szybkiego udostępniania menu znajomym przy stoliku.',
    en: 'Displays a button and QR popup to quickly share the menu with friends at the table.',
    de: 'Zeigt eine Schaltfläche und ein QR-Popup an, um das Menü schnell mit Freunden am Tisch zu teilen.',
  },
  show_tnc: {
    pl: 'Wyświetla odnośnik do Regulaminu zdefiniowanego w danych firmy.',
    en: 'Displays a link to the Terms & Conditions defined in company details.',
    de: 'Zeigt einen Link zu den in den Unternehmensdaten definierten AGB an.',
  },
  show_pp: {
    pl: 'Wyświetla odnośnik do Polityki prywatności zdefiniowanej w danych firmy.',
    en: 'Displays a link to the Privacy Policy defined in company details.',
    de: 'Zeigt einen Link zur in den Unternehmensdaten definierten Datenschutzerklärung an.',
  },
  show_receipt_qr: {
    pl: 'Umożliwia klientowi i obsłudze natychmiastowe zeskanowanie kodu QR i pobranie wystawionego e-paragonu.',
    en: 'Allows customers and staff to instantly scan a QR code to view and download issued e-receipts.',
    de: 'Ermöglicht Kunden und Personal das sofortige Scannen eines QR-Codes zum Herunterladen von e-Belegen.',
  },
}

export const BUSINESS_TYPES = [
  { v: 'product', l: 'Products / F&B / Retail' },
  { v: 'service', l: 'Services' },
  { v: 'ticket', l: 'Tickets & Events' },
  { v: 'petrol_pump', l: 'Petrol / Fuel' },
]
