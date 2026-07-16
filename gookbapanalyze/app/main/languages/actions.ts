'use server'

import { createClient } from '@/utils/supabase/server'
import { SupportedLanguage } from '../tracks/actions' // We can reuse the type

export async function getAllLanguages() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('supported_languages')
    .select('*')
    .order('order_index')

  if (error) {
    return { error: error.message }
  }
  return { languages: data as SupportedLanguage[] }
}

export async function updateLanguage(
  langCode: string,
  updates: { lang_name?: string; is_active?: boolean; order_index?: number }
) {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('supported_languages')
    .update(updates)
    .eq('lang_code', langCode)

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}
