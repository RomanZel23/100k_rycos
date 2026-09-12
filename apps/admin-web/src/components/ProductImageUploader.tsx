'use client'

import { useState, useRef, ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'

interface ProductImageUploaderProps {
  productId: number
  currentImageUrl: string | null
}

export function ProductImageUploader({ productId, currentImageUrl }: ProductImageUploaderProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [imageUrl, setImageUrl] = useState<string | null>(currentImageUrl)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null)
    setSuccessMessage(null)
    const file = e.target.files?.[0]
    if (!file) {
      setSelectedFile(null)
      setPreviewUrl(null)
      return
    }

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Wybrany plik nie jest obrazem')
      return
    }

    if (file.size > 15 * 1024 * 1024) {
      setErrorMessage('Maksymalny rozmiar pliku to 15MB')
      return
    }

    setSelectedFile(file)
    const objectUrl = URL.createObjectURL(file)
    setPreviewUrl(objectUrl)
  }

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedFile) return

    setIsUploading(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const formData = new FormData()
      formData.append('image', selectedFile)

      const res = await fetch(`/api/products/${productId}/image`, {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Nie udało się wgrać zdjęcia')
      }

      const newUrl = data.data?.imageUrl || data.data?.image_url || previewUrl
      setImageUrl(newUrl)
      setSelectedFile(null)
      setPreviewUrl(null)
      setSuccessMessage('Zdjęcie zostało pomyślnie zaktualizowane!')
      if (fileInputRef.current) fileInputRef.current.value = ''
      router.refresh()
    } catch (err: any) {
      console.error('Upload failed:', err)
      setErrorMessage(err.message || 'Wystąpił błąd podczas wgrywania pliku')
    } finally {
      setIsUploading(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Czy na pewno chcesz usunąć to zdjęcie produktu?')) return

    setIsDeleting(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const res = await fetch(`/api/products/${productId}/image`, {
        method: 'DELETE',
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Nie udało się usunąć zdjęcia')
      }

      setImageUrl(null)
      setSelectedFile(null)
      setPreviewUrl(null)
      setSuccessMessage('Zdjęcie produktu zostało usunięte.')
      if (fileInputRef.current) fileInputRef.current.value = ''
      router.refresh()
    } catch (err: any) {
      console.error('Delete failed:', err)
      setErrorMessage(err.message || 'Wystąpił błąd podczas usuwania zdjęcia')
    } finally {
      setIsDeleting(false)
    }
  }

  const displayUrl = previewUrl || imageUrl

  return (
    <div className="card mt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Zdjęcie produktu (OVH S3)</h2>
        {imageUrl && !previewUrl && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting || isUploading}
            className="text-xs text-red-600 hover:text-red-700 hover:underline disabled:opacity-50"
          >
            {isDeleting ? 'Usuwanie...' : 'Usuń zdjęcie'}
          </button>
        )}
      </div>

      {errorMessage && (
        <div className="mt-3 rounded-lg bg-red-50 p-2.5 text-xs font-medium text-red-700 border border-red-200">
          ⚠️ {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="mt-3 rounded-lg bg-green-50 p-2.5 text-xs font-medium text-green-700 border border-green-200">
          ✓ {successMessage}
        </div>
      )}

      <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        {/* Thumbnail Preview */}
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50 shadow-sm flex items-center justify-center">
          {displayUrl ? (
            <img
              src={displayUrl}
              alt="Podgląd"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-neutral-400">
              <svg className="w-8 h-8 opacity-40 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-[10px] uppercase tracking-wider font-semibold">Brak</span>
            </div>
          )}
          {previewUrl && (
            <span className="absolute bottom-1 right-1 rounded bg-amber-500 px-1 py-0.5 text-[9px] font-bold text-white shadow">
              Nowe
            </span>
          )}
        </div>

        {/* Upload Form */}
        <form onSubmit={handleUpload} className="flex-1 space-y-3 w-full">
          <div className="flex flex-wrap items-center gap-3">
            <label className="cursor-pointer inline-flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50 active:bg-neutral-100 transition">
              <svg className="w-4 h-4 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>{selectedFile ? selectedFile.name : (imageUrl ? 'Zmień plik zdjęcia' : 'Wybierz plik')}</span>
              <input
                ref={fileInputRef}
                type="file"
                name="image"
                accept="image/*"
                onChange={handleFileChange}
                disabled={isUploading}
                className="hidden"
              />
            </label>

            {selectedFile && (
              <button
                type="submit"
                disabled={isUploading}
                className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-600 disabled:opacity-50 transition"
              >
                {isUploading ? (
                  <>
                    <svg className="h-3.5 w-3.5 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Wgrywanie na OVH S3...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    <span>Zapisz zdjęcie</span>
                  </>
                )}
              </button>
            )}
          </div>
          <p className="text-[11px] text-neutral-400">
            Obsługiwane formaty: JPG, PNG, WEBP, GIF. Maksymalnie 15MB. Obraz zostanie automatycznie zapisany w chmurze OVH Object Storage.
          </p>
        </form>
      </div>
    </div>
  )
}
