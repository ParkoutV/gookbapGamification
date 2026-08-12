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

    // 3. Check Gatcha Limit (N days / N hours)
    let limitStartTime = new Date()
    if (settings.limit_type === 'days') {
      // KST 00:00:00 계산
      const kstTimeStr = new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" })
      const kstDate = new Date(kstTimeStr)
      kstDate.setDate(kstDate.getDate() - (settings.limit_n - 1))
      
      const year = kstDate.getFullYear()
      const month = String(kstDate.getMonth() + 1).padStart(2, '0')
      const day = String(kstDate.getDate()).padStart(2, '0')
      limitStartTime = new Date(`${year}-${month}-${day}T00:00:00.000+09:00`)
    } else {
      limitStartTime = new Date(Date.now() - (settings.limit_n * 60 * 60 * 1000))
    }

    const { count: logCount, error: logError } = await supabase
      .from('gatcha_logs')
      .select('log_id', { count: 'exact', head: true })
      .eq('participant_id', participant_id)
      .gte('joined_at', limitStartTime.toISOString())

    if (logError) {
      return NextResponse.json({ error: 'Failed to check gatcha limits' }, { status: 500 })
    }

    if (logCount !== null && logCount >= settings.limit_m) {
      return NextResponse.json({ 
        error: `제한 횟수 초과 (${settings.limit_type === 'days' ? `${settings.limit_n}일` : `${settings.limit_n}시간`} 이내 최대 ${settings.limit_m}번 참여 가능)`, 
        code: 'LIMIT_EXCEEDED' 
      }, { status: 400 })
    }

    // 3.4 Check Overall Play Count vs Gatcha Count
    const [totalGatcha, totalGame] = await Promise.all([
      supabase.from('gatcha_logs').select('log_id', { count: 'exact', head: true }).eq('participant_id', participant_id),
      supabase.from('game_score_logs').select('log_id', { count: 'exact', head: true }).eq('participant_id', participant_id)
    ]);

    if (totalGatcha.error || totalGame.error) {
      return NextResponse.json({ error: 'Failed to check play limits' }, { status: 500 })
    }

    const gatchaCountTotal = totalGatcha.count || 0;
    const gameCountTotal = totalGame.count || 0;

    if (gatchaCountTotal >= gameCountTotal) {
      return NextResponse.json({ 
        error: `게임을 플레이한 횟수만큼만 가챠를 돌릴 수 있습니다. (플레이 ${gameCountTotal}회 / 가챠 참여 ${gatchaCountTotal}회)`, 
        code: 'PLAY_LIMIT_EXCEEDED' 
      }, { status: 400 })
    }

    // 3.5 Check Survey Phase 1 Completion (All required questions)
    const { data: p1RequiredQuestions } = await supabase
      .from('survey_questions')
      .select('question_id')
      .eq('survey_phase', 1)
      .eq('is_required', true)
      .eq('is_active', true)

    if (p1RequiredQuestions && p1RequiredQuestions.length > 0) {
      const p1RequiredIds = p1RequiredQuestions.map(q => q.question_id)
      
      const { data: p1Responses, error: p1Error } = await supabase
        .from('survey_responses')
        .select('question_id')
        .eq('participant_id', participant_id)
        .in('question_id', p1RequiredIds)

      if (p1Error || !p1Responses || p1Responses.length < p1RequiredIds.length) {
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

    // 6.5 Fetch issued counts for offline coupons
    const offlineCoupons = coupons.filter(c => !c.is_online_coupon)
    const offlineCouponIds = offlineCoupons.map(c => c.coupon_effect_id)
    
    const { data: issuedCountsData } = await supabase
      .from('issued_coupons')
      .select('coupon_effect_id, issued_at')
      .in('coupon_effect_id', offlineCouponIds)
      
    const issuedCounts: Record<string, number> = {}
    const dailyIssuedCounts: Record<string, number> = {}
    
    if (issuedCountsData) {
      // Calculate today's KST 00:00:00
      const kstTimeStr = new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" })
      const kstDate = new Date(kstTimeStr)
      const year = kstDate.getFullYear()
      const month = String(kstDate.getMonth() + 1).padStart(2, '0')
      const day = String(kstDate.getDate()).padStart(2, '0')
      const todayKstStartMs = new Date(`${year}-${month}-${day}T00:00:00.000+09:00`).getTime()

      issuedCountsData.forEach(item => {
        const effectId = item.coupon_effect_id
        issuedCounts[effectId] = (issuedCounts[effectId] || 0) + 1
        
        if (item.issued_at) {
          const issuedTime = new Date(item.issued_at).getTime()
          if (issuedTime >= todayKstStartMs) {
            dailyIssuedCounts[effectId] = (dailyIssuedCounts[effectId] || 0) + 1
          }
        }
      })
    }

    // Determine which coupons are valid (not exhausted)
    let remainingSum = 0
    let originalSum = 0
    
    const couponCandidates = coupons.map(coupon => {
      const originalProb = coupon.probability?.[gatchaCaseId] || 0
      originalSum += Number(originalProb)
      
      let isExhausted = false
      if (!coupon.is_online_coupon) {
        const count = issuedCounts[coupon.coupon_effect_id] || 0
        const dailyCount = dailyIssuedCounts[coupon.coupon_effect_id] || 0

        // Check global max_issuance
        if (coupon.max_issuance !== null && coupon.max_issuance !== undefined) {
          if (count >= coupon.max_issuance) {
            isExhausted = true
          }
        }
        
        // Check daily_max_issuance
        if (coupon.daily_max_issuance !== null && coupon.daily_max_issuance !== undefined) {
          if (dailyCount >= coupon.daily_max_issuance) {
            isExhausted = true
          }
        }
      }
      
      const effectiveProb = isExhausted ? 0 : Number(originalProb)
      remainingSum += effectiveProb
      
      return { ...coupon, _effectiveProb: effectiveProb }
    })

    // 7. Weighted Random Draw
    let drawMax = 1.0
    if (settings.exhaustion_behavior === 'normalize_probability') {
      // The new ceiling is the sum of remaining probabilities + the original blank probability.
      // S_remaining = remainingSum + (1.0 - originalSum)
      const originalBlankProb = Math.max(0, 1.0 - originalSum)
      drawMax = remainingSum + originalBlankProb
    }
    
    let randomVal = Math.random() * drawMax
    let cumulative = 0
    let selectedCoupon = null

    for (const coupon of couponCandidates) {
      cumulative += coupon._effectiveProb
      if (coupon._effectiveProb > 0 && randomVal <= cumulative) {
        selectedCoupon = coupon
        break
      }
    }

    // 8. Update participant roulette_joined & insert gatcha_log (꽝이어도 카운트 차감)
    await supabase
      .from('participants')
      .update({ roulette_joined: new Date().toISOString() })
      .eq('participant_id', participant_id)
      
    await supabase
      .from('gatcha_logs')
      .insert([{ participant_id: participant_id }])

    // If total probabilities < 1, there's a chance no coupon is selected (꽝)
    if (!selectedCoupon) {
      return NextResponse.json({ success: true, message: '꽝', coupon_type: null, score_used: bestScore })
    }

    // 8. Insert into issued_coupons
    let expired_at = null
    let valid_from = null
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
      // Calculate valid_from
      const kstTimeStr = new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" })
      const kstDate = new Date(kstTimeStr)
      
      if (selectedCoupon.valid_start_type === 'tomorrow') {
        kstDate.setDate(kstDate.getDate() + 1)
      }
      
      const vYear = kstDate.getFullYear()
      const vMonth = String(kstDate.getMonth() + 1).padStart(2, '0')
      const vDay = String(kstDate.getDate()).padStart(2, '0')
      valid_from = `${vYear}-${vMonth}-${vDay}T00:00:00.000+09:00`
      
      // Calculate expired_at
      if (selectedCoupon.expire_type === 'date' && selectedCoupon.expire_date) {
        // expire_date is already a date/timestamp, we just want its 23:59:59
        const expireDateKst = new Date(new Date(selectedCoupon.expire_date).toLocaleString("en-US", { timeZone: "Asia/Seoul" }))
        const eYear = expireDateKst.getFullYear()
        const eMonth = String(expireDateKst.getMonth() + 1).padStart(2, '0')
        const eDay = String(expireDateKst.getDate()).padStart(2, '0')
        expired_at = `${eYear}-${eMonth}-${eDay}T23:59:59.999+09:00`
      } else if (selectedCoupon.expire_type === 'days' && selectedCoupon.expire_days !== null && selectedCoupon.expire_days !== undefined) {
        const expDate = new Date(valid_from)
        expDate.setDate(expDate.getDate() + selectedCoupon.expire_days)
        const eYear = expDate.getFullYear()
        const eMonth = String(expDate.getMonth() + 1).padStart(2, '0')
        const eDay = String(expDate.getDate()).padStart(2, '0')
        expired_at = `${eYear}-${eMonth}-${eDay}T23:59:59.999+09:00`
      }
    }

    const insertPayload: any = {
      participant_id: participant_id,
      coupon_effect_id: selectedCoupon.coupon_effect_id,
      is_used: is_used,
      expired_at: expired_at
    }

    if (valid_from) {
      insertPayload.valid_from = valid_from
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
      web_coupon_code: web_coupon_code,
      valid_from: valid_from,
      expired_at: expired_at
    })

  } catch (err: any) {
    return NextResponse.json({ error: 'Internal Server Error', details: err.message }, { status: 500 })
  }
}
