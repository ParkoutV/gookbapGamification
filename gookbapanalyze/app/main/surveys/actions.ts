'use server'

import { authorizeDashboard } from '@/utils/supabase/authorization'
import { revalidatePath } from 'next/cache'

export async function toggleOptionalSurveyOnce(currentValue: boolean) {
  const access = await authorizeDashboard([0])
  if (!access.ok) throw new Error(access.error)
  if (typeof currentValue !== 'boolean') throw new Error('Invalid survey setting')
  
  const { data, error } = await access.supabase
    .from('survey_settings')
    .update({ optional_survey_once: !currentValue })
    .eq('id', 1)
    .select('optional_survey_once')
    .single()

  if (error || !data) {
    throw new Error('설정 업데이트 실패: ' + (error?.message || '설정이 변경되지 않았습니다.'))
  }

  revalidatePath('/main/surveys')
  return { success: true, newValue: data.optional_survey_once }
}
