"use client";

import { useCallback, useRef, useState } from "react";
import {
  drawCoupon,
  fetchMyCoupons,
  fetchSurveyQuestions,
  submitSurveyResponses,
  type DrawCouponResult,
  type IssuedCoupon,
} from "../actions";
import type { SurveyAnswerMap, SurveyQuestion } from "../lib/surveyAnswers";
import { clearPendingDraw, markPendingDraw } from "../lib/pendingDraw";
import { hasSurveySubmitted, markSurveySubmitted } from "../lib/surveySubmitted";
import { isCouponUnusable } from "../lib/couponUsability";

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
  const [submitError, setSubmitError] = useState<string | null>(null);

  // 룰렛 진입당 draw는 정확히 1회. 리렌더·StrictMode 이중 실행으로 두 번 호출되면
  // 두 번째는 쿨타임 403을 받아 사용자에게 없던 실패로 보인다.
  const drawStartedRef = useRef(false);

  const loadQuestions = useCallback(async (): Promise<boolean> => {
    setState("loadingQuestions");
    const loaded = await fetchSurveyQuestions();
    setQuestions(loaded);
    if (loaded.length === 0) {
      setState("idle");
      return false;
    }
    setState("survey");
    return true;
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

    // 쿨타임 403은 대부분 "룰렛 도중 새로고침"이다. 에러를 띄우는 대신
    // 이미 가지고 있는 최신 쿠폰을 보여주는 것이 올바른 복구 동작이다 —
    // draw는 일회성 이벤트이고, 쿠폰 목록이 영속적 진실이다.
    if (result.status === "rejected") {
      clearPendingDraw();
      const existing = await fetchMyCoupons();
      setCoupons(existing);
      const usable = existing.find((c) => !isCouponUnusable(c));
      setDrawResult(usable ? { status: "won", coupon: usable } : result);
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

  const refreshCoupons = useCallback(async () => {
    setCoupons(await fetchMyCoupons());
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
    submitError,
    loadQuestions,
    submitAnswers,
    spin,
    refreshCoupons,
    reset,
  };
}
