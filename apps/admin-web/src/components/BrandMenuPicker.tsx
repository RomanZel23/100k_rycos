'use client'

import { useState, useEffect } from 'react'

export interface PickerProduct {
  id: number
  name: string
  price?: string | number
  image_url?: string | null
}

const money = (p?: string | number) =>
  p == null ? '' : Number(p).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Two-column product assignment: Available | In this menu. Click a card to move
// it. Selected ids are emitted as hidden inputs (name="product_id") for the
// surrounding server-action form.
export function BrandMenuPicker({ products, initial = [] }: { products: PickerProduct[]; initial?: number[] }) {
  const [selected, setSelected] = useState<Set<number>>(new Set(initial))
  const [q, setQ] = useState('')

  // Keep selected in sync whenever initial prop updates (e.g. server revalidation or brand switch)
  useEffect(() => {
    setSelected(new Set(initial))
  }, [JSON.stringify(initial)])

  const move = (id: number, add: boolean) => {
    const next = new Set(selected)
    add ? next.add(id) : next.delete(id)
    setSelected(next)
  }

  const addAll = () => {
    const next = new Set(selected)
    for (const p of list) {
      if (match(p)) next.add(p.id)
    }
    setSelected(next)
  }

  const removeAll = () => {
    const next = new Set(selected)
    for (const p of list) {
      if (match(p)) next.delete(p.id)
    }
    setSelected(next)
  }

  const match = (p: PickerProduct) => (p?.name || '').toLowerCase().includes(q.toLowerCase())
  const list = Array.isArray(products) ? products : []
  const available = list.filter((p) => p && !selected.has(p.id) && match(p))
  const chosen = list.filter((p) => p && selected.has(p.id) && match(p))

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-2 mb-3 items-stretch sm:items-center justify-between">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Szukaj produktów…"
          className="input flex-1"
        />
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={addAll}
            className="px-3 py-2 text-xs font-semibold rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 transition-colors"
          >
            + Dodaj wszystkie
          </button>
          <button
            type="button"
            onClick={removeAll}
            className="px-3 py-2 text-xs font-semibold rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 transition-colors"
          >
            × Usuń wszystkie
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Column title={`Dostępne produkty (${available.length})`} products={available} action="add" onClick={(id) => move(id, true)} />
        <Column title={`Przypisane do tej marki (${chosen.length})`} products={chosen} action="remove" onClick={(id) => move(id, false)} highlight />
      </div>
      <input type="hidden" name="has_product_picker" value="true" />
      {[...selected].map((id) => <input key={id} type="hidden" name="product_id" value={id} />)}
    </div>
  )
}

function Column({ title, products, action, onClick, highlight }: {
  title: string
  products: PickerProduct[]
  action: 'add' | 'remove'
  onClick: (id: number) => void
  highlight?: boolean
}) {
  return (
    <div className={`rounded-xl border p-2 ${highlight ? 'border-brand/40 bg-brand-50/40' : 'border-neutral-200'}`}>
      <p className="px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">{title}</p>
      <div className="max-h-80 space-y-2 overflow-y-auto">
        {products.length === 0 && <p className="px-1 py-4 text-center text-xs text-neutral-400">Nothing here.</p>}
        {products.map((p) => (
          <button
            type="button"
            key={p.id}
            onClick={() => onClick(p.id)}
            className="flex w-full items-center gap-3 rounded-lg border border-neutral-200 bg-white p-2 text-left hover:border-brand"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {p.image_url
              ? <img src={p.image_url} alt="" crossOrigin="anonymous" className="h-10 w-10 shrink-0 rounded object-cover" />
              : <div className="h-10 w-10 shrink-0 rounded bg-neutral-100" />}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{p.name}</span>
              {p.price != null && <span className="text-xs text-neutral-500">{money(p.price)}</span>}
            </span>
            <span className={`shrink-0 text-lg ${action === 'add' ? 'text-brand' : 'text-red-500'}`}>
              {action === 'add' ? '＋' : '×'}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
