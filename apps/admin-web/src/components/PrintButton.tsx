'use client'

export function PrintButton({ label = 'Print' }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="btn-brand sm:w-auto sm:px-6 print:hidden">
      {label}
    </button>
  )
}
