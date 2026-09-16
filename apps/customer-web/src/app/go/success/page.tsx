import { GoSuccessClient } from './GoSuccessClient';

export const dynamic = 'force-dynamic';

export default async function GoSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ order_token?: string }>;
}) {
  const { order_token } = await searchParams;
  return <GoSuccessClient orderToken={order_token || ''} />;
}
