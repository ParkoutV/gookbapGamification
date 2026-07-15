import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import Sidebar from '@/components/Sidebar'

export default async function MainLayout({
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

  // accounts 테이블에서 permission 조회 (RLS 우회를 위해 adminClient 사용)
  const { data: account } = await adminClient
    .from('accounts')
    .select('permission')
    .eq('user_id', user.id)
    .single()

  const permission = account?.permission ?? 1

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-gray-900 dark:text-white">
      <Sidebar permission={permission} email={user.email!} />
      
      {/* Main Content Area */}
      <main className="md:ml-64 pt-16 md:pt-0 min-h-screen transition-all duration-300 ease-in-out peer-data-[collapsed=true]:md:ml-20">
        <div className="p-8 max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
