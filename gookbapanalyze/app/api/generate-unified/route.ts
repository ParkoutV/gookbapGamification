import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateUnifiedImageBuffer } from '@/utils/imageProcessor'
import { v4 as uuidv4 } from 'uuid'

// Vercel Pro allows up to 300s. We set 60s as this should take ~2 seconds now.
export const maxDuration = 60

// Configure CORS for the external game client
const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // You can restrict this to the specific game client domain (e.g., 'https://your-game-client.com')
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // 1. Normalize Payload (Support legacy single request and new bulk array)
    let combinations: { baseImageId: number, imageSlots: Record<string, string | number> }[] = []
    
    if (body.combinations && Array.isArray(body.combinations)) {
      combinations = body.combinations
    } else if (body.baseImageId && body.imageSlots) {
      combinations = [{ baseImageId: body.baseImageId, imageSlots: body.imageSlots }]
    }

    if (combinations.length === 0) {
      return NextResponse.json({ error: 'Missing or invalid combinations payload' }, { status: 400, headers: corsHeaders })
    }

    // Initialize Supabase Admin Client with SERVICE_ROLE_KEY to bypass RLS and allow Storage uploads
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // 2. Fetch Master Data using RPC (One query instead of multiple)
    const { data: masterData, error: masterErr } = await supabaseAdmin.rpc('get_game_master_data')
    if (masterErr || !masterData) {
      console.error("Failed to fetch master data via RPC:", masterErr)
      return NextResponse.json({ error: 'Failed to fetch game master data' }, { status: 500, headers: corsHeaders })
    }

    // Process each combination to ensure deterministic slot sorting
    const processedCombs = combinations.map(comb => {
      const sortedSlotsJson = Object.keys(comb.imageSlots).sort().reduce((acc, key) => {
        acc[key] = comb.imageSlots[key].toString()
        return acc
      }, {} as Record<string, string>)
      return { baseImageId: comb.baseImageId, imageSlots: sortedSlotsJson }
    })

    // 3. Cache Bulk Check
    const baseImageIds = Array.from(new Set(processedCombs.map(c => c.baseImageId)))
    
    const { data: existingUnified, error: existingErr } = await supabaseAdmin
      .from('unified_images')
      .select('*')
      .in('base_image_id', baseImageIds)

    if (existingErr) {
      console.error("DB Error checking existing unified images:", existingErr)
      return NextResponse.json({ error: 'Database error' }, { status: 500, headers: corsHeaders })
    }

    const results: any[] = []
    const toGenerate: typeof processedCombs = []

    for (const comb of processedCombs) {
      const { baseImageId, imageSlots } = comb
      
      const existingRow = existingUnified?.find(row => {
        if (row.base_image_id !== baseImageId) return false
        const dbSlots = row.image_slots as Record<string, string>
        const dbKeys = Object.keys(dbSlots).sort()
        const reqKeys = Object.keys(imageSlots).sort()
        
        if (dbKeys.length !== reqKeys.length) return false
        return dbKeys.every(k => dbSlots[k] === imageSlots[k])
      })

      if (existingRow) {
        results.push({ baseImageId, imageSlots, url: existingRow.unified_image_url })
      } else {
        toGenerate.push(comb)
      }
    }

    // 4. Generate & Upload Cache Misses Concurrently
    const newDbRows: any[] = []

    if (toGenerate.length > 0) {
      const generatedResults = await Promise.all(toGenerate.map(async (comb) => {
        const { baseImageId, imageSlots } = comb
        
        // Find base image from master data
        const baseImage = masterData.base_images.find((b: any) => b.id === baseImageId)
        if (!baseImage) return { error: `Base image ${baseImageId} not found` }

        const slots = baseImage.slots
        const categories = masterData.categories || []
        const partIds = Object.values(imageSlots).map(id => parseInt(id, 10))
        
        const allParts: any[] = []
        categories.forEach((cat: any) => {
          if (cat.parts) allParts.push(...cat.parts)
        })
        
        const parts = allParts.filter(p => partIds.includes(p.id))

        if (parts.length === 0) return { error: 'Parts not found' }

        // Prepare overlays
        const overlays = parts.map(part => {
          const category = categories.find((c: any) => c.parts.some((p: any) => p.id === part.id))
          if (!category) return null
          
          const slot = slots.find((s: any) => s.category_id === category.id)
          if (!slot) return null
          
          return {
            imageUrl: part.image_url,
            slotX: slot.x_coordinate,
            slotY: slot.y_coordinate,
            slotScale: slot.scale,
            offsetX: part.offset_x,
            offsetY: part.offset_y,
            partScale: part.scale,
            zIndex: slot.z_index
          }
        }).filter(Boolean) as any[]
        
        overlays.sort((a: any, b: any) => a.zIndex - b.zIndex)

        // Generate image buffer
        const buffer = await generateUnifiedImageBuffer(baseImage.image_url, overlays)
        if (!buffer) return { error: 'Failed to generate image buffer' }

        const blob = new Blob([new Uint8Array(buffer)], { type: 'image/webp' })
        const fileName = `unified_cache/base${baseImageId}_${uuidv4()}.webp`
        
        const { error: uploadError } = await supabaseAdmin.storage
          .from('game_assets')
          .upload(fileName, blob, { contentType: 'image/webp' })
          
        if (uploadError) return { error: 'Failed to upload generated image' }

        const { data: publicUrlData } = supabaseAdmin.storage
          .from('game_assets')
          .getPublicUrl(fileName)
        
        const newImageUrl = publicUrlData.publicUrl

        newDbRows.push({
          base_image_id: baseImageId,
          unified_image_url: newImageUrl,
          image_slots: imageSlots
        })

        return { baseImageId, imageSlots, url: newImageUrl }
      }))

      generatedResults.forEach(res => {
        if (!res.error) results.push(res)
      })

      // 5. Bulk Insert new rows
      if (newDbRows.length > 0) {
        const { error: insertError } = await supabaseAdmin.from('unified_images').insert(newDbRows)
        if (insertError) {
          console.error("DB Bulk Insert error", insertError)
        }
      }
    }

    // Maintain backward compatibility for single request format
    if (body.baseImageId && body.imageSlots && !body.combinations) {
      if (results.length > 0) {
        return NextResponse.json({ success: true, url: results[0].url }, { headers: corsHeaders })
      } else {
        return NextResponse.json({ error: 'Failed to process combination' }, { status: 500, headers: corsHeaders })
      }
    }

    return NextResponse.json({ success: true, results }, { headers: corsHeaders })
  } catch (error: any) {
    console.error("Unhandled error in generator:", error)
    return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders })
  }
}
