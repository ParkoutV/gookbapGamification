'use server'

import { createClient } from '@/utils/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export async function changePassword(formData: FormData) {
  const currentPassword = formData.get('currentPassword') as string
  const newPassword = formData.get('newPassword') as string
  const confirmPassword = formData.get('confirmPassword') as string

  if (!currentPassword || !newPassword || !confirmPassword) {
    return { error: '모든 필드를 입력해주세요.' }
  }

  if (newPassword !== confirmPassword) {
    return { error: '신규 비밀번호가 일치하지 않습니다.' }
  }

  if (newPassword.length < 4) {
    return { error: '비밀번호는 최소 4자 이상이어야 합니다.' }
  }

  const supabase = await createClient()
  
  // Get current user email
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  
  if (userError || !user || !user.email) {
    return { error: '사용자 정보를 불러올 수 없습니다.' }
  }

  // Verify current password using a dummy anon client 
  // to avoid modifying SSR session unexpectedly.
  const authCheckClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { error: verifyError } = await authCheckClient.auth.signInWithPassword({
    email: user.email,
    password: currentPassword
  })

  if (verifyError) {
    return { error: '기존 비밀번호가 일치하지 않습니다.' }
  }

  // Update password using the user's authenticated client
  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword
  })

  if (updateError) {
    console.error('Password update error:', updateError)
    return { error: '비밀번호 변경에 실패했습니다. 다시 시도해주세요.' }
  }

  return { success: true }
}
