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
    const { baseImageId, imageSlots } = await req.json()

    if (!baseImageId || !imageSlots || typeof imageSlots !== 'object') {
      return NextResponse.json({ error: 'Missing or invalid baseImageId or imageSlots' }, { status: 400, headers: corsHeaders })
    }

    // Initialize Supabase Admin Client with SERVICE_ROLE_KEY to bypass RLS and allow Storage uploads
    // This is SAFE here because this Serverless Function completely controls WHAT is uploaded (only strictly validated synthesized images)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // 1. Sort the keys to ensure consistent JSON matching
    const sortedSlotsJson = Object.keys(imageSlots).sort().reduce((acc, key) => {
      acc[key] = imageSlots[key].toString()
      return acc
    }, {} as Record<string, string>)

    // 2. Check if this exact combination already exists in the database
    // Supabase JSONB contains operator @> can be used, but since we are looking for exact match,
    // we can query all for this base_image_id and filter in memory, or use JSONB query.
    // For safety and performance, we'll fetch exact matches if possible.
    const { data: existingUnified, error: existingErr } = await supabaseAdmin
      .from('unified_images')
      .select('*')
      .eq('base_image_id', baseImageId)
      .contains('image_slots', sortedSlotsJson)
      
    if (existingErr) {
      console.error("DB Error checking existing unified images:", existingErr)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    // Double check exact match in memory
    const existingRow = existingUnified?.find(row => {
      const dbSlots = row.image_slots as Record<string, string>
      const dbKeys = Object.keys(dbSlots).sort()
      const reqKeys = Object.keys(sortedSlotsJson).sort()
      
      if (dbKeys.length !== reqKeys.length) return false
      return dbKeys.every(k => dbSlots[k] === sortedSlotsJson[k])
    })

    if (existingRow) {
      console.log(`[Unified Generator JIT] Cache hit for baseImageId: ${baseImageId}`)
      return NextResponse.json({ success: true, url: existingRow.unified_image_url })
    }

    console.log(`[Unified Generator JIT] Cache miss. Generating for baseImageId: ${baseImageId}`)

    // 3. Fetch necessary components to build the image
    const { data: baseImage } = await supabaseAdmin.from('base_images').select('*').eq('id', baseImageId).single()
    if (!baseImage) {
      return NextResponse.json({ error: 'Base image not found' }, { status: 404 })
    }

    const { data: slots } = await supabaseAdmin.from('image_slots').select('*').eq('base_image_id', baseImageId)
    if (!slots || slots.length === 0) {
      return NextResponse.json({ error: 'Slots not found' }, { status: 404 })
    }

    const partIds = Object.values(sortedSlotsJson).map(id => parseInt(id, 10))
    const { data: parts } = await supabaseAdmin.from('parts').select('*').in('id', partIds)
    
    if (!parts || parts.length === 0) {
      return NextResponse.json({ error: 'Parts not found' }, { status: 404 })
    }

    // 4. Prepare overlays
    const overlays = parts.map(part => {
      const slot = slots.find(s => s.category_id === part.category_id)
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

    // 5. Generate image
    const buffer = await generateUnifiedImageBuffer(baseImage.image_url, overlays)
    if (!buffer) {
      return NextResponse.json({ error: 'Failed to generate image buffer' }, { status: 500 })
    }

    // Convert to blob and upload
    const blob = new Blob([new Uint8Array(buffer)], { type: 'image/webp' })
    const fileName = `unified_cache/base${baseImageId}_${uuidv4()}.webp`
    
    const { error: uploadError } = await supabaseAdmin.storage
      .from('game_assets')
      .upload(fileName, blob, { contentType: 'image/webp' })
      
    if (uploadError) {
      console.error("Upload error", uploadError)
      return NextResponse.json({ error: 'Failed to upload generated image' }, { status: 500 })
    }

    const { data: publicUrlData } = supabaseAdmin.storage
      .from('game_assets')
      .getPublicUrl(fileName)
    
    const newImageUrl = publicUrlData.publicUrl

    // 6. Save to database
    const { error: insertError } = await supabaseAdmin.from('unified_images').insert({
      base_image_id: baseImageId,
      unified_image_url: newImageUrl,
      image_slots: sortedSlotsJson
    })

    if (insertError) {
      console.error("DB Insert error", insertError)
      // Even if DB insert fails slightly after upload, we can still return the generated image URL
    }

    return NextResponse.json({ success: true, url: newImageUrl }, { headers: corsHeaders })
  } catch (error: any) {
    console.error("Unhandled error in generator:", error)
    return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders })
  }
}
