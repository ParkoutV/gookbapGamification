'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function deleteAllGameData() {
  const supabase = await createClient()
  
  const { data: userData, error: authError } = await supabase.auth.getUser()
  if (authError || !userData?.user) {
    return { error: '인증되지 않은 사용자입니다.' }
  }

  // 최고 관리자(0) 권한 확인
  const { data: accountData, error: accountError } = await supabase
    .from('accounts')
    .select('permission')
    .eq('user_id', userData.user.id)
    .single()

  if (accountError || !accountData || accountData.permission !== 0) {
    return { error: '최고 관리자 권한이 필요합니다.' }
  }

  // 삭제할 테이블 목록
  try {
    const { error: pError } = await supabase.from('participants').delete().neq('participant_id', '00000000-0000-0000-0000-000000000000')
    if (pError) throw pError

    const { error: sError } = await supabase.from('survey_responses').delete().neq('id', 0)
    if (sError) throw sError

    const { error: wError } = await supabase
      .from('web_coupons')
      .update({ participant_id: null, assigned_at: null })
      .not('participant_id', 'is', null)
    if (wError) throw wError

    revalidatePath('/main/game-management')
    return { success: true }
  } catch (err: any) {
    return { error: `데이터 삭제 중 오류가 발생했습니다: ${err.message}` }
  }
}

export async function getTemplateUrl() {
  const supabase = await createClient()
  const { data: userData, error: authError } = await supabase.auth.getUser()
  if (authError || !userData?.user) return { url: null }
  
  const { data: accountData } = await supabase.from('accounts').select('permission').eq('user_id', userData.user.id).single()
  if (!accountData || accountData.permission !== 0) return { url: null }

  const { createClient: createSupabaseClient } = await import('@supabase/supabase-js');
  const adminSupabase = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  
  const { data, error } = await adminSupabase.storage.from('admin_assets').createSignedUrl('templates/kpi_template.xlsx', 60 * 60)
  if (error) console.error('getTemplateUrl error:', error);
  return { url: data?.signedUrl || null }
}

export async function uploadTemplate(formData: FormData) {
  const supabase = await createClient()
  
  const { data: userData, error: authError } = await supabase.auth.getUser()
  if (authError || !userData?.user) {
    return { error: '인증되지 않은 사용자입니다.' }
  }

  const { data: accountData } = await supabase
    .from('accounts')
    .select('permission')
    .eq('user_id', userData.user.id)
    .single()

  if (!accountData || accountData.permission !== 0) {
    return { error: '최고 관리자 권한이 필요합니다.' }
  }

  const file = formData.get('file') as File
  if (!file) return { error: '파일이 없습니다.' }

  const buffer = await file.arrayBuffer()

  const { createClient: createSupabaseClient } = await import('@supabase/supabase-js');
  const adminSupabase = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { error } = await adminSupabase.storage
    .from('admin_assets')
    .upload('templates/kpi_template.xlsx', buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: true
    })

  if (error) {
    return { error: `업로드 실패: ${error.message}` }
  }

  revalidatePath('/main/game-management')
  return { success: true }
}
