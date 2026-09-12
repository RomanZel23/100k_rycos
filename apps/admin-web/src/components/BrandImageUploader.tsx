'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface BrandImageUploaderProps {
  brandId: number
  type: 'header' | 'logo' | 'footer'
  label: string
  currentUrl?: string | null
  aspectHint?: string
}

export function BrandImageUploader({
  brandId,
  type,
  label,
  currentUrl,
  aspectHint,
}: BrandImageUploaderProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(currentUrl || null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    setImageUrl(currentUrl || null)
  }, [currentUrl])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    setErrorMessage(null)
    setSuccessMessage(null)

    if (!file) {
      setSelectedFile(null)
      setPreviewUrl(null)
      return
    }

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Wybierz poprawny plik graficzny (JPG, PNG, WEBP, GIF)')
      return
    }

    if (file.size > 15 * 1024 * 1024) {
      setErrorMessage('Plik jest zbyt duży. Maksymalny rozmiar to 15MB.')
      return
    }

    setSelectedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
  }

  const handleUpload = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!selectedFile) return

    setIsUploading(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const formData = new FormData()
      formData.append('image', selectedFile)
      formData.append('type', type)

      const res = await fetch(`/api/brands/${brandId}/image`, {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Nie udało się wgrać zdjęcia')
      }

      const newUrl = data.imageUrl || data.data?.imageUrl || (data.data?.images && data.data.images[type]) || previewUrl
      setImageUrl(newUrl)
      setSelectedFile(null)
      setPreviewUrl(null)
      setSuccessMessage('Zdjęcie zapisane pomyślnie!')
      router.refresh()
    } catch (err: any) {
      setErrorMessage(err.message || 'Wystąpił błąd podczas wgrywania')
    } finally {
      setIsUploading(false)
    }
  }

  const handleDelete = async () => {
    if (!imageUrl) return
    if (!confirm(`Czy na pewno chcesz usunąć grafikę (${label})?`)) return

    setIsDeleting(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const res = await fetch(`/api/brands/${brandId}/image?type=${type}`, {
        method: 'DELETE',
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Nie udało się usunąć zdjęcia')
      }

      setImageUrl(null)
      setSelectedFile(null)
      setPreviewUrl(null)
      setSuccessMessage('Zdjęcie zostało usunięte.')
      router.refresh()
    } catch (err: any) {
      setErrorMessage(err.message || 'Wystąpił błąd podczas usuwania')
    } finally {
      setIsDeleting(false)
    }
  }

  const displayUrl = previewUrl || imageUrl

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-600">{label}</h3>
          {aspectHint && <p className="text-[10px] text-neutral-400">{aspectHint}</p>}
        </div>
        {imageUrl && !previewUrl && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting || isUploading}
            className="text-[11px] text-red-600 hover:text-red-700 hover:underline disabled:opacity-50"
          >
            {isDeleting ? 'Usuwanie...' : 'Usuń'}
          </button>
        )}
      </div>

      {errorMessage && (
        <div className="mt-2 rounded-lg bg-red-50 p-2 text-[11px] font-medium text-red-700 border border-red-200">
          ⚠️ {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="mt-2 rounded-lg bg-green-50 p-2 text-[11px] font-medium text-green-700 border border-green-200">
          ✓ {successMessage}
        </div>
      )}

      <div className="mt-3 flex flex-col gap-3">
        {/* Preview Frame */}
        <div className="relative flex h-24 w-full items-center justify-center overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50">
          {displayUrl ? (
            <img
              src={displayUrl}
              alt={label}
              crossOrigin="anonymous"
              className="h-full w-full object-contain"
            />
          ) : (
            <span className="text-xs text-neutral-400">Brak grafiki</span>
          )}
          {previewUrl && (
            <span className="absolute bottom-1 right-1 rounded bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold text-white shadow">
              Podgląd
            </span>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="cursor-pointer inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50 active:bg-neutral-100 transition">
            <span>{selectedFile ? 'Zmień plik' : (imageUrl ? 'Zmień' : 'Wybierz plik')}</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              disabled={isUploading || isDeleting}
              className="hidden"
            />
          </label>

          {selectedFile && (
            <button
              type="button"
              onClick={handleUpload}
              disabled={isUploading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-600 disabled:opacity-50 transition"
            >
              {isUploading ? (
                <>
                  <svg className="h-3.5 w-3.5 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Wgrywanie...</span>
                </>
              ) : (
                <span>Zapisz</span>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
