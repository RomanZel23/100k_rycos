// Plain constants (NOT a 'use server' module, so non-function exports are allowed).
// Add-ons and categories used to live here but are now core features (always
// shown when present), so they don't belong as toggles.
export const FEATURE_KEYS = ['show_sharing', 'show_tnc', 'show_pp', 'show_receipt_qr'] as const

export const FEATURE_LABELS: Record<string, string> = {
  show_sharing: 'Show sharing options',
  show_tnc: 'Show terms & conditions',
  show_pp: 'Show privacy policy',
  show_receipt_qr: 'Show receipt QR code on collected orders (Counter app)',
  // pos_receipt_upside_down deliberately NOT here — moved to a per-device
  // local toggle (Counter app → hamburger menu → User Settings), since it's
  // a property of which way a specific tablet is physically oriented at the
  // counter, not a company-wide policy.
}

export const BUSINESS_TYPES = [
  { v: 'product', l: 'Products / F&B / Retail' },
  { v: 'service', l: 'Services' },
  { v: 'ticket', l: 'Tickets & Events' },
  { v: 'petrol_pump', l: 'Petrol / Fuel' },
]
