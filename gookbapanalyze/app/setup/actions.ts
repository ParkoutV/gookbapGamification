/* eslint-disable @typescript-eslint/no-unused-vars */
'use server'

import { createAdminClient } from '@/utils/supabase/admin'

export async function verifySetupLink(uuid: string) {
  try {
    const adminClient = createAdminClient()

    const { data: account, error } = await adminClient
      .from('accounts')
      .select('is_setup_completed, account_id, user_id')
      .eq('user_id', uuid)
      .single()

    if (error || !account) {
      return { error: '유효하지 않은 설정 링크입니다.' }
    }

    if (account.is_setup_completed) {
      return { error: '이미 비밀번호 설정이 완료된 계정입니다. 만료된 링크입니다.' }
    }

    const { data: userData, error: userError } = await adminClient.auth.admin.getUserById(uuid)

    if (userError || !userData.user?.email) {
      return { error: '계정 정보를 찾을 수 없습니다.' }
    }

    return { 
      success: true, 
      accountId: account.account_id,
      email: userData.user.email 
    }
  } catch (err) {
    return { error: '서버 에러가 발생했습니다.' }
  }
}

export async function setupPassword(formData: FormData) {
  try {
    const uuid = formData.get('uuid') as string
    const password = formData.get('password') as string
    const confirmPassword = formData.get('confirmPassword') as string

    if (!uuid || !password || !confirmPassword) {
      return { error: '모든 필드를 입력해주세요.' }
    }

    if (password !== confirmPassword) {
      return { error: '비밀번호가 일치하지 않습니다.' }
    }

    if (password.length < 6) {
      return { error: '비밀번호는 최소 6자리 이상이어야 합니다.' }
    }

    const adminClient = createAdminClient()

    // 1. 유효성 및 완료 여부 재확인
    const { data: account } = await adminClient
      .from('accounts')
      .select('is_setup_completed')
      .eq('user_id', uuid)
      .single()

    if (!account || account.is_setup_completed) {
      return { error: '이미 설정이 완료되었거나 유효하지 않은 링크입니다.' }
    }

    // 2. Auth 유저 비밀번호 업데이트
    const { error: updateError } = await adminClient.auth.admin.updateUserById(uuid, {
      password: password
    })

    if (updateError) {
      console.error('Password update error:', updateError)
      return { error: '비밀번호 변경에 실패했습니다.' }
    }

    // 3. accounts 테이블 상태 업데이트
    const { error: dbError } = await adminClient
      .from('accounts')
      .update({ is_setup_completed: true })
      .eq('user_id', uuid)

    if (dbError) {
      console.error('Account update error:', dbError)
      return { error: '계정 상태 업데이트에 실패했습니다.' }
    }

    return { success: true }
  } catch (err) {
    console.error('Setup password exception:', err)
    return { error: '서버 에러가 발생했습니다.' }
  }
}
