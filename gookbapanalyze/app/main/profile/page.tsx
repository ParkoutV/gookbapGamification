import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { UserCircle, Shield, Mail, Hash } from 'lucide-react'
import PasswordChangeForm from './PasswordChangeForm'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  const { data: account } = await supabase
    .from('accounts')
    .select('permission, account_id')
    .eq('user_id', user?.id)
    .single()

  const email = user?.email || ''
  const accountId = account?.account_id || ''
  const permission = account?.permission === 0 ? '최고 관리자' : '일반 관리자'

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
          <UserCircle className="w-6 h-6 mr-3 text-blue-600" />
          프로필 설정
        </h1>
        <p className="text-sm text-gray-500 dark:text-zinc-400 mt-2">
          내 계정 정보를 확인하고 비밀번호를 변경할 수 있습니다.
        </p>
      </div>

      <div className="bg-white dark:bg-zinc-900 shadow-sm ring-1 ring-gray-200 dark:ring-zinc-800 rounded-xl overflow-hidden">
        <div className="p-6 border-b border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-800/50">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">기본 정보</h2>
        </div>
        
        <div className="p-6">
          <dl className="divide-y divide-gray-100 dark:divide-zinc-800">
            <div className="px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
              <dt className="text-sm font-medium leading-6 text-gray-900 dark:text-zinc-300 flex items-center">
                <Hash className="w-4 h-4 mr-2 text-gray-400" />
                아이디
              </dt>
              <dd className="mt-1 text-sm leading-6 text-gray-700 dark:text-zinc-400 sm:col-span-2 sm:mt-0">
                {accountId}
              </dd>
            </div>
            
            <div className="px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
              <dt className="text-sm font-medium leading-6 text-gray-900 dark:text-zinc-300 flex items-center">
                <Mail className="w-4 h-4 mr-2 text-gray-400" />
                이메일
              </dt>
              <dd className="mt-1 text-sm leading-6 text-gray-700 dark:text-zinc-400 sm:col-span-2 sm:mt-0">
                {email}
              </dd>
            </div>
            
            <div className="px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
              <dt className="text-sm font-medium leading-6 text-gray-900 dark:text-zinc-300 flex items-center">
                <Shield className="w-4 h-4 mr-2 text-gray-400" />
                권한 수준
              </dt>
              <dd className="mt-1 text-sm leading-6 text-gray-700 dark:text-zinc-400 sm:col-span-2 sm:mt-0">
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                  account?.permission === 0 
                    ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                    : 'bg-gray-100 text-gray-800 dark:bg-zinc-800 dark:text-zinc-300 border border-gray-200 dark:border-zinc-700'
                }`}>
                  {permission}
                </span>
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <PasswordChangeForm />
    </div>
  )
}
