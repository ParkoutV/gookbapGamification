'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function getAdminClient() {
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData?.user) throw new Error('Unauthorized')
  
  const { data: accountData } = await supabase.from('accounts').select('permission').eq('user_id', userData.user.id).single()
  if (!accountData || accountData.permission !== 0) throw new Error('Forbidden. Admin access required.')

  const { createClient: createSupabaseClient } = await import('@supabase/supabase-js');
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function createArchive(startDate: string | null, endDate: string | null) {
  try {
    const adminSupabase = await getAdminClient()
    const supabase = await createClient()

    // Fetch all needed raw data directly from DB using service role
    
    // 1. Fetch tracks & branches mapping
    const { data: tracksData } = await adminSupabase.from('tracks').select('track_id, is_shared, branches(branch_name)')
    const tracksMap = new Map<string, any>()
    tracksData?.forEach((t: any) => tracksMap.set(t.track_id, t))

    // 1b. Fetch all survey questions
    const { data: surveyQuestions } = await adminSupabase.from('survey_questions').select('*')

    // 2. Fetch participant core data
    let logsQuery = adminSupabase.from('track_logs').select(`
      log_id,
      participant_id,
      track_id,
      access_time,
      game_start_count,
      share_clicked
    `)
    if (startDate) logsQuery = logsQuery.gte('access_time', startDate)
    if (endDate) logsQuery = logsQuery.lte('access_time', endDate)
    const { data: trackLogs } = await logsQuery

    const validParticipantIds = Array.from(new Set(trackLogs?.map((l: any) => l.participant_id) || []))

    // Chunk participant fetching if there are too many
    const chunkArray = (arr: any[], size: number) => Array.from({ length: Math.ceil(arr.length / size) }, (v, i) => arr.slice(i * size, i * size + size));
    const participantChunks = chunkArray(validParticipantIds, 500)

    let participants: any[] = []
    let gameScoreLogs: any[] = []
    let surveyResponses: any[] = []
    let issuedCoupons: any[] = []

    for (const chunk of participantChunks) {
      const { data: pData } = await adminSupabase.from('participants').select('*').in('participant_id', chunk)
      if (pData) participants.push(...pData)

      const { data: gsData } = await adminSupabase.from('game_score_logs').select('*').in('participant_id', chunk)
      if (gsData) gameScoreLogs.push(...gsData)

      const { data: srData } = await adminSupabase.from('survey_responses').select(`
        *,
        survey_questions (
          question_text,
          survey_phase,
          question_type,
          options
        )
      `).in('participant_id', chunk)
      if (srData) surveyResponses.push(...srData)

      const { data: icData } = await adminSupabase.from('issued_coupons').select(`
        *,
        coupon_effects (
          coupon_type
        )
      `).in('participant_id', chunk)
      if (icData) issuedCoupons.push(...icData)
    }

    // 3. Mask participant_id
    const idMap = new Map<string, string>()
    let pCounter = 1
    const maskId = (id: string) => {
      if (!id) return id
      if (!idMap.has(id)) {
        idMap.set(id, `Participant_${pCounter++}`)
      }
      return idMap.get(id)
    }

    // Apply masking
    participants = participants.map(p => ({ ...p, participant_id: maskId(p.participant_id) }))
    const maskedTrackLogs = trackLogs?.map(l => ({ ...l, participant_id: maskId(l.participant_id) })) || []
    gameScoreLogs = gameScoreLogs.map(g => ({ ...g, participant_id: maskId(g.participant_id) }))
    surveyResponses = surveyResponses.map(s => ({ ...s, participant_id: maskId(s.participant_id) }))
    issuedCoupons = issuedCoupons.map(c => ({ ...c, participant_id: maskId(c.participant_id) }))

    // 4. Create JSON Snapshot
    const snapshot = {
      metadata: {
        createdAt: new Date().toISOString(),
        startDate,
        endDate,
        totalParticipants: participants.length
      },
      tracksData,
      surveyQuestions,
      participants,
      trackLogs: maskedTrackLogs,
      gameScoreLogs,
      surveyResponses,
      issuedCoupons
    }

    // 5. Upload to Storage
    const fileName = `archives/archive_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    const { error: uploadError } = await adminSupabase.storage
      .from('admin_assets')
      .upload(fileName, JSON.stringify(snapshot), {
        contentType: 'application/json'
      })

    if (uploadError) throw uploadError

    revalidatePath('/main/game-management')
    return { success: true }
  } catch (error: any) {
    console.error('createArchive error:', error)
    return { error: error.message }
  }
}

export async function listArchives() {
  try {
    const adminSupabase = await getAdminClient()
    const { data, error } = await adminSupabase.storage.from('admin_assets').list('archives')
    if (error) throw error
    // Filter out empty placeholder or non-json files
    return { data: data.filter(f => f.name.endsWith('.json')) }
  } catch (error: any) {
    return { error: error.message }
  }
}

export async function deleteArchive(fileName: string) {
  try {
    const adminSupabase = await getAdminClient()
    const { error } = await adminSupabase.storage.from('admin_assets').remove([`archives/${fileName}`])
    if (error) throw error
    revalidatePath('/main/game-management')
    return { success: true }
  } catch (error: any) {
    return { error: error.message }
  }
}

export async function getArchiveUrl(fileName: string) {
  try {
    const adminSupabase = await getAdminClient()
    const { data, error } = await adminSupabase.storage.from('admin_assets').createSignedUrl(`archives/${fileName}`, 60 * 60)
    if (error) throw error
    return { url: data.signedUrl }
  } catch (error: any) {
    return { error: error.message }
  }
}
