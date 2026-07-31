import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import CouponScanner from '@/components/coupon/CouponScanner'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default async function CouponPage() {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Get permission to check if admin (0) or user (1)
  const { data: account } = await adminClient
    .from('accounts')
    .select('permission')
    .eq('user_id', user.id)
    .single()

  const permission = account?.permission ?? 1
  const isAdmin = permission === 0

  return (
    <div className="h-[100dvh] overflow-hidden bg-zinc-950 text-white flex flex-col">
      <div className="p-4 flex items-center justify-between border-b border-zinc-800 bg-zinc-900 z-10">
        <Link href="/main" className="flex items-center text-zinc-300 hover:text-white transition-colors">
          <ArrowLeft className="w-6 h-6 mr-2" />
          <span>대시보드로 돌아가기</span>
        </Link>
      </div>
      <main className="flex-1 relative flex flex-col">
        <CouponScanner isAdmin={isAdmin} />
      </main>
    </div>
  )
}
