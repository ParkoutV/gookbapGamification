import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { authorizeDashboard } from '@/utils/supabase/authorization';

export async function POST(req: NextRequest) {
  try {
    const access = await authorizeDashboard([0, 1]);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const { text, source, target } = await req.json();

    if (!text || !target) {
      return NextResponse.json(
        { error: '텍스트와 타겟 언어는 필수입니다.' },
        { status: 400 }
      );
    }

    const scriptUrl = process.env.GOOGLE_SCRIPT_URL;

    if (!scriptUrl) {
      return NextResponse.json(
        { error: 'GOOGLE_SCRIPT_URL 환경변수가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    // 1. Supabase 사용량 카운트 증가 (PST 기준 1일 5,000회 제한 추적용)
    // Keep the existing server-owned usage counter behind the account check.
    const supabaseAdmin = createAdminClient();
    const { data: currentUsage, error: rpcError } = await supabaseAdmin.rpc('increment_translation_usage');
    if (rpcError) {
      console.error('[Translation] Supabase RPC Error:', rpcError);
      // DB 에러가 발생해도 번역은 진행하도록 막지 않음
    }

    // 2. GAS Web App으로 POST 요청 전송
    const response = await fetch(scriptUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify({
        q: text,
        source: source || 'ko', // 기본값 한국어
        target: target,
      }),
      redirect: 'follow'
    });

    if (!response.ok) {
      throw new Error(`GAS 서버 오류: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    return NextResponse.json({
      original: data.original,
      translated: data.translated,
      currentUsage: currentUsage || 0 // 현재 누적 사용량 반환
    });
  } catch (error: unknown) {
    console.error('[Translation API Error]', error);
    return NextResponse.json(
      { error: '번역 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
