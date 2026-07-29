import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export async function POST(req: NextRequest) {
  try {
    const { participant_id } = await req.json()

    if (!participant_id) {
      return NextResponse.json({ error: 'Missing participant_id' }, { status: 400, headers: corsHeaders })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    const { data, error } = await supabaseAdmin.rpc('assign_random_nickname', {
      p_id: participant_id
    })

    if (error) {
      console.error("DB Error assigning nickname:", error)
      return NextResponse.json({ error: 'Database error' }, { status: 500, headers: corsHeaders })
    }

    if (!data.success) {
      return NextResponse.json({ error: data.error }, { status: 400, headers: corsHeaders })
    }

    return NextResponse.json(data, { headers: corsHeaders })
  } catch (error: any) {
    console.error("Unhandled error in nickname assign:", error)
    return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders })
  }
}
