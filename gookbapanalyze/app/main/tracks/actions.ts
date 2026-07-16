'use server'

import { createAdminClient } from '@/utils/supabase/admin'

function generateShortId(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

export type TrackGroup = {
  branch_id: string
  branch_name: string
  private_id: string | null
  shared_id: string | null
}

export type SupportedLanguage = {
  lang_code: string
  lang_name: string
  is_active: boolean
  order_index: number
}

export async function getSupportedLanguages() {
  const supabase = createAdminClient()
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

export async function getTracksGrouped() {
  const supabase = createAdminClient()
  
  // Fetch branches with their tracks
  const { data: branches, error } = await supabase
    .from('branches')
    .select(`
      branch_id,
      branch_name,
      tracks (
        track_id,
        is_shared
      )
    `)
    .order('created_at', { ascending: false })

  if (error) {
    return { error: error.message }
  }

  // Map to TrackGroup
  const grouped: TrackGroup[] = branches.map((branch: any) => {
    let private_id = null
    let shared_id = null

    if (branch.tracks) {
      branch.tracks.forEach((track: any) => {
        if (track.is_shared) shared_id = track.track_id
        else private_id = track.track_id
      })
    }

    return {
      branch_id: branch.branch_id,
      branch_name: branch.branch_name,
      private_id,
      shared_id
    }
  })

  return { tracks: grouped }
}

export async function createTrack(branchNameJson: string) {
  const supabase = createAdminClient()
  
  // Create branch first
  const { data: branchData, error: branchError } = await supabase
    .from('branches')
    .insert([{ branch_name: branchNameJson }])
    .select('branch_id')
    .single()

  if (branchError || !branchData) {
    return { error: branchError?.message || '지점 생성에 실패했습니다.' }
  }

  const branchId = branchData.branch_id

  // Create tracks
  const privateId = generateShortId()
  const sharedId = generateShortId()

  const { error: tracksError } = await supabase
    .from('tracks')
    .insert([
      { track_id: privateId, branch_id: branchId, is_shared: false },
      { track_id: sharedId, branch_id: branchId, is_shared: true }
    ])

  if (tracksError) {
    return { error: tracksError.message }
  }

  return { success: true }
}

export async function updateTrack(branchId: string, newBranchNameJson: string) {
  const supabase = createAdminClient()
  
  const { error } = await supabase
    .from('branches')
    .update({ branch_name: newBranchNameJson })
    .eq('branch_id', branchId)

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}
