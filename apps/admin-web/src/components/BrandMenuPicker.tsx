'use client'

import { useState } from 'react'

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

  const move = (id: number, add: boolean) => {
    const next = new Set(selected)
    add ? next.add(id) : next.delete(id)
    setSelected(next)
  }
  const match = (p: PickerProduct) => p.name.toLowerCase().includes(q.toLowerCase())
  const available = products.filter((p) => !selected.has(p.id) && match(p))
  const chosen = products.filter((p) => selected.has(p.id) && match(p))

  return (
    <div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products…" className="input mb-3" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Column title={`Available (${available.length})`} products={available} action="add" onClick={(id) => move(id, true)} />
        <Column title={`In this menu (${chosen.length})`} products={chosen} action="remove" onClick={(id) => move(id, false)} highlight />
      </div>
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
              ? <img src={p.image_url} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
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
