import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import ExcelJS from 'exceljs';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // 1. Auth Check (Admin Only)
    const { data: userData, error: authError } = await supabase.auth.getUser();
    if (authError || !userData?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: accountData } = await supabase
      .from('accounts')
      .select('permission, assigned_branch_id')
      .eq('user_id', userData.user.id)
      .single();

    if (!accountData || accountData.permission !== 0) {
      return NextResponse.json({ error: 'Forbidden. Admin access required.' }, { status: 403 });
    }

    // 2. Parse Query Params
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // 3. Query Raw Data
    // We fetch track_logs and join with participants and game_score_logs.
    let logsQuery = supabase
      .from('track_logs')
      .select(`
        log_id,
        participant_id,
        track_id,
        access_time,
        game_start_count,
        share_clicked,
        participants!inner (
          created_at,
          game_score_logs ( gookbap_score, joined_time )
        )
      `);

    if (startDate) logsQuery = logsQuery.gte('access_time', startDate);
    if (endDate) logsQuery = logsQuery.lte('access_time', endDate);

    const { data: rawTrackLogs, error: trackError } = await logsQuery;
    if (trackError) throw trackError;

    // Survey Responses
    let surveyQuery = supabase
      .from('survey_responses')
      .select(`
        response_id,
        participant_id,
        question_id,
        answer_data,
        created_at,
        survey_questions!inner (
          question_text,
          survey_phase,
          question_type,
          options
        )
      `);

    if (startDate) surveyQuery = surveyQuery.gte('created_at', startDate);
    if (endDate) surveyQuery = surveyQuery.lte('created_at', endDate);

    const { data: rawSurveys, error: surveyError } = await surveyQuery;
    if (surveyError) throw surveyError;

    // Fetch Tracks and Branches for mapping
    const { data: tracksData, error: tracksError } = await supabase
      .from('tracks')
      .select(`
        track_id,
        is_shared,
        branches ( branch_name )
      `);
    if (tracksError) throw tracksError;

    const tracksMap = new Map<string, any>();
    tracksData?.forEach((t: any) => {
      tracksMap.set(t.track_id, t);
    });

    // 4. Fetch Coupon Data
    let couponsQuery = supabase.from('issued_coupons').select(`
      *,
      coupon_effects(coupon_type)
    `);
    if (startDate) couponsQuery = couponsQuery.gte('issued_at', startDate);
    if (endDate) couponsQuery = couponsQuery.lte('issued_at', endDate);
    const { data: rawCoupons, error: couponsError } = await couponsQuery;
    if (couponsError) throw couponsError;

    // 5. Masking participant_id
    const participantMap = new Map<string, string>();
    let pCounter = 1;

    const getMaskedId = (id: string | null) => {
      if (!id) return 'Unknown';
      if (!participantMap.has(id)) {
        participantMap.set(id, `Participant_${pCounter++}`);
      }
      return participantMap.get(id);
    };

    // 5. Load Template or Create Empty Workbook
    const workbook = new ExcelJS.Workbook();
    let templateLoaded = false;
    
    const { createClient: createSupabaseClient } = await import('@supabase/supabase-js');
    const adminSupabase = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    
    // Try to load template from Supabase Storage
    const { data: fileData, error: downloadError } = await adminSupabase.storage
      .from('admin_assets')
      .download('templates/kpi_template.xlsx');

    if (!downloadError && fileData) {
      const buffer = await fileData.arrayBuffer();
      await workbook.xlsx.load(buffer);
      templateLoaded = true;
    }

    // Prepare Worksheets
    let kpiSheet = workbook.getWorksheet('RawData_KPI');
    if (!kpiSheet) {
      kpiSheet = workbook.addWorksheet('RawData_KPI');
      kpiSheet.addRow(['참여자_ID', '점포이름', '공유유입여부', '접속시간', '게임시작횟수', '최고점수(국밥)', '공유버튼클릭', '첫방문여부']);
    }

    let surveySheet = workbook.getWorksheet('RawData_Survey');
    if (!surveySheet) {
      surveySheet = workbook.addWorksheet('RawData_Survey');
      surveySheet.addRow(['참여자_ID', '응답일시', '질문내용', '질문단계', '응답내용']);
    }

    let couponSheet = workbook.getWorksheet('RawData_Coupon');
    if (!couponSheet) {
      couponSheet = workbook.addWorksheet('RawData_Coupon');
      couponSheet.addRow(['참여자_ID', '쿠폰종류', '발급일시', '사용여부', '사용일시']);
    }

    // 6. Inject Data
    // We clear existing rows if it's a template (keeping header)
    if (templateLoaded) {
      if (kpiSheet.rowCount > 1) {
        kpiSheet.spliceRows(2, kpiSheet.rowCount - 1);
      }
      if (surveySheet.rowCount > 1) {
        surveySheet.spliceRows(2, surveySheet.rowCount - 1);
      }
      if (couponSheet && couponSheet.rowCount > 1) {
        couponSheet.spliceRows(2, couponSheet.rowCount - 1);
      }
    }

    // Insert KPI Data
    rawTrackLogs?.forEach((log: any) => {
      const maskedId = getMaskedId(log.participant_id);
      
      // Calculate best score from game_score_logs array
      const scores = log.participants?.game_score_logs || [];
      const bestScore = scores.length > 0 ? Math.max(...scores.map((s: any) => s.gookbap_score || 0)) : 0;
      
      const isFirstVisit = new Date(log.access_time).getTime() - new Date(log.participants?.created_at).getTime() < 1000 * 60; // within 1 min

      let branchName = '온라인';
      let isShared = 'X';
      const trackInfo = tracksMap.get(log.track_id);
      
      if (trackInfo) {
        try {
          if (trackInfo.branches?.branch_name) {
            const parsed = JSON.parse(trackInfo.branches.branch_name);
            branchName = parsed.ko || parsed.en || '온라인';
          }
        } catch (e) {
          branchName = String(trackInfo.branches?.branch_name || '온라인');
        }
        isShared = trackInfo.is_shared ? 'O' : 'X';
      }

      kpiSheet!.addRow([
        maskedId,
        branchName,
        isShared,
        new Date(log.access_time).toLocaleString('ko-KR'),
        log.game_start_count || 0,
        bestScore,
        log.share_clicked ? 'O' : 'X',
        isFirstVisit ? 'O' : 'X'
      ]);
    });

    // Insert Survey Data
    rawSurveys?.forEach((survey: any) => {
      const maskedId = getMaskedId(survey.participant_id);
      
      let questionKo = 'Unknown';
      try {
        if (survey.survey_questions?.question_text) {
          const parsed = typeof survey.survey_questions.question_text === 'string' 
             ? JSON.parse(survey.survey_questions.question_text) 
             : survey.survey_questions.question_text;
          questionKo = parsed.ko || parsed.en || 'Unknown';
        }
      } catch (e) {
        questionKo = String(survey.survey_questions?.question_text || 'Unknown');
      }

      let answerText = '';
      const qType = survey.survey_questions?.question_type;
      
      if (qType === 2) {
        // 주관식
        try {
          if (typeof survey.answer_data === 'string') {
            const parsed = JSON.parse(survey.answer_data);
            answerText = parsed.answer_text || survey.answer_data;
          } else if (typeof survey.answer_data === 'object' && survey.answer_data !== null) {
            answerText = survey.answer_data.answer_text || JSON.stringify(survey.answer_data);
          } else {
            answerText = String(survey.answer_data);
          }
        } catch(e) {
          answerText = String(survey.answer_data);
        }
      } else {
        // 객관식 / 다중선택
        try {
          const optionsMap = new Map();
          if (survey.survey_questions?.options && Array.isArray(survey.survey_questions.options)) {
            survey.survey_questions.options.forEach((opt: any) => {
              let optKo = 'Unknown';
              try {
                const t = typeof opt.text === 'string' ? JSON.parse(opt.text) : opt.text;
                optKo = t?.ko || t?.en || String(opt.text || opt.id);
              } catch (e) { optKo = String(opt.text || opt.id); }
              optionsMap.set(opt.id, optKo);
            });
          }

          const answers = typeof survey.answer_data === 'string' ? JSON.parse(survey.answer_data) : survey.answer_data;
          if (Array.isArray(answers)) {
            answerText = answers.map((a: any) => {
              const id = typeof a === 'object' ? (a.option_id || a.id) : a;
              return optionsMap.get(id) || (typeof a === 'object' ? a.option_text : null) || id;
            }).join(', ');
          } else if (answers && typeof answers === 'object') {
            const id = answers.option_id || answers.id;
            answerText = optionsMap.get(id) || answers.option_text || id || JSON.stringify(answers);
          } else {
            const id = answers;
            answerText = optionsMap.get(id) || String(answers);
          }
        } catch (e) {
          answerText = String(survey.answer_data);
        }
      }

      surveySheet!.addRow([
        maskedId,
        new Date(survey.created_at).toLocaleString('ko-KR'),
        questionKo,
        survey.survey_questions?.survey_phase === 1 ? '필수' : (survey.survey_questions?.survey_phase === 2 ? '선택' : '기타'),
        answerText
      ]);
    });

    rawCoupons?.forEach((coupon: any) => {
      const maskedId = getMaskedId(coupon.participant_id);
      let couponKo = 'Unknown';
      try {
        if (coupon.coupon_effects?.coupon_type) {
          const parsed = typeof coupon.coupon_effects.coupon_type === 'string'
             ? JSON.parse(coupon.coupon_effects.coupon_type)
             : coupon.coupon_effects.coupon_type;
          couponKo = parsed.ko || parsed.en || 'Unknown';
        }
      } catch (e) {
        couponKo = String(coupon.coupon_effects?.coupon_type || 'Unknown');
      }

      couponSheet!.addRow([
        maskedId,
        couponKo,
        new Date(coupon.issued_at).toLocaleString('ko-KR'),
        coupon.is_used ? 'O' : 'X',
        coupon.used_at ? new Date(coupon.used_at).toLocaleString('ko-KR') : '-'
      ]);
    });

    // 7. Send File
    const buffer = await workbook.xlsx.writeBuffer();
    
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="game_data_export_${new Date().getTime()}.xlsx"`,
      },
    });

  } catch (error: any) {
    console.error('Excel export error:', error);
    return NextResponse.json({ error: error.message || 'Export failed' }, { status: 500 });
  }
}
