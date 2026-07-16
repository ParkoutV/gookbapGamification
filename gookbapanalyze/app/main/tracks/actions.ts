'use server'

import { createAdminClient } from '@/utils/supabase/admin'
import { v4 as uuidv4 } from 'uuid'

export type TrackGroup = {
  track_type: string
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
  const { data: tracks, error } = await supabase
    .from('tracks')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return { error: error.message }
  }

  // Group by track_type
  const grouped = tracks.reduce((acc: Record<string, TrackGroup>, track) => {
    const key = track.track_type
    if (!acc[key]) {
      acc[key] = { track_type: key, private_id: null, shared_id: null }
    }
    if (track.is_shared) {
      acc[key].shared_id = track.track_id
    } else {
      acc[key].private_id = track.track_id
    }
    return acc
  }, {})

  return { tracks: Object.values(grouped) as TrackGroup[] }
}

export async function createTrack(trackTypeJson: string) {
  const supabase = createAdminClient()
  
  // Check if it already exists
  const { data: existing } = await supabase
    .from('tracks')
    .select('track_id')
    .eq('track_type', trackTypeJson)
    .limit(1)

  if (existing && existing.length > 0) {
    return { error: '동일한 지점명이 이미 존재합니다.' }
  }

  const privateId = uuidv4()
  const sharedId = uuidv4()

  const { error } = await supabase
    .from('tracks')
    .insert([
      { track_id: privateId, track_type: trackTypeJson, is_shared: false },
      { track_id: sharedId, track_type: trackTypeJson, is_shared: true }
    ])

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}

export async function updateTrack(privateId: string | null, sharedId: string | null, newTrackTypeJson: string) {
  const supabase = createAdminClient()
  
  const idsToUpdate = []
  if (privateId) idsToUpdate.push(privateId)
  if (sharedId) idsToUpdate.push(sharedId)

  if (idsToUpdate.length === 0) {
    return { error: '업데이트할 ID가 없습니다.' }
  }

  const { error } = await supabase
    .from('tracks')
    .update({ track_type: newTrackTypeJson })
    .in('track_id', idsToUpdate)

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}

export async function deleteTrack(privateId: string | null, sharedId: string | null) {
  const supabase = createAdminClient()
  
  const idsToDelete = []
  if (privateId) idsToDelete.push(privateId)
  if (sharedId) idsToDelete.push(sharedId)

  if (idsToDelete.length === 0) {
    return { error: '삭제할 ID가 없습니다.' }
  }

  const { error } = await supabase
    .from('tracks')
    .delete()
    .in('track_id', idsToDelete)

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}
