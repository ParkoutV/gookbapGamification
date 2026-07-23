/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
'use server'

import { createClient } from '@/utils/supabase/server'
import { v4 as uuidv4 } from 'uuid'
import { cookies, headers } from 'next/headers'
import { after } from 'next/server'

export async function getSupportedLanguages() {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('supported_languages')
      .select('*')
      .eq('is_active', true)
      .order('order_index', { ascending: true })

    if (error) throw error
    return { success: true, languages: data }
  } catch (error: any) {
    console.error('Error fetching languages:', error)
    return { error: '언어 목록을 불러오는 중 오류가 발생했습니다.' }
  }
}

export async function getBaseImages() {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('base_images')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error

    // Fetch unified_images for preview logic
    const { data: unifiedImages, error: unifiedError } = await supabase
      .from('unified_images')
      .select('base_image_id, image_slots, unified_image_url')

    if (!unifiedError && unifiedImages) {
      // For each base image, find the best unified image preview
      data.forEach(img => {
        const matches = unifiedImages.filter(u => u.base_image_id === img.id)
        if (matches.length > 0) {
          let minSum = Infinity
          let bestUrl = img.image_url
          
          matches.forEach(match => {
            let sum = 0
            for (const key in match.image_slots) {
              sum += parseInt(match.image_slots[key]) || 0
            }
            if (sum < minSum) {
              minSum = sum
              bestUrl = match.unified_image_url
            }
          })
          
          // Override image_url for preview purposes
          img.image_url = bestUrl
        }
      })
    }

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
    const titleStr = formData.get('title') as string
    const levelStr = formData.get('level') as string

    if (!file) return { error: '파일이 없습니다.' }
    if (!titleStr) return { error: '제목을 입력해주세요.' }

    let level = parseInt(levelStr, 10)
    if (isNaN(level) || level < 1 || level > 9) {
      level = 1
    }

    let titleObj;
    try {
      titleObj = JSON.parse(titleStr)
    } catch {
      titleObj = { ko: titleStr }
    }

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
        title: titleObj,
        image_url: publicUrlData.publicUrl,
        level: level
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

    // 1. Fetch URLs to delete from Storage
    const pathsToDelete: string[] = []

    // Base image URL
    const { data: baseImage } = await supabase.from('base_images').select('image_url').eq('id', id).single()
    if (baseImage && baseImage.image_url) {
      const match = baseImage.image_url.match(/game_assets\/(.+)$/)
      if (match && match[1]) pathsToDelete.push(match[1])
    }

    // Unified images URLs
    const { data: unifiedImages } = await supabase.from('unified_images').select('unified_image_url').eq('base_image_id', id)
    if (unifiedImages) {
      unifiedImages.forEach(ui => {
        const match = ui.unified_image_url?.match(/game_assets\/(.+)$/)
        if (match && match[1]) pathsToDelete.push(match[1])
      })
    }

    // Parts URLs (we need to find slots first)
    const { data: slots } = await supabase.from('image_slots').select('category_id').eq('base_image_id', id)
    const categoryIds = slots ? slots.map(s => s.category_id) : []
    
    if (categoryIds.length > 0) {
      const { data: parts } = await supabase.from('parts').select('image_url').in('category_id', categoryIds)
      if (parts) {
        parts.forEach(p => {
          const match = p.image_url?.match(/game_assets\/(.+)$/)
          if (match && match[1]) pathsToDelete.push(match[1])
        })
      }
    }

    // 2. Delete from DB (The UI updates instantly after this)
    // Note: unified_images should cascade from base_images. If not, delete it manually just in case.
    await supabase.from('unified_images').delete().eq('base_image_id', id)
    
    // Parts and Part Categories (delete manually to keep DB clean)
    if (categoryIds.length > 0) {
      await supabase.from('parts').delete().in('category_id', categoryIds)
      await supabase.from('part_categories').delete().in('id', categoryIds)
    }
    
    await supabase.from('image_slots').delete().eq('base_image_id', id)
    const { error } = await supabase.from('base_images').delete().eq('id', id)
    if (error) throw error

    // 3. Trigger background Storage Cleanup
    if (pathsToDelete.length > 0) {
      const headersList = await headers()
      const host = headersList.get('host') || 'localhost:3000'
      const protocol = headersList.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https')
      const appUrl = `${protocol}://${host}`
      
      const cookieStore = await cookies()
      const allCookies = cookieStore.getAll().map(c => `${c.name}=${c.value}`).join('; ')
      
      after(async () => {
        await fetch(`${appUrl}/api/cleanup-storage`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Cookie': allCookies
          },
          body: JSON.stringify({ paths: pathsToDelete })
        }).catch(e => console.error('Failed to trigger storage cleanup:', e))
      })
    }

    return { success: true }
  } catch (error: any) {
    console.error('Error deleting base image:', error)
    return { error: '이미지 삭제 중 오류가 발생했습니다.' }
  }
}

export async function updateBaseImageLevel(id: number, level: number) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: '권한이 없습니다.' }

    if (level < 1 || level > 9) {
      return { error: '레벨은 1에서 9 사이여야 합니다.' }
    }

    const { error } = await supabase.from('base_images').update({ level }).eq('id', id)
    if (error) throw error

    return { success: true }
  } catch (error: any) {
    console.error('Error updating base image level:', error)
    return { error: '레벨 수정 중 오류가 발생했습니다.' }
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
    let categoriesData: any[] = []
    
    if (categoryIds.length > 0) {
      const { data: parts, error: partsError } = await supabase
        .from('parts')
        .select('*')
        .in('category_id', categoryIds)

      if (partsError) throw partsError
      partsData = parts

      const { data: cats, error: catsError } = await supabase
        .from('part_categories')
        .select('*')
        .in('id', categoryIds)
      
      if (catsError) throw catsError
      categoriesData = cats
    }
    
    const mappedSlots = slots.map(s => {
      const cat = categoriesData.find(c => c.id === s.category_id)
      return { ...s, name: cat?.name || { ko: `파츠 그룹 ${s.category_id}` } }
    })

    return { success: true, baseImage, slots: mappedSlots, parts: partsData }
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
  deletedPartIds: number[],
  baseImageTitle?: any
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

    // 2.5 Update base image title if provided
    if (baseImageTitle) {
      await supabase.from('base_images').update({ title: baseImageTitle }).eq('id', baseImageId)
    }

    // 3. Upsert Slots (Concurrent)
    await Promise.all(slots.map(async (slot) => {
      if (slot.isNew) {
        // Insert into part_categories first to let the DB generate the ID
        const { data: catData, error: catError } = await supabase.from('part_categories').insert({
          name: slot.name || { ko: '새 파츠 그룹' }
        }).select().single()
        
        if (catError) throw catError
        
        const newCategoryId = catData.id
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
        
        if (slot.category_id) {
          const { error: catUpdateError } = await supabase.from('part_categories').update({
            name: slot.name
          }).eq('id', slot.category_id)
          if (catUpdateError) throw catUpdateError
        }
      }
    }))

    // 4. Upsert Parts (Concurrent)
    await Promise.all(parts.map(async (part) => {
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
    }))

    // Trigger background cache rendering
    const headersList = await headers()
    const host = headersList.get('host') || 'localhost:3000'
    const protocol = headersList.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https')
    const appUrl = `${protocol}://${host}`
    
    const cookieStore = await cookies()
    const allCookies = cookieStore.getAll().map(c => `${c.name}=${c.value}`).join('; ')
    
    after(async () => {
      await fetch(`${appUrl}/api/generate-unified`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Cookie': allCookies
        },
        body: JSON.stringify({ baseImageId })
      }).catch(e => console.error('Failed to trigger cache rendering:', e))
    })

    return { success: true }
  } catch (error: any) {
    console.error('Error saving game data:', error)
    return { error: '게임 데이터 저장 중 오류가 발생했습니다.' }
  }
}
