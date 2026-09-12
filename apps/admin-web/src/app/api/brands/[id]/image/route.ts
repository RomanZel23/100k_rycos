import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { adminApi } from '@/lib/api'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const formData = await req.formData()
    const file = formData.get('image')
    const type = String(formData.get('type') || 'logo')

    if (!file || !(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: 'Nie wybrano pliku ze zdjęciem' }, { status: 400 })
    }

    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ error: 'Maksymalny rozmiar zdjęcia to 15MB' }, { status: 400 })
    }

    const forwardData = new FormData()
    forwardData.append('image', file)

    const res = await adminApi(`/brands/${id}/image?type=${encodeURIComponent(type)}`, {
      method: 'POST',
      body: forwardData,
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json(
        { error: err.message || 'Błąd podczas wgrywania zdjęcia marki do magazynu' },
        { status: res.status }
      )
    }

    const data = await res.json()
    revalidatePath('/dashboard/brands')
    revalidatePath(`/dashboard/brands/${id}`)

    return NextResponse.json(data)
  } catch (err: any) {
    console.error('Error in brand image upload route handler:', err)
    return NextResponse.json({ error: err.message || 'Wystąpił błąd serwera' }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const url = new URL(req.url)
    const type = url.searchParams.get('type') || 'logo'

    const res = await adminApi(`/brands/${id}/image?type=${encodeURIComponent(type)}`, {
      method: 'DELETE',
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json(
        { error: err.message || 'Błąd podczas usuwania zdjęcia marki' },
        { status: res.status }
      )
    }

    const data = await res.json()
    revalidatePath('/dashboard/brands')
    revalidatePath(`/dashboard/brands/${id}`)

    return NextResponse.json(data)
  } catch (err: any) {
    console.error('Error in brand image delete route handler:', err)
    return NextResponse.json({ error: err.message || 'Wystąpił błąd serwera' }, { status: 500 })
  }
}
