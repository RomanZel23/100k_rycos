'use client'

/**
 * Brand theming for the customer app.
 * Tailwind's `brand-*` palette reads CSS variables (see tailwind.config.ts / globals.css),
 * so setting these variables recolors every button, badge and accent at runtime.
 */

export interface BrandTheme {
  accent: string // #RRGGBB
  accentText: string // #RRGGBB
  background: string // #RRGGBB
  dark: boolean // background is dark → light text on it
}

type RGB = [number, number, number]

function hexToRgb(hex: string): RGB | null {
  const clean = hex.replace('#', '').trim()
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)]
}
const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((i) => Math.round(a[i] * (1 - t) + b[i] * t)) as RGB
const triplet = (c: RGB) => `${c[0]} ${c[1]} ${c[2]}`
const luminance = (c: RGB) => (c[0] * 299 + c[1] * 587 + c[2] * 114) / 1000

/** Accepts Flutter (0xAARRGGBB), #RRGGBB, #RGB or the keywords black/white. */
export function normalizeColor(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string' || !raw.trim()) return fallback
  const v = raw.trim()
  const lower = v.toLowerCase()
  if (lower === 'black') return '#0F172A'
  if (lower === 'white') return '#FFFFFF'
  if (lower.startsWith('0x')) {
    const hex = v.slice(2)
    return hexToRgb(hex.length === 8 ? hex.slice(2) : hex) ? `#${(hex.length === 8 ? hex.slice(2) : hex).toUpperCase()}` : fallback
  }
  const withHash = v.startsWith('#') ? v : `#${v}`
  return hexToRgb(withHash) ? withHash.toUpperCase() : fallback
}

export function themeFromBrand(brand: any): BrandTheme {
  let style: any = null
  try {
    const parsed = typeof brand?.style === 'string' ? JSON.parse(brand.style) : brand?.style
    style = Array.isArray(parsed) ? parsed[0] : parsed
  } catch {}

  const accent = normalizeColor(brand?.buttonColor ?? style?.active_button_color, '#F97316')
  const background = normalizeColor(brand?.backgroundColor ?? style?.background_button_color, '#F8FAFC')
  const accentRgb = hexToRgb(accent)!
  const bgRgb = hexToRgb(background)!
  const accentText = normalizeColor(brand?.buttonTextColor, luminance(accentRgb) >= 150 ? '#0F172A' : '#FFFFFF')
  return { accent, accentText, background, dark: luminance(bgRgb) < 140 }
}

const VARS = [
  '--brand-50', '--brand-100', '--brand-200', '--brand-500', '--brand-600', '--brand-700', '--brand-text',
  '--menu-bg', '--menu-nav-bg', '--menu-fg', '--menu-muted', '--background', '--foreground',
]

export function applyBrandTheme(theme: BrandTheme, opts: { background?: boolean } = { background: true }) {
  const root = document.documentElement.style
  const a = hexToRgb(theme.accent)!
  const white: RGB = [255, 255, 255]
  const black: RGB = [0, 0, 0]
  root.setProperty('--brand-50', triplet(mix(a, white, 0.92)))
  root.setProperty('--brand-100', triplet(mix(a, white, 0.85)))
  root.setProperty('--brand-200', triplet(mix(a, white, 0.7)))
  root.setProperty('--brand-500', triplet(a))
  root.setProperty('--brand-600', triplet(mix(a, black, 0.14)))
  root.setProperty('--brand-700', triplet(mix(a, black, 0.3)))
  root.setProperty('--brand-text', triplet(hexToRgb(theme.accentText)!))

  if (opts.background !== false) {
    const bg = hexToRgb(theme.background)!
    root.setProperty('--menu-bg', theme.background)
    root.setProperty('--menu-nav-bg', `rgba(${bg[0]}, ${bg[1]}, ${bg[2]}, 0.95)`)
    root.setProperty('--menu-fg', theme.dark ? '#F8FAFC' : '#0F172A')
    root.setProperty('--menu-muted', theme.dark ? 'rgba(248, 250, 252, 0.7)' : '#64748B')
    root.setProperty('--background', theme.background)
    root.setProperty('--foreground', theme.dark ? '#F8FAFC' : '#0F172A')
  }
}

export function clearBrandTheme() {
  const root = document.documentElement.style
  VARS.forEach((v) => root.removeProperty(v))
}

const KEY = (brandId: number | string) => `rycos_brand_theme:${brandId}`

/** Remember the theme so the order tracker (/order/[id]) keeps the brand look. */
export function rememberBrandTheme(brandId: number | string, theme: BrandTheme) {
  try { sessionStorage.setItem(KEY(brandId), JSON.stringify(theme)) } catch {}
}
export function recallBrandTheme(brandId: number | string): BrandTheme | null {
  try {
    const raw = sessionStorage.getItem(KEY(brandId))
    return raw ? (JSON.parse(raw) as BrandTheme) : null
  } catch {
    return null
  }
}
