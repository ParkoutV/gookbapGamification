import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import NicknameClient from './NicknameClient'

export default async function NicknamesPage() {
  const supabase = await createClient()

  // 1. 권한 체크
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  const { data: account } = await supabase
    .from('accounts')
    .select('permission')
    .eq('user_id', user.id)
    .single()

  if (account?.permission !== 0) {
    // Admin만 접근 가능
    redirect('/main')
  }

  // 2. 언어 데이터 로드
  const { data: languages } = await supabase
    .from('supported_languages')
    .select('*')
    .eq('is_active', true)
    .order('order_index')

  // 3. 닉네임 프리셋 로드
  const { data: presets } = await supabase
    .from('nickname_presets')
    .select('*')
    .order('created_at', { ascending: true })

  // 4. 제외 조합(Exclusions) 로드
  const { data: exclusions } = await supabase
    .from('nickname_exclusions')
    .select('*')
    .order('created_at', { ascending: true })

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold dark:text-white">닉네임 관리</h1>
      <p className="text-gray-600 dark:text-gray-400">
        게임에 사용될 닉네임 프리셋(앞글자/뒷글자)과 제외 조합을 설정합니다.
      </p>
      <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800">
        <ul className="text-sm text-blue-800 dark:text-blue-300 space-y-1 list-disc list-inside">
          <li><strong>상태(체크박스)가 켜져 있으면:</strong> 신규 닉네임 할당 시 무작위로 등장합니다.</li>
          <li><strong>상태를 끄면:</strong> 신규 할당 시 등장하지 않지만, 기존에 해당 닉네임을 받은 유저는 그대로 유지됩니다.</li>
          <li><strong>항목을 삭제하면:</strong> 기존 유저의 닉네임도 삭제되며, 시스템이 유효한 새 닉네임을 자동으로 다시 부여합니다.</li>
        </ul>
      </div>
      
      <NicknameClient 
        initialLanguages={languages || []}
        initialPresets={presets || []}
        initialExclusions={exclusions || []}
      />
    </div>
  )
}
