'use server'

import { createAdminClient } from '@/utils/supabase/admin'

export async function fetchSurveyData() {
  const supabase = createAdminClient()

  // 1. Fetch questions
  const { data: questions, error: qError } = await supabase
    .from('survey_questions')
    .select('question_id, survey_phase, question_text, question_type, options, order_index, branch_id')
    .order('survey_phase', { ascending: true })
    .order('order_index', { ascending: true })

  if (qError) {
    console.error('Error fetching survey questions:', qError)
    throw new Error('Failed to fetch survey questions')
  }

  // 2. Fetch responses
  const { data: responses, error: rError } = await supabase
    .from('survey_responses')
    .select('response_id, question_id, participant_id, answer_data, created_at')
    .order('created_at', { ascending: false })

  if (rError) {
    console.error('Error fetching survey responses:', rError)
    throw new Error('Failed to fetch survey responses')
  }

  return { questions, responses }
}
