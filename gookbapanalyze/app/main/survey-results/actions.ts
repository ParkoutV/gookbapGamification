'use server'

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

export async function fetchSurveyData() {
  const supabaseAuth = await createClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  const adminClient = createAdminClient()

  const { data: account } = await adminClient
    .from('accounts')
    .select('permission, assigned_branch_id')
    .eq('user_id', user.id)
    .single()

  const permission = account?.permission ?? 1
  const assignedBranchId = account?.assigned_branch_id

  // 1. Fetch questions
  let qQuery = adminClient
    .from('survey_questions')
    .select('question_id, survey_phase, question_text, question_type, options, order_index, branch_id')
    .order('survey_phase', { ascending: true })
    .order('order_index', { ascending: true })

  // DB level filtering for Normal User
  if (permission === 1) {
    qQuery = qQuery.eq('survey_phase', 2)
    if (assignedBranchId) {
      qQuery = qQuery.eq('branch_id', assignedBranchId)
    }
  }

  const { data: questions, error: qError } = await qQuery

  if (qError) {
    console.error('Error fetching survey questions:', qError)
    throw new Error('Failed to fetch survey questions')
  }

  // 2. Fetch responses
  // Wait, if permission === 1, they only need responses for their phase 2 questions.
  // Actually, fetching all responses is fine because the client only renders based on `questions`.
  // But to optimize and secure it, we can fetch all or just let client filter. 
  // We'll fetch all here for simplicity, the client handles the intersection efficiently.
  const { data: responses, error: rError } = await adminClient
    .from('survey_responses')
    .select('response_id, question_id, participant_id, answer_data, created_at')
    .order('created_at', { ascending: false })

  if (rError) {
    console.error('Error fetching survey responses:', rError)
    throw new Error('Failed to fetch survey responses')
  }

  return { questions, responses }
}
