import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

export default async function CouponsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: account } = await adminClient
    .from('accounts')
    .select('permission')
    .eq('user_id', user.id)
    .single()

  if (account?.permission !== 0) {
    redirect('/main') // Redirect non-admins to main dashboard
  }

  return <>{children}</>
}
