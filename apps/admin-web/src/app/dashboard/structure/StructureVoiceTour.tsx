'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'

export type TourTarget =
  | 'location-template'
  | 'frame-canvas'
  | 'add-terminal'
  | 'brands-devices'
  | 'pins-legend'
  | 'inspector-panel'
  | 'save-controls'

export interface VoiceTourStep {
  id: TourTarget
  badge: string
  title: string
  speech: string
  tip: string
  actionLabel?: string
}

export const VOICE_TOUR_STEPS: VoiceTourStep[] = [
  {
    id: 'location-template',
    badge: 'Krok 1 z 7',
    title: 'Szybki start: Szablon lokalu lub nowa Lokalizacja',
    speech:
      'Witaj w przewodniku głosowym po strukturze lokalu! Jeśli konfigurujesz lokal po raz pierwszy, najprościej wybrać gotowy układ z listy „Szablon lokalu” na górnym pasku – na przykład Restauracja lub Kawiarnia. Możesz też kliknąć przycisk „Plus Lokalizacja”, aby dodać pustą ramkę lokalu od zera.',
    tip: 'Wskazówka: Wybierz „+ Szablon lokalu…” lub kliknij „+ Lokalizacja” na podświetlonym pasku u góry.',
  },
  {
    id: 'frame-canvas',
    badge: 'Krok 2 z 7',
    title: 'Ramka Lokalizacji i stoliki QR',
    speech:
      'Każda przerywana ramka na planszy to Twój fizyczny lokal. Wszystkie marki, stanowiska oraz urządzenia należące do tego lokalu przeciągnij myszką do wnętrza tej ramki. Gdy klikniesz w nagłówek ramki, w panelu po prawej stronie zmienisz jej nazwę i wpiszesz listę stolików dla kodów QR.',
    tip: 'Wskazówka: Przeciągnij kafelki do wnętrza ramki lokalizacji. Kliknij nazwę ramki, aby edytować jej stoliki.',
    actionLabel: 'Pokaż ustawienia lokalizacji →',
  },
  {
    id: 'add-terminal',
    badge: 'Krok 3 z 7',
    title: 'Dodawanie stanowisk (POS, KDS, Kiosk, TV)',
    speech:
      'Aby dodać stanowisko pracy, wybierz jego rolę z pierwszej listy na górnym pasku – na przykład Kasjer POS, Kuchnia KDS, Kiosk samoobsługowy albo Ekran TV z numerami zamówień – i kliknij przycisk „Plus Stanowisko”. Nowy kafelek od razu pojawi się na planszy.',
    tip: 'Wskazówka: Wybierz rolę z listy (np. Kasjer POS / Kuchnia KDS) i kliknij „+ Stanowisko”.',
  },
  {
    id: 'brands-devices',
    badge: 'Krok 4 z 7',
    title: 'Marki sprzedażowe i urządzenia (SBF / SBR)',
    speech:
      'Kafelki z zieloną ikoną M to Twoje marki, czyli menu widoczne dla klientów i kasjerów. Kafelki z pomarańczową ikoną SBF lub SBR to drukarki fiskalne i terminale płatnicze. Nowe marki oraz urządzenia możesz skonfigurować klikając przyciski „Marki” lub „Urządzenia” na górnym pasku.',
    tip: 'Wskazówka: Zielone „M” = Marka (menu). Pomarańczowe „SBF/SBR” = Drukarka fiskalna / terminal.',
    actionLabel: 'Zaznacz przykładową markę →',
  },
  {
    id: 'pins-legend',
    badge: 'Krok 5 z 7',
    title: 'Łączenie kafelków kolorowymi liniami',
    speech:
      'Teraz najważniejsza czynność: łączenie elementów. Złap myszką kolorową kropkę po prawej stronie jednego kafelka i przeciągnij linię do kropki tego samego koloru po lewej stronie drugiego kafelka. Zielona linia przekazuje sprzedaż z marki do stanowiska. Pomarańczowa to fiskalizacja paragonów, fioletowa to terminal płatniczy, a szara przerywana to wydruk bonów kuchennych.',
    tip: 'Wskazówka: Przeciągnij linię z prawej kropki wyjściowej do lewej kropki wejściowej tego samego koloru.',
  },
  {
    id: 'inspector-panel',
    badge: 'Krok 6 z 7',
    title: 'Sprawdzenie poprawności i diagnostyka',
    speech:
      'Spójrz na panel po prawej stronie ekranu. Gdy żaden kafelek nie jest zaznaczony, widzisz tam listę kontrolną „Do sprawdzenia”. System sam podpowiada, czy każde stanowisko ma przypisaną markę i drukarkę fiskalną. Zielona kropka w prawym górnym rogu kafelka oznacza, że wszystko jest skonfigurowane poprawnie.',
    tip: 'Wskazówka: Kliknij w puste tło planszy, aby zobaczyć pełną listę diagnostyczną po prawej stronie.',
    actionLabel: 'Pokaż diagnostykę →',
  },
  {
    id: 'save-controls',
    badge: 'Krok 7 z 7',
    title: 'Zapisanie gotowej struktury',
    speech:
      'Na koniec pamiętaj o zapisaniu zmian! Dopóki pracujesz na diagramie, zmiany są robocze. Kliknij czerwony przycisk „Zapisz strukturę” w prawym górnym rogu, aby aktywować nową konfigurację na stanowiskach POS i w menu QR. W razie pomyłki zawsze możesz kliknąć strzałkę „Cofnij” lub przycisk „Odrzuć”.',
    tip: 'Wskazówka: Kliknij czerwony przycisk „Zapisz strukturę”, aby zastosować wprowadzone zmiany.',
  },
]

interface StructureVoiceTourProps {
  open: boolean
  stepIndex: number
  onStepChange: (nextIndex: number) => void
  onClose: () => void
  onDemoAction?: (target: TourTarget) => void
}

export function StructureVoiceTour({
  open,
  stepIndex,
  onStepChange,
  onClose,
  onDemoAction,
}: StructureVoiceTourProps) {
  const [speaking, setSpeaking] = useState(false)
  const [paused, setPaused] = useState(false)
  const [rate, setRate] = useState<number>(1)
  const [autoNext, setAutoNext] = useState<boolean>(false)
  const [supported, setSupported] = useState<boolean>(true)
  const [voiceName, setVoiceName] = useState<string>('')

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stepIndexRef = useRef(stepIndex)
  stepIndexRef.current = stepIndex
  const autoNextRef = useRef(autoNext)
  autoNextRef.current = autoNext

  const step = VOICE_TOUR_STEPS[stepIndex] || VOICE_TOUR_STEPS[0]

  const pickPolishVoice = useCallback((): SpeechSynthesisVoice | null => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null
    const voices = window.speechSynthesis.getVoices()
    if (!voices.length) return null

    const plVoices = voices.filter(
      (v) => v.lang.toLowerCase().startsWith('pl') || v.name.toLowerCase().includes('polish') || v.name.toLowerCase().includes('polski')
    )
    if (!plVoices.length) return null

    // Prefer natural/neural/Google/Zosia/Paulina voices when available
    const preferred =
      plVoices.find((v) => /natural|neural|online|google|zosia|paulina|maja|agnieszka/i.test(v.name)) ||
      plVoices.find((v) => v.localService) ||
      plVoices[0]

    return preferred || null
  }, [])

  const stopSpeech = useCallback(() => {
    if (autoTimerRef.current) {
      clearTimeout(autoTimerRef.current)
      autoTimerRef.current = null
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    utteranceRef.current = null
    setSpeaking(false)
    setPaused(false)
  }, [])

  const speakStep = useCallback(
    (text: string, speechRate: number) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        setSupported(false)
        return
      }
      stopSpeech()

      // Small delay after cancel() ensures Chrome/Safari don't swallow the new utterance
      setTimeout(() => {
        if (!('speechSynthesis' in window)) return
        const u = new SpeechSynthesisUtterance(text)
        u.lang = 'pl-PL'
        u.rate = speechRate
        u.pitch = 1.0

        const v = pickPolishVoice()
        if (v) {
          u.voice = v
          setVoiceName(v.name)
        }

        u.onstart = () => {
          setSpeaking(true)
          setPaused(false)
        }
        u.onend = () => {
          setSpeaking(false)
          setPaused(false)
          if (autoNextRef.current && stepIndexRef.current < VOICE_TOUR_STEPS.length - 1) {
            autoTimerRef.current = setTimeout(() => {
              onStepChange(stepIndexRef.current + 1)
            }, 1400)
          }
        }
        u.onerror = () => {
          setSpeaking(false)
          setPaused(false)
        }

        utteranceRef.current = u
        window.speechSynthesis.speak(u)
      }, 60)
    },
    [pickPolishVoice, stopSpeech, onStepChange]
  )

  // Ensure voices are loaded in Chrome/Safari
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setSupported(false)
      return
    }
    const onVoices = () => {
      const v = pickPolishVoice()
      if (v) setVoiceName(v.name)
    }
    onVoices()
    window.speechSynthesis.addEventListener?.('voiceschanged', onVoices)
    return () => {
      window.speechSynthesis.removeEventListener?.('voiceschanged', onVoices)
    }
  }, [pickPolishVoice])

  // Speak whenever tour opens or step/rate changes
  useEffect(() => {
    if (!open) {
      stopSpeech()
      return
    }
    speakStep(`${step.badge}. ${step.title}. ${step.speech}`, rate)
    return () => {
      stopSpeech()
    }
  }, [open, stepIndex, rate, step.badge, step.title, step.speech, speakStep, stopSpeech])

  // Cleanup on unmount
  useEffect(() => {
    return () => stopSpeech()
  }, [stopSpeech])

  if (!open) return null

  const togglePlayPause = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    if (speaking && !paused) {
      window.speechSynthesis.pause()
      setPaused(true)
    } else if (paused) {
      window.speechSynthesis.resume()
      setPaused(false)
    } else {
      speakStep(`${step.badge}. ${step.title}. ${step.speech}`, rate)
    }
  }

  const cycleRate = () => {
    const next = rate === 1 ? 1.15 : rate === 1.15 ? 0.9 : 1
    setRate(next)
  }

  return (
    <div
      role="region"
      aria-label="Interaktywny przewodnik głosowy"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 18,
        transform: 'translateX(-50%)',
        width: 'min(860px, calc(100vw - 28px))',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        color: '#f8fafc',
        borderRadius: 16,
        padding: '16px 20px',
        boxShadow: '0 20px 45px rgba(15, 23, 42, 0.45), 0 0 0 2px rgba(237, 28, 36, 0.65)',
        zIndex: 80,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      {/* Top bar: Step progress & controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: '#ed1c24',
              color: '#fff',
              fontSize: 12,
              fontWeight: 800,
              padding: '4px 10px',
              borderRadius: 99,
              letterSpacing: '0.03em',
            }}
          >
            <span>{speaking && !paused ? '🔊' : '🎧'}</span>
            <span>{step.badge}</span>
          </span>
          <strong style={{ fontSize: 15, color: '#fff' }}>{step.title}</strong>
          {speaking && !paused && (
            <span
              style={{
                fontSize: 11,
                color: '#fca5a5',
                fontWeight: 600,
                background: 'rgba(237, 28, 36, 0.18)',
                padding: '2px 8px',
                borderRadius: 99,
              }}
            >
              ● Lektor mówi…
            </span>
          )}
        </div>

        {/* Step dots */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {VOICE_TOUR_STEPS.map((s, idx) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onStepChange(idx)}
              title={`${s.badge}: ${s.title}`}
              aria-label={`Przejdź do ${s.badge}`}
              style={{
                width: idx === stepIndex ? 24 : 9,
                height: 9,
                borderRadius: 99,
                border: 0,
                cursor: 'pointer',
                background: idx === stepIndex ? '#ed1c24' : idx < stepIndex ? '#94a3b8' : '#334155',
                transition: 'all 0.2s ease',
              }}
            />
          ))}
        </div>
      </div>

      {/* Main transcript text */}
      <div
        style={{
          fontSize: 13.5,
          lineHeight: 1.55,
          color: '#e2e8f0',
          background: 'rgba(255, 255, 255, 0.06)',
          borderRadius: 10,
          padding: '10px 14px',
          borderLeft: '3px solid #ed1c24',
        }}
      >
        {step.speech}
        <div style={{ marginTop: 6, fontSize: 12, color: '#93c5fd', fontWeight: 600 }}>
          💡 {step.tip}
        </div>
        {!supported && (
          <div style={{ marginTop: 6, fontSize: 12, color: '#fda29b' }}>
            Twoja przeglądarka nie obsługuje syntezatora mowy (Web Speech API) — możesz korzystać z podświetleń krok po kroku powyżej.
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {supported && (
            <>
              <button
                type="button"
                onClick={togglePlayPause}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: speaking && !paused ? '#334155' : '#ed1c24',
                  color: '#fff',
                  border: 0,
                  borderRadius: 8,
                  padding: '6px 12px',
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {speaking && !paused ? '⏸ Pauza' : paused ? '▶ Wznów' : '🔊 Odsłuchaj'}
              </button>
              <button
                type="button"
                onClick={() => speakStep(`${step.badge}. ${step.title}. ${step.speech}`, rate)}
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  color: '#e2e8f0',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 8,
                  padding: '6px 10px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                title="Powtórz aktualny krok"
              >
                ↺ Powtórz
              </button>
              <button
                type="button"
                onClick={cycleRate}
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  color: '#cbd5e1',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 8,
                  padding: '6px 10px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                title="Zmień prędkość czytania lektora"
              >
                Tempo: {rate}x
              </button>
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                  color: '#cbd5e1',
                  cursor: 'pointer',
                  userSelect: 'none',
                  marginLeft: 4,
                }}
                title="Automatycznie przejdź do kolejnego kroku po zakończeniu czytania"
              >
                <input
                  type="checkbox"
                  checked={autoNext}
                  onChange={(e) => setAutoNext(e.target.checked)}
                  style={{ accentColor: '#ed1c24', cursor: 'pointer' }}
                />
                Auto-przejście
              </label>
            </>
          )}

          {step.actionLabel && onDemoAction && (
            <button
              type="button"
              onClick={() => onDemoAction(step.id)}
              style={{
                background: 'rgba(59, 130, 246, 0.22)',
                color: '#93c5fd',
                border: '1px solid rgba(59, 130, 246, 0.45)',
                borderRadius: 8,
                padding: '6px 11px',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {step.actionLabel}
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            disabled={stepIndex === 0}
            onClick={() => onStepChange(Math.max(0, stepIndex - 1))}
            style={{
              background: 'rgba(255,255,255,0.1)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.18)',
              borderRadius: 8,
              padding: '6px 12px',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: stepIndex === 0 ? 'not-allowed' : 'pointer',
              opacity: stepIndex === 0 ? 0.4 : 1,
            }}
          >
            ← Wstecz
          </button>

          {stepIndex < VOICE_TOUR_STEPS.length - 1 ? (
            <button
              type="button"
              onClick={() => onStepChange(stepIndex + 1)}
              style={{
                background: '#fff',
                color: '#0f172a',
                border: 0,
                borderRadius: 8,
                padding: '6px 14px',
                fontSize: 12.5,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Dalej →
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                stopSpeech()
                onClose()
              }}
              style={{
                background: '#12b76a',
                color: '#fff',
                border: 0,
                borderRadius: 8,
                padding: '6px 14px',
                fontSize: 12.5,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              ✓ Zakończ przewodnik
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              stopSpeech()
              onClose()
            }}
            style={{
              background: 'transparent',
              color: '#94a3b8',
              border: 0,
              padding: '6px 8px',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
            }}
            title="Zamknij przewodnik głosowy"
          >
            ✕ Zamknij
          </button>
        </div>
      </div>
      {voiceName && (
        <span style={{ display: 'none' }} data-voice={voiceName} />
      )}
    </div>
  )
}
