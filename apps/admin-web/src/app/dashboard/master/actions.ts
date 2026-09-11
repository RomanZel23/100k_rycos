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
