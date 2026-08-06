import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'

export async function POST(req: NextRequest) {
  try {
    const { participant_id } = await req.json()

    if (!participant_id) {
      return NextResponse.json({ error: 'participant_id is required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // 1. Fetch settings
    const { data: settings, error: settingsError } = await supabase
      .from('gatcha_settings')
      .select('*')
      .eq('id', 1)
      .single()

    if (settingsError || !settings) {
      return NextResponse.json({ error: 'Failed to load gatcha settings' }, { status: 500 })
    }

    // 2. Fetch participant
    const { data: participant, error: partError } = await supabase
      .from('participants')
      .select('roulette_joined')
      .eq('participant_id', participant_id)
      .single()

    if (partError || !participant) {
      return NextResponse.json({ error: 'Participant not found' }, { status: 404 })
    }

    // 3. Check Cooldown
    if (participant.roulette_joined) {
      const lastJoined = new Date(participant.roulette_joined).getTime()
      const now = new Date().getTime()
      
      const cooldownMs = (settings.cooldown_hours * 60 * 60 * 1000) + (settings.cooldown_minutes * 60 * 1000)
      
      if (now - lastJoined < cooldownMs) {
        return NextResponse.json({ error: '쿨타임이 아직 지나지 않았습니다.', code: 'COOLDOWN' }, { status: 403 })
      }
    }

    // 3.5 Check Survey Phase 1 Completion
    const { data: p1Questions } = await supabase
      .from('survey_questions')
      .select('question_id')
      .eq('survey_phase', 1)

    if (p1Questions && p1Questions.length > 0) {
      const p1Ids = p1Questions.map(q => q.question_id)
      const { data: p1Responses, error: p1Error } = await supabase
        .from('survey_responses')
        .select('response_id')
        .eq('participant_id', participant_id)
        .in('question_id', p1Ids)
        .limit(1)

      if (p1Error || !p1Responses || p1Responses.length === 0) {
        return NextResponse.json({ error: '설문조사를 먼저 완료해주세요.', code: 'SURVEY_REQUIRED' }, { status: 403 })
      }
    }

    // 4. Fetch Best Score within Aggregation Time
    const aggregationMs = (settings.aggregation_hours * 60 * 60 * 1000) + (settings.aggregation_minutes * 60 * 1000)
    const timeLimit = new Date(Date.now() - aggregationMs).toISOString()

    // We strictly use the aggregation time cutoff as requested
    const cutoffTime = timeLimit

    const { data: scores, error: scoreError } = await supabase
      .from('game_score_logs')
      .select('gookbap_score')
      .eq('participant_id', participant_id)
      .gte('joined_time', cutoffTime)
      .order('gookbap_score', { ascending: false })
      .limit(1)

    const bestScore = (scores && scores.length > 0) ? scores[0].gookbap_score : 0

    // 5. Match Score to Gatcha Case
    const { data: gatchaCase, error: caseError } = await supabase
      .from('gatcha_cases')
      .select('gatcha_case_id')
      .lte('min_score', bestScore)
      .gte('max_score', bestScore)
      .limit(1)

    if (caseError || !gatchaCase || gatchaCase.length === 0) {
      return NextResponse.json({ error: '해당 점수에 맞는 가챠 확률 그룹을 찾을 수 없습니다.' }, { status: 500 })
    }

    const gatchaCaseId = gatchaCase[0].gatcha_case_id

    // 6. Fetch Coupon Effects
    const { data: coupons, error: couponError } = await supabase
      .from('coupon_effects')
      .select('*')

    if (couponError || !coupons || coupons.length === 0) {
      return NextResponse.json({ error: '등록된 쿠폰이 없습니다.' }, { status: 500 })
    }

    // 7. Weighted Random Draw
    let randomVal = Math.random()
    let cumulative = 0
    let selectedCoupon = null

    for (const coupon of coupons) {
      // Probability is stored as JSON: { "case_id": 0.15 }
      const prob = coupon.probability?.[gatchaCaseId] || 0
      cumulative += Number(prob)
      
      if (randomVal <= cumulative) {
        selectedCoupon = coupon
        break
      }
    }

    // 8. Update participant roulette_joined (꽝이어도 쿨타임이 돌게끔 먼저 처리)
    await supabase
      .from('participants')
      .update({ roulette_joined: new Date().toISOString() })
      .eq('participant_id', participant_id)

    // If total probabilities < 1, there's a chance no coupon is selected (꽝)
    if (!selectedCoupon) {
      return NextResponse.json({ success: true, message: '꽝', coupon_type: null, score_used: bestScore })
    }

    // 8. Insert into issued_coupons
    let expired_at = null
    let is_used = false
    let web_coupon_code: string | undefined = undefined

    // Web Coupon Logic
    if (selectedCoupon.is_online_coupon) {
      const { data: webCoupon, error: webError } = await supabase
        .from('web_coupons')
        .select('id, coupon_code')
        .is('participant_id', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (webError || !webCoupon) {
        return NextResponse.json({ error: '잔여 웹 쿠폰이 부족합니다. 관리자에게 문의하세요.' }, { status: 500 })
      }

      const { error: updateError } = await supabase
        .from('web_coupons')
        .update({
          participant_id: participant_id,
          assigned_at: new Date().toISOString()
        })
        .eq('id', webCoupon.id)

      if (updateError) {
        return NextResponse.json({ error: '웹 쿠폰 배정에 실패했습니다.' }, { status: 500 })
      }

      is_used = true
      web_coupon_code = webCoupon.coupon_code
    } else {
      if (selectedCoupon.expire_days !== null && selectedCoupon.expire_days !== undefined) {
        // Get current date in KST
        const kstTimeStr = new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" })
        const kstDate = new Date(kstTimeStr)
        
        // Add days
        kstDate.setDate(kstDate.getDate() + selectedCoupon.expire_days)
        
        // Set to 23:59:59.999
        const year = kstDate.getFullYear()
        const month = String(kstDate.getMonth() + 1).padStart(2, '0')
        const day = String(kstDate.getDate()).padStart(2, '0')
        
        // Timestamptz will correctly parse the +09:00 timezone
        expired_at = `${year}-${month}-${day}T23:59:59.999+09:00`
      }
    }

    const insertPayload: any = {
      participant_id: participant_id,
      coupon_effect_id: selectedCoupon.coupon_effect_id,
      is_used: is_used,
      expired_at: expired_at
    }

    if (is_used) {
      insertPayload.used_at = new Date().toISOString()
    }

    const { data: insertedCoupon, error: insertError } = await supabase
      .from('issued_coupons')
      .insert([insertPayload])
      .select('coupon_id')
      .single()

    if (insertError || !insertedCoupon) {
      return NextResponse.json({ error: '쿠폰 발급에 실패했습니다.' }, { status: 500 })
    }



    // 10. Return result
    return NextResponse.json({
      success: true,
      coupon_type: selectedCoupon.coupon_type,
      score_used: bestScore,
      coupon_id: insertedCoupon.coupon_id,
      web_coupon_code: web_coupon_code
    })

  } catch (err: any) {
    return NextResponse.json({ error: 'Internal Server Error', details: err.message }, { status: 500 })
  }
}
