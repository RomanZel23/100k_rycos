'use client'

import { useState, useId } from 'react'

interface BrandColorPickerProps {
  initialActiveColor?: string
  initialBgColor?: string
}

const PRESET_BUTTON_COLORS = [
  { name: 'Rycos Orange', hex: '#FF8800' },
  { name: 'Czerwień', hex: '#E53935' },
  { name: 'Szmaragd', hex: '#10B981' },
  { name: 'Kobalt', hex: '#2563EB' },
  { name: 'Fiolet', hex: '#8B5CF6' },
  { name: 'Bursztyn', hex: '#F59E0B' },
  { name: 'Róż', hex: '#EC4899' },
  { name: 'Grafit', hex: '#374151' },
]

function toHex(color?: string, fallback = '#FF8800'): string {
  if (!color) return fallback
  const c = color.trim()
  if (c.startsWith('#')) {
    if (c.length === 4) {
      return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`.toUpperCase()
    }
    return c.slice(0, 7).toUpperCase()
  }
  if (c.startsWith('0x') || c.startsWith('0X')) {
    const raw = c.slice(2)
    if (raw.length === 8) {
      return `#${raw.slice(2)}`.toUpperCase()
    }
    if (raw.length === 6) {
      return `#${raw}`.toUpperCase()
    }
  }
  const map: Record<string, string> = {
    black: '#000000',
    white: '#FFFFFF',
    orange: '#FF8800',
    red: '#E53935',
    blue: '#2563EB',
    green: '#10B981',
  }
  return map[c.toLowerCase()] ?? fallback
}

function toFlutterColor(hex: string): string {
  const clean = hex.replace('#', '').trim()
  if (clean.length === 6) {
    return `0xFF${clean.toUpperCase()}`
  }
  return '0xFFFF8800'
}

function getContrastColor(hex: string): string {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return '#FFFFFF'
  const r = parseInt(clean.substring(0, 2), 16)
  const g = parseInt(clean.substring(2, 4), 16)
  const b = parseInt(clean.substring(4, 6), 16)
  const yiq = (r * 299 + g * 587 + b * 114) / 1000
  return yiq >= 150 ? '#111827' : '#FFFFFF'
}

export function BrandColorPicker({
  initialActiveColor = '0xFFFF8800',
  initialBgColor = 'black',
}: BrandColorPickerProps) {
  const activeColorInputId = useId()
  const [activeHex, setActiveHex] = useState(() => toHex(initialActiveColor, '#FF8800'))

  // BG Color can be 'black', 'white', or hex
  const [bgMode, setBgMode] = useState<'black' | 'white' | 'custom'>(() => {
    const lower = (initialBgColor || '').toLowerCase().trim()
    if (lower === 'black' || lower === '#000000' || lower === '#121212' || lower === '0xff000000') return 'black'
    if (lower === 'white' || lower === '#ffffff' || lower === '0xffffffff') return 'white'
    return 'custom'
  })
  const [customBgHex, setCustomBgHex] = useState(() => {
    const lower = (initialBgColor || '').toLowerCase().trim()
    if (lower === 'black' || lower === 'white') return '#1E293B'
    return toHex(initialBgColor, '#1E293B')
  })

  const currentBgHex = bgMode === 'black' ? '#0F172A' : bgMode === 'white' ? '#FFFFFF' : customBgHex
  const isDarkBg = bgMode === 'black' || (bgMode === 'custom' && getContrastColor(currentBgHex) === '#FFFFFF')
  const buttonTextColor = getContrastColor(activeHex)
  const flutterActiveColor = toFlutterColor(activeHex)
  const submittedBgColor = bgMode === 'black' ? 'black' : bgMode === 'white' ? 'white' : customBgHex

  const handleHexChange = (val: string) => {
    let clean = val.trim()
    if (!clean.startsWith('#') && clean.length > 0) {
      clean = '#' + clean
    }
    setActiveHex(clean)
  }

  return (
    <div className="space-y-4">
      {/* Hidden inputs submitted with the form */}
      <input type="hidden" name="active_button_color" value={flutterActiveColor} />
      <input type="hidden" name="background_button_color" value={submittedBgColor} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Left Column: Color Controls */}
        <div className="space-y-4">
          {/* Active Button Color */}
          <div>
            <label className="label" htmlFor={activeColorInputId}>
              Kolor przycisków i akcentów
            </label>
            <div className="flex items-center gap-3">
              {/* Native color picker circle */}
              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-neutral-300 shadow-sm transition hover:scale-105">
                <input
                  id={activeColorInputId}
                  type="color"
                  value={activeHex.length === 7 ? activeHex : '#FF8800'}
                  onChange={(e) => setActiveHex(e.target.value.toUpperCase())}
                  className="absolute -top-3 -left-3 h-16 w-16 cursor-pointer border-0 p-0 opacity-0"
                  title="Wybierz kolor z palety"
                />
                <div
                  className="h-full w-full pointer-events-none"
                  style={{ backgroundColor: activeHex.length === 7 ? activeHex : '#FF8800' }}
                />
              </div>

              {/* Hex input */}
              <div className="relative flex-1">
                <input
                  type="text"
                  value={activeHex}
                  maxLength={7}
                  onChange={(e) => handleHexChange(e.target.value)}
                  placeholder="#FF8800"
                  className="input font-mono uppercase"
                />
              </div>

              {/* Flutter code badge */}
              <div className="hidden sm:block text-right">
                <span className="block text-[10px] uppercase font-semibold text-neutral-400">Kod aplikacji</span>
                <span className="font-mono text-xs text-neutral-600 bg-neutral-100 px-2 py-1 rounded">
                  {flutterActiveColor}
                </span>
              </div>
            </div>

            {/* Quick Presets */}
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-neutral-400 mr-1">Polecane:</span>
              {PRESET_BUTTON_COLORS.map((preset) => (
                <button
                  key={preset.hex}
                  type="button"
                  onClick={() => setActiveHex(preset.hex)}
                  title={preset.name}
                  className={`h-6 w-6 rounded-full border border-black/10 transition transform hover:scale-110 focus:outline-none ${
                    activeHex.toUpperCase() === preset.hex.toUpperCase() ? 'ring-2 ring-brand ring-offset-2 scale-110' : ''
                  }`}
                  style={{ backgroundColor: preset.hex }}
                />
              ))}
            </div>
          </div>

          {/* Background Color Mode */}
          <div>
            <label className="label">Kolor motywu tła (Background)</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setBgMode('black')}
                className={`flex items-center justify-center gap-2 rounded-lg border p-2.5 text-xs font-medium transition ${
                  bgMode === 'black'
                    ? 'border-neutral-900 bg-neutral-900 text-white shadow-sm ring-1 ring-neutral-900'
                    : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                }`}
              >
                <span className="h-3.5 w-3.5 rounded-full bg-black border border-white/20" />
                Ciemny
              </button>

              <button
                type="button"
                onClick={() => setBgMode('white')}
                className={`flex items-center justify-center gap-2 rounded-lg border p-2.5 text-xs font-medium transition ${
                  bgMode === 'white'
                    ? 'border-neutral-900 bg-neutral-100 text-neutral-900 shadow-sm ring-1 ring-neutral-900'
                    : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                }`}
              >
                <span className="h-3.5 w-3.5 rounded-full bg-white border border-neutral-300" />
                Jasny
              </button>

              <button
                type="button"
                onClick={() => setBgMode('custom')}
                className={`flex items-center justify-center gap-2 rounded-lg border p-2.5 text-xs font-medium transition ${
                  bgMode === 'custom'
                    ? 'border-neutral-900 bg-neutral-100 text-neutral-900 shadow-sm ring-1 ring-neutral-900'
                    : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                }`}
              >
                <span
                  className="h-3.5 w-3.5 rounded-full border border-neutral-300"
                  style={{ backgroundColor: customBgHex }}
                />
                Własny
              </button>
            </div>

            {bgMode === 'custom' && (
              <div className="mt-2.5 flex items-center gap-3">
                <input
                  type="color"
                  value={customBgHex}
                  onChange={(e) => setCustomBgHex(e.target.value.toUpperCase())}
                  className="h-9 w-12 cursor-pointer rounded border border-neutral-300 p-0.5"
                />
                <input
                  type="text"
                  value={customBgHex}
                  maxLength={7}
                  onChange={(e) => setCustomBgHex(e.target.value.toUpperCase())}
                  placeholder="#1E293B"
                  className="input font-mono uppercase"
                />
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Interactive Live Preview */}
        <div>
          <div className="flex items-center justify-between">
            <span className="label">Podgląd na żywo (Menu / Aplikacja)</span>
            <span className="text-[11px] text-neutral-400">Podgląd w czasie rzeczywistym</span>
          </div>

          <div
            className="rounded-xl p-4 transition-colors duration-200 border shadow-inner"
            style={{
              backgroundColor: currentBgHex,
              borderColor: isDarkBg ? '#334155' : '#E2E8F0',
            }}
          >
            {/* Header Simulation */}
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div
                  className="h-7 w-7 rounded-md flex items-center justify-center text-xs font-bold shadow-sm"
                  style={{ backgroundColor: activeHex, color: buttonTextColor }}
                >
                  R
                </div>
                <span className={`text-sm font-semibold ${isDarkBg ? 'text-white' : 'text-neutral-900'}`}>
                  Przykładowe menu
                </span>
              </div>
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{
                  backgroundColor: `${activeHex}25`,
                  color: isDarkBg ? '#FFFFFF' : activeHex,
                  border: `1px solid ${activeHex}40`,
                }}
              >
                Otwarte
              </span>
            </div>

            {/* Product Card Simulation */}
            <div
              className={`mt-3.5 rounded-lg p-3 transition-colors ${
                isDarkBg ? 'bg-white/5 border border-white/10' : 'bg-neutral-50 border border-neutral-200'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className={`text-sm font-semibold ${isDarkBg ? 'text-white' : 'text-neutral-900'}`}>
                    Burger Klasyczny BBQ
                  </h4>
                  <p className={`text-xs mt-0.5 line-clamp-1 ${isDarkBg ? 'text-neutral-400' : 'text-neutral-500'}`}>
                    100% wołowina, pikle, prażona cebulka, sos BBQ
                  </p>
                </div>
                <span className={`text-sm font-bold shrink-0 ${isDarkBg ? 'text-neutral-200' : 'text-neutral-900'}`}>
                  34,00 zł
                </span>
              </div>

              {/* Action Button Preview */}
              <div className="mt-3 flex items-center justify-between pt-1">
                <span className={`text-[11px] ${isDarkBg ? 'text-neutral-400' : 'text-neutral-500'}`}>
                  Dostępne od ręki
                </span>
                <button
                  type="button"
                  tabIndex={-1}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold shadow-sm transition-transform active:scale-95"
                  style={{
                    backgroundColor: activeHex,
                    color: buttonTextColor,
                  }}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                  </svg>
                  <span>Dodaj</span>
                </button>
              </div>
            </div>

            {/* Bottom floating cart simulation */}
            <div className="mt-3 flex items-center justify-between pt-2 text-xs">
              <span className={isDarkBg ? 'text-neutral-400' : 'text-neutral-500'}>
                Podgląd przycisków i motywu
              </span>
              <div
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium shadow-sm"
                style={{
                  backgroundColor: activeHex,
                  color: buttonTextColor,
                }}
              >
                <span>Koszyk (1)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
