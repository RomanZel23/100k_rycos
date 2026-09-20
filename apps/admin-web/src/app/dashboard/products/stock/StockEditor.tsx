'use client'

import { useState } from 'react'

// Two-mode editor: "Track stock" toggles between an integer input and the
// "Not tracked" state. When the checkbox is OFF, the hidden `stock_quantity`
// field is left blank — saveStock interprets blank as null (= untracked).
// When ON, the visible input drives the value and the user can type the
// remaining count. Kept here as a client component so the toggle reflects
// immediately; the surrounding form is still a plain server action.
export function StockEditor({
  productId,
  initialQty,
  labels,
}: {
  productId: number
  initialQty: number | null
  labels: { track: string; quantity: string; untracked: string }
}) {
  const initialTracking = initialQty != null
  const [tracking, setTracking] = useState<boolean>(initialTracking)
  const [value, setValue] = useState<string>(initialQty != null ? String(initialQty) : '')

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex cursor-pointer items-center gap-2 pb-2 text-xs font-medium text-neutral-700">
        <input
          type="checkbox"
          checked={tracking}
          onChange={(e) => setTracking(e.target.checked)}
          className="h-4 w-4 accent-brand"
        />
        {labels.track}
      </label>
      <div className="w-32">
        <label className="label text-xs" htmlFor={`stock-${productId}`}>
          {labels.quantity}
        </label>
        <input
          id={`stock-${productId}`}
          name="stock_quantity"
          type="number"
          min={0}
          inputMode="numeric"
          value={tracking ? value : ''}
          onChange={(e) => setValue(e.target.value)}
          placeholder={tracking ? '0' : labels.untracked}
          disabled={!tracking}
          className="input h-11 text-base disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-400"
        />
      </div>
    </div>
  )
}
