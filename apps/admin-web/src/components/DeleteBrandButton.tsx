'use client'

import React from 'react'

interface Props {
  action: (formData: FormData) => Promise<void>
  brandId: number
  brandName?: string | null
  label?: string
  className?: string
}

export function DeleteBrandButton({
  action,
  brandId,
  brandName,
  label = 'Usuń',
  className = 'text-xs font-medium text-red-600 hover:text-red-700 hover:underline',
}: Props) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        const confirmed = window.confirm(
          `Czy na pewno chcesz bezpowrotnie usunąć markę "${brandName || brandId}"?\n\nKlienci utracą dostęp do tego kodu QR i menu.`
        )
        if (!confirmed) {
          e.preventDefault()
        }
      }}
    >
      <input type="hidden" name="id" value={brandId} />
      <button type="submit" className={className}>
        {label}
      </button>
    </form>
  )
}
