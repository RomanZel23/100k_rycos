import { currentUser, isManager } from '@/lib/auth';
import { NoAccess } from '@/components/NoAccess';
import { getAdminLocale } from '@/lib/i18n-server';
import { fetchStressTestStats } from './actions';
import { StressTestConsole } from './StressTestConsole';

export default async function StressTestPage() {
  const user = await currentUser();
  if (!isManager(user)) return <NoAccess />;

  const locale = await getAdminLocale();
  const stats = await fetchStressTestStats();

  return (
    <div className="space-y-6">
      <StressTestConsole initialStats={stats} locale={locale} />
    </div>
  );
}
