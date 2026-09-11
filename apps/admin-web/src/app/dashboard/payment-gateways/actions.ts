'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { adminApi } from '@/lib/api'

async function failTo(path: string, res: Response, fallback: string): Promise<never> {
  const j = await res.json().catch(() => ({} as any))
  const msg = j?.errors ? Object.values(j.errors).join(' ') : j?.message || fallback
  redirect(`${path}?error=${encodeURIComponent(String(msg))}`)
}

function buildBody(formData: FormData): Record<string, unknown> {
  return {
    gateway_name: String(formData.get('gateway_name') || 'SaferPay'),
    public_key: String(formData.get('public_key') || '').trim(),
    private_key: String(formData.get('private_key') || ''),
    customer_id: String(formData.get('customer_id') || '').trim(),
    terminal_id: String(formData.get('terminal_id') || '').trim(),
  }
}

export async function savePaymentGateway(formData: FormData): Promise<void> {
  const id = String(formData.get('id') || '')
  const body = buildBody(formData)
  const res = id
    ? await adminApi(`/payment-gateways/${id}`, { method: 'PUT', body: JSON.stringify(body) })
    : await adminApi('/payment-gateways', { method: 'POST', body: JSON.stringify(body) })
  if (!res.ok) await failTo('/dashboard/payment-gateways', res, 'Failed to save payment gateway')
  revalidatePath('/dashboard/payment-gateways')
  revalidatePath('/dashboard')
  redirect('/dashboard/payment-gateways?notice=' + encodeURIComponent(id ? 'Credentials updated' : 'Payment gateway saved'))
}

export async function deletePaymentGateway(formData: FormData): Promise<void> {
  const id = String(formData.get('id') || '')
  const res = await adminApi(`/payment-gateways/${id}`, { method: 'DELETE' })
  if (!res.ok) await failTo('/dashboard/payment-gateways', res, 'Failed to remove payment gateway')
  revalidatePath('/dashboard/payment-gateways')
  revalidatePath('/dashboard')
  redirect('/dashboard/payment-gateways?notice=' + encodeURIComponent('Payment gateway removed'))
}
