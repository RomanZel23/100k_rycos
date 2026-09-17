import { redirect } from 'next/navigation';
import { currentUser, isPlatformAdmin } from '@/lib/auth';
import { getAdminLocale } from '@/lib/i18n-server';
import { fetchDatabaseTablesAction } from './actions';
import { DatabaseClient } from './DatabaseClient';

export default async function DatabasePage() {
  const user = await currentUser();
  if (!user || !isPlatformAdmin(user)) {
    redirect('/dashboard');
  }

  const locale = await getAdminLocale();
  const res = await fetchDatabaseTablesAction();

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <DatabaseClient initialTables={res.tables || []} locale={locale} />
    </div>
  );
}
