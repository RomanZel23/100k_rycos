'use server';

import { revalidatePath } from 'next/cache';
import { adminApi } from '@/lib/api';

export async function updateCompanyStatusAction(companyId: number, status: string): Promise<void> {
  const res = await adminApi(`/master/companies/${companyId}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });

  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.message || 'Nie udało się zmienić statusu firmy');
  }

  revalidatePath('/dashboard/master');
}

export async function createCompanyAction(data: {
  name: string;
  email?: string;
  country?: string;
  currency?: string;
  business_type?: string;
  nip?: string;
  address?: string;
  phone?: string;
}): Promise<any> {
  const res = await adminApi('/master/companies', {
    method: 'POST',
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.message || 'Nie udało się utworzyć firmy');
  }

  const json = await res.json();
  revalidatePath('/dashboard/master');
  return json.data;
}

export async function updatePricingAction(items: any[]): Promise<any> {
  const res = await adminApi('/master/pricing', {
    method: 'PUT',
    body: JSON.stringify({ items }),
  });

  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.message || 'Nie udało się zaktualizować cennika');
  }

  const json = await res.json();
  revalidatePath('/dashboard/master');
  return json.data;
}
