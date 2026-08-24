import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import ExcelJS from 'exceljs';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const fileName = searchParams.get('file');
    if (!fileName) return new NextResponse('Missing file parameter', { status: 400 });

    const supabase = await createClient();
    const { data: userData, error: authError } = await supabase.auth.getUser();
    if (authError || !userData?.user) return new NextResponse('Unauthorized', { status: 401 });

    const { data: accountData } = await supabase
      .from('accounts')
      .select('permission')
      .eq('user_id', userData.user.id)
      .single();

    if (!accountData || accountData.permission !== 0) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    const { createAdminClient } = await import('@/utils/supabase/admin');
    const adminSupabase = createAdminClient();

    // Fetch JSON Snapshot
    const { data: snapshotData, error: snapError } = await adminSupabase.storage
      .from('admin_assets')
      .download(`archives/${fileName}`);

    if (snapError) throw snapError;

    const snapshotText = await snapshotData.text();
    const snapshot = JSON.parse(snapshotText);

    // Fetch Template
    const workbook = new ExcelJS.Workbook();
    let templateLoaded = false;
    
    const { data: fileData, error: downloadError } = await adminSupabase.storage
      .from('admin_assets')
      .download('templates/kpi_template.xlsx');

    if (!downloadError && fileData) {
      const buffer = await fileData.arrayBuffer();
      await workbook.xlsx.load(buffer);
      templateLoaded = true;
    }

    // Setup Sheets
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

    if (templateLoaded) {
      if (kpiSheet.rowCount > 1) kpiSheet.spliceRows(2, kpiSheet.rowCount - 1);
      if (surveySheet.rowCount > 1) surveySheet.spliceRows(2, surveySheet.rowCount - 1);
      if (couponSheet && couponSheet.rowCount > 1) couponSheet.spliceRows(2, couponSheet.rowCount - 1);
    }

    const tracksMap = new Map<string, any>();
    snapshot.tracksData?.forEach((t: any) => tracksMap.set(t.track_id, t));

    // KPI Data mapping (Participant data is already masked inside JSON!)
    snapshot.trackLogs?.forEach((log: any) => {
      // Find game_score_logs for this participant
      const scores = snapshot.gameScoreLogs?.filter((g: any) => g.participant_id === log.participant_id) || [];
      const bestScore = scores.length > 0 ? Math.max(...scores.map((s: any) => s.gookbap_score || 0)) : 0;
      
      const pData = snapshot.participants?.find((p: any) => p.participant_id === log.participant_id);
      const isFirstVisit = pData ? (new Date(log.access_time).getTime() - new Date(pData.created_at).getTime() < 1000 * 60) : false;

      let branchName = '온라인';
      let isShared = 'X';
      const trackInfo = tracksMap.get(log.track_id);
      
      if (trackInfo) {
        try {
          if (trackInfo.branches?.branch_name) {
            const parsed = typeof trackInfo.branches.branch_name === 'string' ? JSON.parse(trackInfo.branches.branch_name) : trackInfo.branches.branch_name;
            branchName = parsed.ko || parsed.en || '온라인';
          }
        } catch (e) {
          branchName = String(trackInfo.branches?.branch_name || '온라인');
        }
        isShared = trackInfo.is_shared ? 'O' : 'X';
      }

      kpiSheet!.addRow([
        log.participant_id, // Already masked!
        branchName,
        isShared,
        new Date(log.access_time).toLocaleString('ko-KR'),
        log.game_start_count || 0,
        bestScore,
        log.share_clicked ? 'O' : 'X',
        isFirstVisit ? 'O' : 'X'
      ]);
    });

    // Survey Data Mapping
    snapshot.surveyResponses?.forEach((survey: any) => {
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
        survey.participant_id, // Masked
        new Date(survey.created_at).toLocaleString('ko-KR'),
        questionKo,
        survey.survey_questions?.survey_phase === 1 ? '필수' : (survey.survey_questions?.survey_phase === 2 ? '선택' : '기타'),
        answerText
      ]);
    });

    // Coupon Data Mapping
    snapshot.issuedCoupons?.forEach((coupon: any) => {
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
        coupon.participant_id, // Masked
        couponKo,
        new Date(coupon.issued_at).toLocaleString('ko-KR'),
        coupon.is_used ? 'O' : 'X',
        coupon.used_at ? new Date(coupon.used_at).toLocaleString('ko-KR') : '-'
      ]);
    });

    const buffer = await workbook.xlsx.writeBuffer();
    
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="archive_export_${fileName.replace('.json', '')}.xlsx"`,
      },
    });

  } catch (error: any) {
    console.error('Archive Excel Error:', error);
    return new NextResponse(error.message || 'Internal Server Error', { status: 500 });
  }
}
