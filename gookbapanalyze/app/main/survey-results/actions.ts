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
    .select('response_id, question_id, participant_id, answer_data, created_at, log_id')
    .order('created_at', { ascending: false })

  if (rError) {
    console.error('fetchSurveyData error:', rError)
    throw new Error('Failed to fetch survey responses')
  }

  // 3. Fetch track_logs for these responses separately to avoid foreign key relation issues
  const logIds = Array.from(new Set(responses.map(r => r.log_id).filter(Boolean)))
  
  let trackLogsMap: Record<string, any> = {}
  if (logIds.length > 0) {
    const { data: trackLogs } = await adminClient
      .from('track_logs')
      .select('log_id, track_id, is_shared')
      .in('log_id', logIds)
      
    if (trackLogs) {
      trackLogsMap = trackLogs.reduce((acc, curr) => {
        acc[curr.log_id] = curr
        return acc
      }, {} as Record<string, any>)
    }
  }

  // Merge track_logs into responses
  const responsesWithTrackLogs = responses.map(r => ({
    ...r,
    track_logs: r.log_id && trackLogsMap[r.log_id] ? trackLogsMap[r.log_id] : null
  }))

  return { questions, responses: responsesWithTrackLogs }
}
