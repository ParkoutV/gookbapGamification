import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { redirect } from 'next/navigation';
import { DashboardClient } from './DashboardClient';

export default async function MainPage() {
  const supabase = await createClient();
  const adminClient = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: account } = await adminClient
    .from('accounts')
    .select('permission, assigned_branch_id')
    .eq('user_id', user.id)
    .single();

  const isAdmin = account?.permission === 0;

  return <DashboardClient isAdmin={isAdmin} assignedBranchId={account?.assigned_branch_id} />;
}
