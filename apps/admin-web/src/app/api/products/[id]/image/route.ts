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

    if (!file || !(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: 'Nie wybrano pliku ze zdjęciem' }, { status: 400 })
    }

    // Limit to 15MB
    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ error: 'Maksymalny rozmiar zdjęcia to 15MB' }, { status: 400 })
    }

    const forwardData = new FormData()
    forwardData.append('image', file)

    const res = await adminApi(`/products/${id}/image`, {
      method: 'POST',
      body: forwardData,
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json(
        { error: err.message || 'Błąd podczas wgrywania zdjęcia do magazynu S3' },
        { status: res.status }
      )
    }

    const data = await res.json()
    revalidatePath('/dashboard/products')
    revalidatePath(`/dashboard/products/${id}`)

    return NextResponse.json(data)
  } catch (err: any) {
    console.error('Error in product image upload route handler:', err)
    return NextResponse.json({ error: err.message || 'Wystąpił błąd serwera' }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const res = await adminApi(`/products/${id}/image`, {
      method: 'DELETE',
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json(
        { error: err.message || 'Błąd podczas usuwania zdjęcia' },
        { status: res.status }
      )
    }

    const data = await res.json()
    revalidatePath('/dashboard/products')
    revalidatePath(`/dashboard/products/${id}`)

    return NextResponse.json(data)
  } catch (err: any) {
    console.error('Error in product image delete route handler:', err)
    return NextResponse.json({ error: err.message || 'Wystąpił błąd serwera' }, { status: 500 })
  }
}
