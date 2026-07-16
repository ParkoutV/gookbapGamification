'use server'
/* eslint-disable @typescript-eslint/no-unused-vars */
'use server'

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export async function loginUser(formData: FormData) {
  const credential = formData.get('credential') as string
  const password = formData.get('password') as string

  if (!credential || !password) {
    return { error: '아이디/이메일과 비밀번호를 모두 입력해주세요.' }
  }

  let email = credential

  // ID로 로그인 시 이메일 조회
  if (!credential.includes('@')) {
    const adminClient = createAdminClient()
    const { data: account, error: accountError } = await adminClient
      .from('accounts')
      .select('user_id')
      .eq('account_id', credential)
      .single()

    if (accountError || !account) {
      return { error: '존재하지 않는 계정입니다.' }
    }

    const { data: userData, error: userError } = await adminClient.auth.admin.getUserById(account.user_id)

    if (userError || !userData.user?.email) {
      return { error: '계정에 연결된 이메일을 찾을 수 없습니다.' }
    }

    email = userData.user.email
  }

  const supabase = await createClient()

  // 비밀번호 확인
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    console.error('Supabase signIn error:', error)
    return { error: '비밀번호가 일치하지 않거나 로그인에 실패했습니다.' }
  }

  // 로그인 성공 후 기기 인증 확인
  const cookieStore = await cookies()
  const hasTrustedDevice = cookieStore.has('trusted_device')

  if (!hasTrustedDevice) {
    // 최초 로그인 기기이므로 세션을 임시 해제하고 OTP 발송
    await supabase.auth.signOut()
    
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
      }
    })

    if (otpError) {
      return { error: '이메일 인증 코드 발송에 실패했습니다.' }
    }

    return { mfaRequired: true, email }
  }

  return { success: true }
}

export async function verifyOTP(formData: FormData) {
  const email = formData.get('email') as string
  const token = formData.get('token') as string

  if (!email || !token) {
    return { error: '이메일과 인증 코드가 필요합니다.' }
  }

  const supabase = await createClient()

  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'email',
  })

  if (error) {
    return { error: '유효하지 않거나 만료된 인증 코드입니다.' }
  }

  // 기기 인증 완료 쿠키 설정 (1년)
  const cookieStore = await cookies()
  cookieStore.set('trusted_device', 'true', {
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/'
  })

  return { success: true }
}

export async function logoutUser() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  
  // 기기 인증 쿠키 삭제
  const cookieStore = await cookies()
  cookieStore.delete('trusted_device')
  
  redirect('/login')
}
