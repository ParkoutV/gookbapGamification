'use server'

import { createClient } from '@/utils/supabase/server'

export type Agreement = {
  doc_id: string
  body: Record<string, string>
  updated_at: string
}

export type SupportedLanguage = {
  lang_code: string
  lang_name: string
  is_active: boolean
  order_index: number
}

export async function getSupportedLanguages() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('supported_languages')
    .select('*')
    .eq('is_active', true)
    .order('order_index')

  if (error) {
    return { error: error.message }
  }
  return { languages: data as SupportedLanguage[] }
}

export async function getAgreements() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('agreements')
    .select('*')
    .order('doc_id')

  if (error) {
    return { error: error.message }
  }
  return { agreements: data as Agreement[] }
}

export async function updateAgreement(doc_id: string, bodyJson: Record<string, string>) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '권한이 없습니다.' }
  
  // Verify permission
  const { data: account } = await supabase.from('accounts').select('permission').eq('user_id', user.id).single()
  if (account?.permission !== 0) {
    return { error: '최고 관리자만 접근할 수 있습니다.' }
  }

  const { error } = await supabase
    .from('agreements')
    .update({ body: bodyJson, updated_at: new Date().toISOString() })
    .eq('doc_id', doc_id)

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}
