import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  try {
    const { participant_id } = await request.json();

    if (!participant_id) {
      return NextResponse.json(
        { error: "participant_id is required" },
        { status: 400 }
      );
    }

    // We can use the service role key for this, but since we are relying on RPC and not bypassing RLS for assignment, we can just use anon key if RPC is SECURITY DEFINER.
    // However, for backend APIs, using service role is safe to ensure no RLS issues if the RPC needs elevated privileges. Wait, the RPC is SECURITY DEFINER so anon key is fine.
    // I'll use the ANON key and URL from env.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase.rpc('assign_web_coupon', {
      p_id: participant_id
    });

    if (error) {
      console.error("Error assigning web coupon:", error);
      return NextResponse.json({ error: "Failed to assign web coupon" }, { status: 500 });
    }

    if (data && !data.success) {
       return NextResponse.json({ error: data.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, data });

  } catch (err: any) {
    return NextResponse.json(
      { error: "Internal Server Error", details: err.message },
      { status: 500 }
    );
  }
}
