import { cookies } from 'next/headers';
import { AdminLocale } from './i18n';

export async function getAdminLocale(): Promise<AdminLocale> {
  const cookieStore = await cookies();
  const raw = cookieStore.get('admin_lang')?.value;
  if (raw === 'en' || raw === 'de' || raw === 'pl') {
    return raw;
  }
  return 'pl';
}
