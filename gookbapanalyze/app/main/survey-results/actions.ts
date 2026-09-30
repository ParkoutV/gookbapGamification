'use server'

import { authorizeDashboard } from '@/utils/supabase/authorization'

export async function fetchSurveyData() {
  const access = await authorizeDashboard([0, 1])
  if (!access.ok) throw new Error(access.error)
  const { supabase, account } = access
  const permission = account.permission
  const assignedBranchId = account.assigned_branch_id
  // An unassigned branch user must never fall back to all branches.
  if (permission === 1 && !assignedBranchId) {
    return { questions: [], responses: [] }
  }

  // 1. Fetch questions
  let qQuery = supabase
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

  if (!questions || questions.length === 0) return { questions: [], responses: [] }

  // Apply the same question scope before returning data, in addition to RLS.
  let rQuery = supabase
    .from('survey_responses')
    .select('response_id, question_id, participant_id, answer_data, created_at, log_id')
    .order('created_at', { ascending: false })
  if (permission === 1) {
    rQuery = rQuery.in('question_id', questions.map(question => question.question_id))
  }
  const { data: responses, error: rError } = await rQuery

  if (rError) {
    console.error('fetchSurveyData error:', rError)
    throw new Error('Failed to fetch survey responses')
  }

  // 3. Fetch track_logs for these responses separately to avoid foreign key relation issues
  const logIds = Array.from(new Set(responses.map(r => r.log_id).filter(Boolean)))
  
  type TrackLog = { log_id: string; track_id: string | null; is_shared: boolean | null }
  let trackLogsMap: Record<string, TrackLog> = {}
  if (logIds.length > 0) {
    const { data: trackLogs } = await supabase
      .from('track_logs')
      .select('log_id, track_id, is_shared')
      .in('log_id', logIds)
      
    if (trackLogs) {
      trackLogsMap = trackLogs.reduce<Record<string, TrackLog>>((acc, curr) => {
        acc[curr.log_id] = curr
        return acc
      }, {})
    }
  }

  // Merge track_logs into responses
  const responsesWithTrackLogs = responses.map(r => ({
    ...r,
    track_logs: r.log_id && trackLogsMap[r.log_id] ? trackLogsMap[r.log_id] : null
  }))

  return { questions, responses: responsesWithTrackLogs }
}
