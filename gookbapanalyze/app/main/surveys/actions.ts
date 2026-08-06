'use server'

import { createAdminClient } from '@/utils/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function toggleOptionalSurveyOnce(currentValue: boolean) {
  const adminClient = createAdminClient()
  
  const { error } = await adminClient
    .from('survey_settings')
    .update({ optional_survey_once: !currentValue })
    .eq('id', 1)

  if (error) {
    throw new Error('설정 업데이트 실패: ' + error.message)
  }

  revalidatePath('/main/surveys')
  return { success: true, newValue: !currentValue }
}
