'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  parseFileAction,
  analyzeImagesAction,
  commitAction,
  savePromptAction,
  type DraftItem,
  type MenuDraft,
} from './actions'

interface Brand { id: number; name: string }
interface Capabilities {
  file: boolean
  images: boolean
  max_images: number
  max_image_mb: number
  default_tax_rate: number
}
interface PromptInfo { prompt: string; source: string; default_prompt: string; is_default: boolean }

interface Row extends DraftItem {
  /** Pozycje odznaczone nie trafiają do menu. */
  include: boolean
}

const TAX_RATES = [0, 5, 8, 23]

/** Plik → base64 bez prefiksu data:, bo API przyjmuje samą zawartość. */
function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(`Nie udało się odczytać pliku ${file.name}`))
    reader.onload = () => {
      const result = String(reader.result || '')
      resolve(result.includes(',') ? result.slice(result.indexOf(',') + 1) : result)
    }
    reader.readAsDataURL(file)
  })
}

export function MenuImportClient({
  brands,
  capabilities,
  promptInfo,
  canEditPrompt,
}: {
  brands: Brand[]
  capabilities: Capabilities
  promptInfo: PromptInfo | null
  canEditPrompt: boolean
}) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLInputElement>(null)

  const [brandId, setBrandId] = useState<number | null>(brands[0]?.id ?? null)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [draftMeta, setDraftMeta] = useState<MenuDraft['meta'] | null>(null)
  const [draftWarnings, setDraftWarnings] = useState<string[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)
  const [result, setResult] = useState<{ createdProducts: number; createdCategories: number; skipped: { name: string; reason: string }[] } | null>(null)

  // Zdjęcia trzymamy w pamięci, żeby dało się ponowić odczyt z innym promptem
  const [lastImages, setLastImages] = useState<{ filename: string; mime_type: string; content_base64: string }[]>([])
  const [promptOpen, setPromptOpen] = useState(false)
  const [promptText, setPromptText] = useState(promptInfo?.prompt ?? '')
  const [promptSource, setPromptSource] = useState(promptInfo?.source ?? 'default')

  const applyDraft = (draft: MenuDraft) => {
    setRows(draft.items.map((item) => ({ ...item, include: true })))
    setDraftMeta(draft.meta)
    setDraftWarnings(draft.warnings)
    setResult(null)
  }

  const handleFile = async (file: File) => {
    setBusy('Czytam plik...')
    setMessage(null)
    try {
      const base64 = await readAsBase64(file)
      const res = await parseFileAction(file.name, base64)
      if (!res.ok || !res.data) throw new Error(res.error || 'Nie udało się odczytać pliku')
      applyDraft(res.data)
      setLastImages([])
    } catch (err: any) {
      setMessage({ kind: 'error', text: err.message })
    } finally {
      setBusy(null)
    }
  }

  const handleImages = async (files: FileList) => {
    const list = Array.from(files).slice(0, capabilities.max_images)
    const tooBig = list.find((f) => f.size > capabilities.max_image_mb * 1024 * 1024)
    if (tooBig) {
      setMessage({ kind: 'error', text: `Plik ${tooBig.name} jest większy niż ${capabilities.max_image_mb} MB` })
      return
    }

    setBusy(`Odczytuję kartę z ${list.length} plik(ów)...`)
    setMessage(null)
    try {
      const payload = await Promise.all(
        list.map(async (file) => ({
          filename: file.name,
          mime_type: file.type || 'image/jpeg',
          content_base64: await readAsBase64(file),
        }))
      )
      const res = await analyzeImagesAction(payload)
      if (!res.ok || !res.data) throw new Error(res.error || 'Nie udało się odczytać karty')
      applyDraft(res.data)
      setLastImages(payload)
    } catch (err: any) {
      setMessage({ kind: 'error', text: err.message })
    } finally {
      setBusy(null)
    }
  }

  const reanalyzeWithPrompt = async () => {
    if (lastImages.length === 0) return
    setBusy('Ponawiam odczyt z tym promptem...')
    setMessage(null)
    try {
      const res = await analyzeImagesAction(lastImages, promptText)
      if (!res.ok || !res.data) throw new Error(res.error || 'Nie udało się odczytać karty')
      applyDraft(res.data)
    } catch (err: any) {
      setMessage({ kind: 'error', text: err.message })
    } finally {
      setBusy(null)
    }
  }

  const savePrompt = async (restoreDefault = false) => {
    setBusy(restoreDefault ? 'Przywracam wbudowany prompt...' : 'Zapisuję prompt...')
    setMessage(null)
    try {
      const res = await savePromptAction(restoreDefault ? null : promptText)
      if (!res.ok || !res.data) throw new Error(res.error || 'Nie udało się zapisać promptu')
      setPromptText(res.data.prompt)
      setPromptSource(res.data.source)
      setMessage({ kind: 'success', text: restoreDefault ? 'Przywrócono wbudowany prompt' : 'Prompt zapisany — używają go wszystkie kolejne odczyty' })
    } catch (err: any) {
      setMessage({ kind: 'error', text: err.message })
    } finally {
      setBusy(null)
    }
  }

  const patchRow = (index: number, patch: Partial<Row>) => {
    setRows((prev) => (prev ? prev.map((row, i) => (i === index ? { ...row, ...patch } : row)) : prev))
  }

  const setTaxForAll = (taxRate: number) => {
    setRows((prev) => (prev ? prev.map((row) => ({ ...row, taxRate, warnings: row.warnings.filter((w) => !w.includes('VAT')) })) : prev))
  }

  const selected = useMemo(() => (rows ?? []).filter((r) => r.include), [rows])
  const missingPrice = useMemo(() => selected.filter((r) => r.price === null || r.price <= 0).length, [selected])

  const commit = async () => {
    if (!brandId || selected.length === 0) return
    setBusy('Zapisuję menu...')
    setMessage(null)
    try {
      const res = await commitAction(
        brandId,
        selected.map(({ include, ...item }) => item)
      )
      if (!res.ok || !res.data) throw new Error(res.error || 'Nie udało się zapisać menu')
      setResult(res.data)
      setRows(null)
      setLastImages([])
      router.refresh()
    } catch (err: any) {
      setMessage({ kind: 'error', text: err.message })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mt-6 space-y-4">
      {message && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${message.kind === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-green-200 bg-green-50 text-green-800'}`}>
          {message.text}
        </div>
      )}

      {result && (
        <div className="card space-y-2">
          <p className="text-sm font-semibold text-green-800">
            Zapisano {result.createdProducts} pozycji{result.createdCategories > 0 ? `, w tym ${result.createdCategories} nowych kategorii` : ''}.
          </p>
          {result.skipped.length > 0 && (
            <p className="text-xs text-neutral-500">
              Pominięto {result.skipped.length}: {result.skipped.map((s) => `${s.name} (${s.reason})`).join(', ')}
            </p>
          )}
          <a href="/dashboard/products" className="inline-block text-sm font-semibold text-brand hover:underline">
            Zobacz produkty &rarr;
          </a>
        </div>
      )}

      {/* Krok 1: marka i źródło */}
      {!rows && (
        <div className="card space-y-4">
          <div className="max-w-xs">
            <label className="label" htmlFor="brand">Marka, do której trafi menu</label>
            <select
              id="brand"
              className="input"
              value={brandId ?? ''}
              onChange={(e) => setBrandId(parseInt(e.target.value, 10))}
            >
              {brands.length === 0 && <option value="">Brak marek — utwórz markę najpierw</option>}
              {brands.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={!!busy || !brandId}
              onClick={() => fileRef.current?.click()}
              className="rounded-xl border border-neutral-200 p-4 text-left transition hover:border-brand disabled:opacity-50"
            >
              <p className="text-sm font-semibold">📄 Plik z menu</p>
              <p className="mt-1 text-xs text-neutral-500">
                CSV z Excela: kolumny kategoria, nazwa, opis, cena, VAT. Rozpoznajemy średnik i polskie znaki.
              </p>
            </button>

            <button
              type="button"
              disabled={!!busy || !brandId || !capabilities.images}
              onClick={() => imageRef.current?.click()}
              className="rounded-xl border border-neutral-200 p-4 text-left transition hover:border-brand disabled:opacity-50"
            >
              <p className="text-sm font-semibold">📷 Zdjęcia karty dań</p>
              <p className="mt-1 text-xs text-neutral-500">
                {capabilities.images
                  ? `Do ${capabilities.max_images} zdjęć lub PDF (maks. ${capabilities.max_image_mb} MB każdy). Fotografuj prosto, przy dobrym świetle.`
                  : 'Niedostępne — na serwerze nie skonfigurowano odczytu zdjęć.'}
              </p>
            </button>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt,.tsv,text/csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
          />
          <input
            ref={imageRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => { const f = e.target.files; if (f && f.length) handleImages(f); e.target.value = '' }}
          />

          {busy && <p className="text-sm text-neutral-500">{busy}</p>}
        </div>
      )}

      {/* Krok 2: tabela do korekty */}
      {rows && (
        <div className="space-y-3">
          {draftWarnings.length > 0 && (
            <ul className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 space-y-1">
              {draftWarnings.map((w, i) => <li key={i}>• {w}</li>)}
            </ul>
          )}

          <div className="card flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <span className="font-semibold">{selected.length}</span> z {rows.length} pozycji do zapisania
              {missingPrice > 0 && <span className="ml-2 text-red-600">• {missingPrice} bez ceny (zostaną pominięte)</span>}
              {draftMeta && (
                <span className="ml-2 text-xs text-neutral-400">
                  źródło: {draftMeta.encoding === 'vision' ? `zdjęcia (${draftMeta.columns.model})` : `plik ${draftMeta.encoding}, separator ${draftMeta.delimiter}`}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-neutral-500">Ustaw VAT wszystkim:</span>
              {TAX_RATES.map((rate) => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => setTaxForAll(rate)}
                  className="rounded-lg border border-neutral-300 px-2.5 py-1 text-xs font-semibold hover:border-brand"
                >
                  {rate}%
                </button>
              ))}
            </div>
          </div>

          <div className="card overflow-x-auto p-0">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-400">
                <tr>
                  <th className="px-3 py-2 w-10"></th>
                  <th className="px-3 py-2">Kategoria</th>
                  <th className="px-3 py-2">Nazwa</th>
                  <th className="px-3 py-2 w-28">Cena</th>
                  <th className="px-3 py-2 w-24">VAT</th>
                  <th className="px-3 py-2">Uwagi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {rows.map((row, index) => (
                  <tr key={index} className={row.include ? '' : 'opacity-40'}>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={row.include}
                        onChange={(e) => patchRow(index, { include: e.target.checked })}
                        className="h-4 w-4 accent-brand"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="input h-9 text-sm"
                        value={row.category ?? ''}
                        placeholder="bez kategorii"
                        onChange={(e) => patchRow(index, { category: e.target.value || null })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="input h-9 text-sm"
                        value={row.name}
                        onChange={(e) => patchRow(index, { name: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        className={`input h-9 text-sm ${row.price === null ? 'border-red-300' : ''}`}
                        value={row.price ?? ''}
                        onChange={(e) => patchRow(index, { price: e.target.value === '' ? null : parseFloat(e.target.value) })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        className="input h-9 text-sm"
                        value={row.taxRate}
                        onChange={(e) => patchRow(index, { taxRate: parseInt(e.target.value, 10), warnings: row.warnings.filter((w) => !w.includes('VAT')) })}
                      >
                        {TAX_RATES.map((rate) => <option key={rate} value={rate}>{rate}%</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-xs text-amber-700">{row.warnings.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => { setRows(null); setResult(null); setMessage(null) }}
              className="text-sm font-medium text-neutral-500 hover:underline"
            >
              Zacznij od nowa
            </button>
            <button
              type="button"
              disabled={!!busy || selected.length === 0}
              onClick={commit}
              className="btn-brand sm:w-auto sm:px-6"
            >
              {busy ? busy : `Zapisz ${selected.length} pozycji do menu`}
            </button>
          </div>
        </div>
      )}

      {/* Prompt odczytu — tylko operator platformy */}
      {canEditPrompt && capabilities.images && (
        <div className="card">
          <button
            type="button"
            onClick={() => setPromptOpen((v) => !v)}
            className="flex w-full items-center justify-between text-left"
          >
            <span className="text-sm font-semibold">
              Prompt odczytu karty
              <span className="ml-2 text-xs font-normal text-neutral-400">
                {promptSource === 'panel' ? 'własny (z panelu)' : promptSource === 'env' ? 'ze zmiennej środowiskowej' : 'wbudowany'}
              </span>
            </span>
            <span className="text-xs text-neutral-400">{promptOpen ? 'zwiń' : 'rozwiń'}</span>
          </button>

          {promptOpen && (
            <div className="mt-3 space-y-3">
              <p className="text-xs text-neutral-500">
                Instrukcja wysyłana do modelu razem ze zdjęciami. Zmiana działa od razu dla wszystkich firm,
                bez wdrożenia. Po wgraniu zdjęć możesz ponowić odczyt z nową treścią, zanim ją zapiszesz.
              </p>
              <textarea
                className="input min-h-[220px] font-mono text-xs"
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={!!busy} onClick={() => savePrompt(false)} className="btn-brand sm:w-auto sm:px-4">
                  Zapisz prompt
                </button>
                <button
                  type="button"
                  disabled={!!busy || lastImages.length === 0}
                  onClick={reanalyzeWithPrompt}
                  className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold hover:border-brand disabled:opacity-40"
                  title={lastImages.length === 0 ? 'Najpierw wgraj zdjęcia karty' : undefined}
                >
                  Przeanalizuj ponownie tym promptem
                </button>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => savePrompt(true)}
                  className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-600 hover:border-neutral-400"
                >
                  Przywróć wbudowany
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
