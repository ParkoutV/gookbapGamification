'use server'

import { createAdminClient } from '@/utils/supabase/admin'
import { createClient } from '@/utils/supabase/server'
import crypto from 'crypto'

export async function createAccount(formData: FormData) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { error: '권한이 없습니다.' }
    }

    const adminClient = createAdminClient()

    // 1. 최고 관리자 권한 확인
    const { data: currentUserAccount } = await adminClient
      .from('accounts')
      .select('permission')
      .eq('user_id', user.id)
      .single()

    if (currentUserAccount?.permission !== 0) {
      return { error: '최고 관리자만 계정을 생성할 수 있습니다.' }
    }

    const accountId = formData.get('accountId') as string
    const email = formData.get('email') as string
    const permission = parseInt(formData.get('permission') as string, 10)

    if (!accountId || !email || isNaN(permission)) {
      return { error: '모든 필드를 올바르게 입력해주세요.' }
    }

    // 2. account_id 중복 확인
    const { data: existingAccount } = await adminClient
      .from('accounts')
      .select('account_id')
      .eq('account_id', accountId)
      .single()

    if (existingAccount) {
      return { error: '이미 존재하는 아이디입니다.' }
    }

    // 3. 무작위 임시 비밀번호 생성 (보안상 강력하게)
    const randomPassword = crypto.randomBytes(16).toString('hex') + 'A1!'

    // 4. Supabase Auth 유저 생성
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email: email,
      password: randomPassword,
      email_confirm: true,
    })

    if (authError || !authData.user) {
      console.error('Create user error:', authError)
      if (authError?.message.includes('already registered')) {
         return { error: '이미 가입된 이메일입니다.' }
      }
      return { error: '계정 생성에 실패했습니다.' }
    }

    // 5. accounts 테이블에 데이터 삽입 (is_setup_completed = false)
    const { error: dbError } = await adminClient
      .from('accounts')
      .insert({
        user_id: authData.user.id,
        account_id: accountId,
        permission: permission,
        is_setup_completed: false
      })

    if (dbError) {
      console.error('Insert account error:', dbError)
      // 롤백 (생성된 Auth 유저 삭제)
      await adminClient.auth.admin.deleteUser(authData.user.id)
      return { error: '데이터베이스 저장에 실패했습니다.' }
    }

    return { success: true, setupUuid: authData.user.id }

  } catch (error) {
    console.error('Account creation exception:', error)
    return { error: '서버 오류가 발생했습니다.' }
  }
}

export async function getAccountsList() {
  try {
    const adminClient = createAdminClient()
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { error: '권한이 없습니다.', accounts: [] }
    }

    // 최고 관리자 확인
    const { data: currentUserAccount } = await adminClient
      .from('accounts')
      .select('permission')
      .eq('user_id', user.id)
      .single()

    if (currentUserAccount?.permission !== 0) {
      return { error: '최고 관리자만 접근할 수 있습니다.', accounts: [] }
    }

    // 모든 Auth 유저 조회
    const { data: authData, error: authError } = await adminClient.auth.admin.listUsers()
    
    if (authError) {
      return { error: '유저 목록을 불러오지 못했습니다.', accounts: [] }
    }

    // accounts 테이블 조회
    const { data: accountsData, error: dbError } = await adminClient
      .from('accounts')
      .select('*')
      .order('created_at', { ascending: false })

    if (dbError) {
      return { error: '계정 데이터베이스를 불러오지 못했습니다.', accounts: [] }
    }

    // 두 데이터 병합
    const mergedList = accountsData.map((acc: any) => {
      const authUser = authData.users.find((u) => u.id === acc.user_id)
      return {
        ...acc,
        email: authUser?.email || '알 수 없음',
        is_current_user: acc.user_id === user.id
      }
    })

    return { success: true, accounts: mergedList }
  } catch (error) {
    console.error('getAccountsList error:', error)
    return { error: '서버 오류가 발생했습니다.', accounts: [] }
  }
}

export async function updatePermission(userId: string, newPermission: number) {
  try {
    const adminClient = createAdminClient()
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user || user.id === userId) {
      return { error: '권한이 없거나 자신의 권한은 변경할 수 없습니다.' }
    }

    const { data: currentUserAccount } = await adminClient
      .from('accounts')
      .select('permission')
      .eq('user_id', user.id)
      .single()

    if (currentUserAccount?.permission !== 0) {
      return { error: '최고 관리자만 권한을 수정할 수 있습니다.' }
    }

    const { error: updateError } = await adminClient
      .from('accounts')
      .update({ permission: newPermission })
      .eq('user_id', userId)

    if (updateError) {
      return { error: '권한 수정에 실패했습니다.' }
    }

    return { success: true }
  } catch (error) {
    return { error: '서버 오류가 발생했습니다.' }
  }
}

export async function deleteAccount(userId: string) {
  try {
    const adminClient = createAdminClient()
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user || user.id === userId) {
      return { error: '권한이 없거나 자기 자신은 삭제할 수 없습니다.' }
    }

    const { data: currentUserAccount } = await adminClient
      .from('accounts')
      .select('permission')
      .eq('user_id', user.id)
      .single()

    if (currentUserAccount?.permission !== 0) {
      return { error: '최고 관리자만 계정을 삭제할 수 있습니다.' }
    }

    // 1. accounts 데이터 삭제
    await adminClient.from('accounts').delete().eq('user_id', userId)

    // 2. auth.users 삭제 (CASCADE가 동작하더라도 안전하게 직접 삭제)
    const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(userId)

    if (deleteAuthError) {
      return { error: '인증 서버에서 유저를 삭제하지 못했습니다.' }
    }

    return { success: true }
  } catch (error) {
    return { error: '서버 오류가 발생했습니다.' }
  }
}
