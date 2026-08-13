"use client";

import { useCallback, useRef, useState } from "react";
import {
  assignWebCoupon,
  drawCoupon,
  ensureWebCoupons,
  fetchMyCoupons,
  fetchMyWebCoupons,
  fetchSurveyQuestions,
  fetchWebCouponSettings,
  submitSurveyResponses,
  type DrawCouponResult,
  type IssuedCoupon,
  type WebCoupon,
  type WebCouponSettings,
} from "../actions";
import type { SurveyAnswerMap, SurveyQuestion } from "../lib/surveyAnswers";
import { clearPendingDraw, markPendingDraw } from "../lib/pendingDraw";
import { hasSurveySubmitted, markSurveySubmitted } from "../lib/surveySubmitted";
import { isCouponUnusable } from "../lib/couponUsability";
import { isFreshlyIssued } from "../lib/issuedCoupons";

export type CouponFlowState =
  | "idle"
  | "loadingQuestions"
  | "survey"
  | "submitting"
  | "drawing"
  | "done";

export function useCouponFlow() {
  const [state, setState] = useState<CouponFlowState>("idle");
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [drawResult, setDrawResult] = useState<DrawCouponResult | null>(null);
  const [coupons, setCoupons] = useState<IssuedCoupon[]>([]);
  const [webCoupons, setWebCoupons] = useState<WebCoupon[]>([]);
  /** 티켓에 뜨는 문구(`web_coupon_settings`). null이면 로케일 파일 기본값을 쓴다. */
  const [webCouponSettings, setWebCouponSettings] = useState<WebCouponSettings | null>(null);
  /**
   * 설문 직후 안내 팝업에 띄울 쿠폰. 팝업을 닫으면 null로 되돌린다.
   *
   * **`webCoupons[0]`을 보지 않고 따로 두는 이유**: 그 배열은 앨범을 열 때마다 다시
   * 채워지므로, 그걸 방아쇠로 삼으면 앨범에 들어갈 때마다 팝업이 다시 뜬다.
   * 이 값은 "방금 발급됐다"는 일회성 사건을 뜻한다.
   */
  const [grantedWebCoupon, setGrantedWebCoupon] = useState<WebCoupon | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // 룰렛 진입당 draw는 정확히 1회. 리렌더·StrictMode 이중 실행으로 두 번 호출되면
  // 두 번째는 쿨타임 403을 받아 사용자에게 없던 실패로 보인다.
  const drawStartedRef = useRef(false);

  /**
   * "설문을 보여줄 수 있는가"와 "왜 못 보여주는가"를 구분해서 돌려준다.
   * - "shown":   문항을 불러왔다. 설문 화면으로 간다.
   * - "empty":   정상 조회했지만 Phase 1 문항이 0건. 설문을 건너뛰는 게 맞다.
   * - "failed":  조회 자체가 실패(RLS·네트워크·DB 장애). 건너뛰면 안 되고
   *              사용자에게 알려야 한다 — 이걸 "empty"로 뭉뚱그렸던 것이
   *              프로덕션 장애를 조용한 스킵으로 위장시킨 원인이다.
   */
  const loadQuestions = useCallback(async (): Promise<
    "shown" | "empty" | "failed"
  > => {
    setState("loadingQuestions");
    const result = await fetchSurveyQuestions();
    setQuestions(result.questions);

    if (!result.ok) {
      setState("idle");
      return "failed";
    }
    if (result.questions.length === 0) {
      setState("idle");
      return "empty";
    }
    setState("survey");
    return "shown";
  }, []);

  // 재제출 차단. 서버에서 SELECT로 막을 수 없어(survey_responses는 INSERT만 열림)
  // 여기서 막는다. reset()으로 풀리지 않는다 — 같은 세션에서 '설문하고 쿠폰 받기'로
  // 재진입해도 응답이 두 번 쌓이면 설문 완료율 KPI가 왜곡된다.
  // ref만으로는 새로고침에 씻겨나가므로 localStorage(surveySubmitted.ts)에도 남긴다.
  const submitAnswers = useCallback(
    async (answers: SurveyAnswerMap): Promise<boolean> => {
      if (hasSurveySubmitted()) return true;
      setState("submitting");
      setSubmitError(null);
      const result = await submitSurveyResponses(questions, answers);
      if (!result.ok) {
        setSubmitError("survey.submitError");
        setState("survey");
        return false;
      }
      markSurveySubmitted();

      /*
       * 온라인몰 쿠폰은 **설문 최초 응답자에게 100% 확정 지급**된다(2026-08-13, 이란토).
       * 카드 뽑기와 별개이며 확률도 없다.
       *
       * `await`하는 이유는 곧바로 안내 팝업을 띄우기 위해서다. 여기서 실패해도
       * 흐름을 막지 않는다 — 실패는 앨범 진입 시 `ensureWebCoupons`가 한 번 더
       * 시도해서 메운다(그쪽 주석 참고).
       *
       * **`hasSurveySubmitted()` 가드 뒤에 있다는 점이 중요하다.** 재제출로 들어온
       * 사람은 위에서 이미 리턴했으므로 여기 도달하지 않는다 — 발급 요청이 반복되지
       * 않는다. 서버도 자격을 검증하지만, 부르지 않는 편이 낫다.
       */
      const assigned = await assignWebCoupon();
      if (assigned.ok) {
        // 팝업에도 티켓이 뜨므로 문구가 함께 필요하다. 목록과 독립이라 병렬로 보낸다.
        const [web, settings] = await Promise.all([fetchMyWebCoupons(), fetchWebCouponSettings()]);
        setWebCoupons(web);
        if (settings) setWebCouponSettings(settings);
        // 방금 받은 것을 팝업으로 보여준다. 목록이 비어 있으면(조회 실패) 띄우지 않는다 —
        // 코드 없는 "쿠폰을 받았어요" 팝업은 아무 쓸모가 없다.
        if (web.length > 0) setGrantedWebCoupon(web[0]);
      }

      setState("idle");
      return true;
    },
    [questions]
  );

  const spin = useCallback(async () => {
    if (drawStartedRef.current) return;
    drawStartedRef.current = true;

    setState("drawing");
    const result = await drawCoupon();

    // 거절(4xx)은 대부분 "룰렛 도중 새로고침"이다. 에러를 띄우는 대신
    // 이미 가지고 있는 최신 쿠폰을 보여주는 것이 올바른 복구 동작이다 —
    // draw는 일회성 이벤트이고, 쿠폰 목록이 영속적 진실이다.
    //
    // 다만 **"방금 발급된 것"일 때만이다.** 예전엔 쓸 수 있는 쿠폰 아무거나 골라
    // won으로 띄웠는데, 서버 제한이 1일 3회로 늘면서 며칠 전 쿠폰이 매번 새로
    // 당첨된 것처럼 나오는 버그가 됐다(카드 뒤집기 연출·당첨 효과음까지).
    // 대상은 언제나 existing[0]이다 — fetchMyCoupons가 sortByIssuedAt으로
    // 최신순을 보장한다. find로 훑으면 그 보장을 버리고 남의 쿠폰을 집는다.
    if (result.status === "rejected") {
      clearPendingDraw();
      const existing = await fetchMyCoupons();
      setCoupons(existing);
      const latest = existing[0];
      // isUsed는 발급 직후에도 뒤집힐 수 있다(매장에서 바로 스캔한 경우).
      const recovered =
        latest && isFreshlyIssued(latest, Date.now()) && !isCouponUnusable(latest);
      setDrawResult(recovered ? { status: "won", coupon: latest } : result);
      setState("done");
      return;
    }

    setDrawResult(result);

    // 접속 실패로 뽑기가 아예 성립하지 않은 경우에만 표시를 남긴다. 발급도 쿨타임
    // 갱신도 일어나지 않았으므로 기회는 그대로 살아 있고, 다음 방문 시작 화면에서
    // 다시 들어올 수 있게 한다. 그 외 결과(당첨/꽝)는 기회를 소진했으니 표시를 지운다.
    if (result.status === "error") markPendingDraw();
    else clearPendingDraw();

    if (result.status === "won") setCoupons((prev) => [result.coupon, ...prev]);
    setState("done");
  }, []);

  /**
   * 앨범을 열기 전에 두 목록을 모두 새로 읽는다.
   *
   * 온라인몰 쿠폰은 `ensureWebCoupons`로 읽는다 — 목록이 비어 있으면 **발급을 한 번 더
   * 시도한다.** `submitAnswers`가 이미 제출한 사람에게는 서버를 부르지 않고 곧장
   * 리턴하므로(재제출 차단), 설문 직후 발급이 네트워크 오류로 실패하면 다시 시도할
   * 자리가 여기밖에 없다. 자격 판정은 서버가 하므로 자격 없는 사람이 열어도 안전하다.
   *
   * 두 요청은 서로 독립이라 병렬로 보낸다.
   */
  const refreshCoupons = useCallback(async () => {
    const [issued, web, settings] = await Promise.all([
      fetchMyCoupons(),
      ensureWebCoupons(),
      fetchWebCouponSettings(),
    ]);
    setCoupons(issued);
    setWebCoupons(web);
    // 조회 실패(null)면 이전 값을 지우지 않는다 — 문구가 있다가 사라지는 것보다 낫다.
    if (settings) setWebCouponSettings(settings);
  }, []);

  const reset = useCallback(() => {
    drawStartedRef.current = false;
    setState("idle");
    setQuestions([]);
    setDrawResult(null);
    setSubmitError(null);
  }, []);

  return {
    state,
    questions,
    drawResult,
    coupons,
    webCoupons,
    webCouponSettings,
    grantedWebCoupon,
    /* 팝업 닫기. `reset()`에 넣지 않는다 — 그쪽은 뽑기 흐름을 다시 태우는 용도라
       설문 직후 팝업과 수명이 다르다. */
    dismissGrantedWebCoupon: useCallback(() => setGrantedWebCoupon(null), []),
    submitError,
    loadQuestions,
    submitAnswers,
    spin,
    refreshCoupons,
    reset,
  };
}
