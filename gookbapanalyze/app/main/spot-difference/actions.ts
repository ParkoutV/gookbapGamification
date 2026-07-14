'use server'

import { createClient } from '@/utils/supabase/server'
import { v4 as uuidv4 } from 'uuid'

export async function getBaseImages() {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('base_images')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    return { success: true, baseImages: data }
  } catch (error: any) {
    console.error('Error fetching base images:', error)
    return { error: '이미지 목록을 불러오는 중 오류가 발생했습니다.' }
  }
}

export async function uploadBaseImage(formData: FormData) {
  try {
    const supabase = await createClient()
    
    // Auth check
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: '권한이 없습니다.' }

    const file = formData.get('file') as File
    const title = formData.get('title') as string

    if (!file) return { error: '파일이 없습니다.' }
    if (!title) return { error: '제목을 입력해주세요.' }

    const fileExt = file.name.split('.').pop()
    const fileName = `base_${uuidv4()}.${fileExt}`
    const filePath = `base_images/${fileName}`

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('game_assets')
      .upload(filePath, file)

    if (uploadError) throw uploadError

    const { data: publicUrlData } = supabase.storage
      .from('game_assets')
      .getPublicUrl(filePath)

    const { data: dbData, error: dbError } = await supabase
      .from('base_images')
      .insert({
        title: title,
        image_url: publicUrlData.publicUrl
      })
      .select()
      .single()

    if (dbError) throw dbError

    return { success: true, baseImage: dbData }
  } catch (error: any) {
    console.error('Error uploading base image:', error)
    return { error: '이미지 업로드 중 오류가 발생했습니다.' }
  }
}

export async function deleteBaseImage(id: number) {
  try {
    const supabase = await createClient()
    
    // Auth check
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: '권한이 없습니다.' }

    // 삭제 전 URL 확인 및 스토리지 삭제 (선택적)
    const { data: baseImage } = await supabase.from('base_images').select('image_url').eq('id', id).single()
    
    // CASCADE 삭제로 image_slots도 삭제될 수 있으나, 만약 안 걸려있다면 직접 삭제
    await supabase.from('image_slots').delete().eq('base_image_id', id)
    
    const { error } = await supabase.from('base_images').delete().eq('id', id)
    if (error) throw error

    return { success: true }
  } catch (error: any) {
    console.error('Error deleting base image:', error)
    return { error: '이미지 삭제 중 오류가 발생했습니다.' }
  }
}

export async function getGameData(baseImageId: number) {
  try {
    const supabase = await createClient()
    
    const { data: baseImage, error: baseError } = await supabase
      .from('base_images')
      .select('*')
      .eq('id', baseImageId)
      .single()

    if (baseError) throw baseError

    const { data: slots, error: slotsError } = await supabase
      .from('image_slots')
      .select('*')
      .eq('base_image_id', baseImageId)

    if (slotsError) throw slotsError

    const categoryIds = slots.map(s => s.category_id)
    let partsData: any[] = []
    
    if (categoryIds.length > 0) {
      const { data: parts, error: partsError } = await supabase
        .from('parts')
        .select('*')
        .in('category_id', categoryIds)

      if (partsError) throw partsError
      partsData = parts
    }

    return { success: true, baseImage, slots, parts: partsData }
  } catch (error: any) {
    console.error('Error fetching game data:', error)
    return { error: '게임 데이터를 불러오는 중 오류가 발생했습니다.' }
  }
}

export async function uploadPartImage(formData: FormData) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: '권한이 없습니다.' }

    const file = formData.get('file') as File
    if (!file) return { error: '파일이 없습니다.' }

    const fileExt = file.name.split('.').pop()
    const fileName = `part_${uuidv4()}.${fileExt}`
    const filePath = `parts/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('game_assets')
      .upload(filePath, file)

    if (uploadError) throw uploadError

    const { data: publicUrlData } = supabase.storage
      .from('game_assets')
      .getPublicUrl(filePath)

    return { success: true, url: publicUrlData.publicUrl }
  } catch (error: any) {
    console.error('Error uploading part image:', error)
    return { error: '이미지 업로드 중 오류가 발생했습니다.' }
  }
}

export async function saveGameData(
  baseImageId: number, 
  slots: any[], 
  parts: any[], 
  deletedSlotIds: number[], 
  deletedPartIds: number[]
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: '권한이 없습니다.' }

    // 1. Delete parts
    if (deletedPartIds.length > 0) {
      await supabase.from('parts').delete().in('id', deletedPartIds)
    }

    // 2. Delete slots
    if (deletedSlotIds.length > 0) {
      await supabase.from('image_slots').delete().in('id', deletedSlotIds)
      // Delete associated parts as well if DB constraint doesn't exist
      await supabase.from('parts').delete().in('category_id', deletedSlotIds.map(s => -s)) // Requires proper mapping in real scenario
    }

    // 3. Upsert Slots
    for (const slot of slots) {
      if (slot.isNew) {
        // Find max category_id to generate a new one
        const { data: maxCat } = await supabase.from('image_slots').select('category_id').order('category_id', { ascending: false }).limit(1).single()
        const newCategoryId = (maxCat?.category_id || 0) + 1
        
        slot.category_id = newCategoryId

        const { data: newSlot, error: insertError } = await supabase.from('image_slots').insert({
          base_image_id: baseImageId,
          category_id: newCategoryId,
          x_coordinate: slot.x_coordinate,
          y_coordinate: slot.y_coordinate,
          z_index: slot.z_index,
          scale: slot.scale
        }).select().single()

        if (insertError) throw insertError
        
        // Update parts that reference this temporary slot ID
        for (const part of parts) {
          if (part.slotTempId === slot.tempId) {
            part.category_id = newCategoryId
          }
        }
      } else {
        const { error: updateError } = await supabase.from('image_slots').update({
          x_coordinate: slot.x_coordinate,
          y_coordinate: slot.y_coordinate,
          z_index: slot.z_index,
          scale: slot.scale
        }).eq('id', slot.id)
        
        if (updateError) throw updateError
      }
    }

    // 4. Upsert Parts
    for (const part of parts) {
      if (part.isNew) {
        const { error: insertError } = await supabase.from('parts').insert({
          category_id: part.category_id,
          name: part.name,
          image_url: part.image_url,
          offset_x: part.offset_x,
          offset_y: part.offset_y,
          scale: part.scale
        })
        if (insertError) throw insertError
      } else {
        const { error: updateError } = await supabase.from('parts').update({
          name: part.name,
          image_url: part.image_url,
          offset_x: part.offset_x,
          offset_y: part.offset_y,
          scale: part.scale
        }).eq('id', part.id)
        if (updateError) throw updateError
      }
    }

    return { success: true }
  } catch (error: any) {
    console.error('Error saving game data:', error)
    return { error: '게임 데이터 저장 중 오류가 발생했습니다.' }
  }
}
