import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { generateUnifiedImageBuffer } from '@/utils/imageProcessor'
import { v4 as uuidv4 } from 'uuid'

// Background execution via unstable_after (Next.js 15+) or standard Promises if older
// Vercel might kill non-awaited promises, but since Next 15 it's supported via unstable_after if configured.
// For now, we will fire and forget the processing.
export async function POST(req: NextRequest) {
  try {
    const { baseImageId } = await req.json()

    if (!baseImageId) {
      return NextResponse.json({ error: 'Missing baseImageId' }, { status: 400 })
    }

    // Start background processing without waiting for it to finish
    // Fire and forget
    processCombinations(baseImageId).catch(err => console.error("Background task error:", err))

    return NextResponse.json({ success: true, message: 'Background processing started' })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

async function processCombinations(baseImageId: number) {
  console.log(`[Unified Generator] Starting for baseImageId: ${baseImageId}`)
  const supabase = await createClient()

  // 1. Fetch base image
  const { data: baseImage, error: baseErr } = await supabase
    .from('base_images')
    .select('*')
    .eq('id', baseImageId)
    .single()
  
  if (baseErr || !baseImage) {
    console.error("Failed to fetch base image", baseErr)
    return
  }

  // 2. Fetch slots
  const { data: slots, error: slotsErr } = await supabase
    .from('image_slots')
    .select('*')
    .eq('base_image_id', baseImageId)

  if (slotsErr || !slots) {
    console.error("Failed to fetch slots", slotsErr)
    return
  }

  // 3. Fetch parts for these slots
  const categoryIds = slots.map(s => s.category_id)
  let parts: any[] = []
  if (categoryIds.length > 0) {
    const { data: p, error: partsErr } = await supabase
      .from('parts')
      .select('*')
      .in('category_id', categoryIds)
    if (partsErr) {
      console.error("Failed to fetch parts", partsErr)
      return
    }
    parts = p || []
  }

  // If no slots, nothing to composite. But maybe they just want the base image?
  // Usually this is for spot difference parts.
  if (slots.length === 0 || parts.length === 0) {
    console.log("No slots or parts to process.")
    return
  }

  // 4. Generate all permutations
  // Group parts by category_id
  const partsByCategory: Record<number, any[]> = {}
  for (const catId of categoryIds) {
    partsByCategory[catId] = parts.filter(p => p.category_id === catId)
  }

  // Helper to get cartesian product of arrays
  const cartesian = (...a: any[][]) => a.reduce((a, b) => a.flatMap(d => b.map(e => [d, e].flat())));

  const categories = Object.keys(partsByCategory).map(Number)
  const partArrays = categories.map(cat => partsByCategory[cat])
  
  const allCombinations = partArrays.length > 0 ? cartesian(...partArrays) : []

  // Ensure it's an array of arrays
  const combinations = Array.isArray(allCombinations[0]) ? allCombinations : allCombinations.map(c => [c])

  console.log(`[Unified Generator] Found ${combinations.length} combinations to process.`)

  // 5. Fetch existing unified_images to prevent duplicate IDs and delete old files
  const { data: existingUnified, error: existingErr } = await supabase
    .from('unified_images')
    .select('*')
    .eq('base_image_id', baseImageId)
    
  const existingMap = new Map<string, any>()
  if (existingUnified) {
    existingUnified.forEach(row => {
      // Sort keys to ensure consistent JSON stringification
      const sortedObj = Object.keys(row.image_slots).sort().reduce((acc, key) => {
        acc[key] = row.image_slots[key]
        return acc
      }, {} as Record<string, string>)
      existingMap.set(JSON.stringify(sortedObj), row)
    })
  }

  const processedCombos = new Set<string>()

  for (let i = 0; i < combinations.length; i++) {
    const combo = combinations[i] as any[]
    
    const imageSlotsJson: Record<string, string> = {}
    combo.forEach(part => {
      imageSlotsJson[part.category_id.toString()] = part.id.toString()
    })
    
    const sortedComboJson = Object.keys(imageSlotsJson).sort().reduce((acc, key) => {
      acc[key] = imageSlotsJson[key]
      return acc
    }, {} as Record<string, string>)
    
    const comboKey = JSON.stringify(sortedComboJson)
    processedCombos.add(comboKey)
    
    // Prepare parts overlay data
    const overlays = combo.map(part => {
      const slot = slots.find(s => s.category_id === part.category_id)
      return {
        imageUrl: part.image_url,
        slotX: slot.x_coordinate,
        slotY: slot.y_coordinate,
        slotScale: slot.scale,
        offsetX: part.offset_x,
        offsetY: part.offset_y,
        partScale: part.scale,
      }
    })

    try {
      // Create unified image
      const buffer = await generateUnifiedImageBuffer(baseImage.image_url, overlays)
      
      // Upload to Supabase Storage (assuming 'game_assets' bucket, folder 'unified_cache')
      const fileName = `unified_cache/base${baseImageId}_${uuidv4()}.webp`
      const { error: uploadError } = await supabase.storage
        .from('game_assets')
        .upload(fileName, buffer, { contentType: 'image/webp' })
        
      if (uploadError) {
        console.error("Upload error for combo", i, uploadError)
        continue
      }

      const { data: publicUrlData } = supabase.storage
        .from('game_assets')
        .getPublicUrl(fileName)

      // Insert or Update unified_images table
      const existingRow = existingMap.get(comboKey)
      
      if (existingRow) {
        // Update existing row
        const { error: updateError } = await supabase.from('unified_images')
          .update({ unified_image_url: publicUrlData.publicUrl })
          .eq('id', existingRow.id)
          
        if (updateError) {
          console.error("Update error for unified_images", updateError)
        }
        
        // Delete old file from Storage
        if (existingRow.unified_image_url) {
          const oldUrl = existingRow.unified_image_url
          const match = oldUrl.match(/game_assets\/(.+)$/)
          if (match && match[1]) {
            await supabase.storage.from('game_assets').remove([match[1]])
          }
        }
      } else {
        // Insert new row
        const { error: insertError } = await supabase.from('unified_images').insert({
          base_image_id: baseImageId,
          image_slots: imageSlotsJson,
          unified_image_url: publicUrlData.publicUrl
        })

        if (insertError) {
          console.error("Insert error for unified_images", insertError)
        }
      }
    } catch (e) {
      console.error(`Error processing combination ${i}:`, e)
    }
  }

  // 6. Delete orphaned unified_images (those not in the current permutations, e.g. a part was deleted)
  if (existingUnified) {
    for (const row of existingUnified) {
      const sortedObj = Object.keys(row.image_slots).sort().reduce((acc, key) => {
        acc[key] = row.image_slots[key]
        return acc
      }, {} as Record<string, string>)
      
      if (!processedCombos.has(JSON.stringify(sortedObj))) {
        // Delete from DB
        await supabase.from('unified_images').delete().eq('id', row.id)
        
        // Delete from Storage
        const oldUrl = row.unified_image_url
        const match = oldUrl.match(/game_assets\/(.+)$/)
        if (match && match[1]) {
          await supabase.storage.from('game_assets').remove([match[1]])
        }
      }
    }
  }

  console.log(`[Unified Generator] Finished processing for baseImageId: ${baseImageId}`)
}
