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
        return NextResponse.json({ error: '쿨타임이 아직 지나지 않았습니다.' }, { status: 403 })
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
        .select('id')
        .eq('participant_id', participant_id)
        .in('question_id', p1Ids)
        .limit(1)

      if (p1Error || !p1Responses || p1Responses.length === 0) {
        return NextResponse.json({ error: '설문조사를 먼저 완료해주세요.' }, { status: 403 })
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
      .single()

    if (caseError || !gatchaCase) {
      return NextResponse.json({ error: '해당 점수에 맞는 가챠 확률 그룹을 찾을 수 없습니다.' }, { status: 500 })
    }

    const gatchaCaseId = gatchaCase.gatcha_case_id

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

    // If total probabilities < 1, there's a chance no coupon is selected (꽝)
    if (!selectedCoupon) {
      return NextResponse.json({ success: true, message: '꽝', coupon_type: null })
    }

    // 8. Insert into issued_coupons
    const { error: insertError } = await supabase
      .from('issued_coupons')
      .insert([{
        participant_id: participant_id,
        coupon_effect_id: selectedCoupon.coupon_effect_id,
        is_used: false
      }])

    if (insertError) {
      return NextResponse.json({ error: '쿠폰 발급에 실패했습니다.' }, { status: 500 })
    }

    // 9. Update participant roulette_joined
    await supabase
      .from('participants')
      .update({ roulette_joined: new Date().toISOString() })
      .eq('participant_id', participant_id)

    // 10. Return result
    return NextResponse.json({
      success: true,
      coupon_type: selectedCoupon.coupon_type,
      score_used: bestScore
    })

  } catch (err: any) {
    return NextResponse.json({ error: 'Internal Server Error', details: err.message }, { status: 500 })
  }
}
