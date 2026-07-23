import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'

export async function POST(req: NextRequest) {
  try {
    const { paths = [], skip = 0 } = await req.json()
    const cookieHeader = req.headers.get('cookie') || ''

    if (!Array.isArray(paths) || paths.length === 0) {
      return NextResponse.json({ success: true, message: 'No paths to delete' })
    }

    // Fire and forget
    processCleanup(paths, skip, cookieHeader).catch(err => console.error("Cleanup task error:", err))

    return NextResponse.json({ success: true, message: `Cleanup processing started for skip: ${skip}` })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

async function processCleanup(paths: string[], skip: number, cookieHeader: string) {
  console.log(`[Storage Cleanup] Starting chunk skip: ${skip}, total paths: ${paths.length}`)
  const supabase = createAdminClient()

  const BATCH_SIZE = 100
  const batch = paths.slice(skip, skip + BATCH_SIZE)

  if (batch.length > 0) {
    const { data, error } = await supabase.storage.from('game_assets').remove(batch)
    if (error) {
      console.error(`[Storage Cleanup] Error removing batch:`, error)
    } else {
      console.log(`[Storage Cleanup] Successfully removed ${batch.length} files.`)
    }
  }

  // Trigger next batch if available
  if (skip + BATCH_SIZE < paths.length) {
    const appUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    console.log(`[Storage Cleanup] Triggering next batch (skip: ${skip + BATCH_SIZE})`)
    fetch(`${appUrl}/api/cleanup-storage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieHeader
      },
      body: JSON.stringify({ paths, skip: skip + BATCH_SIZE })
    }).catch(e => console.error('Failed to trigger next cleanup batch:', e))
  } else {
    console.log(`[Storage Cleanup] All cleanup batches finished.`)
  }
}
