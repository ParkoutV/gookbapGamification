"use client";

import { use, useCallback, useEffect, useState } from "react";
import StartScreen from "./components/StartScreen";
import PreloadScreen from "./components/PreloadScreen";
import GameScreen from "./components/GameScreen";
import StageTransitionModal from "./components/StageTransitionModal";
import GameResultScreen from "./components/GameResultScreen";
import SurveyIntroScreen from "./components/SurveyIntroScreen";
import SurveyScreen from "./components/SurveyScreen";
import WheelScreen from "./components/WheelScreen";
import MyCouponsScreen from "./components/MyCouponsScreen";
import DailyResultScreen from "./components/DailyResultScreen";
import LanguageToggle from "./components/LanguageToggle";
import { useGameProgress } from "./hooks/useGameProgress";
import { useCouponFlow } from "./hooks/useCouponFlow";
import type { SurveyAnswerMap } from "./lib/surveyAnswers";
import { useLocale } from "./lib/i18n/LocaleContext";
import { hasPendingDraw } from "./lib/pendingDraw";

type PageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default function Home({ searchParams }: PageProps) {
  const resolvedSearchParams = use(searchParams);
  const rawTrackId = resolvedSearchParams.q;
  const trackId = typeof rawTrackId === "string" ? rawTrackId : null;

  const game = useGameProgress(trackId);
  const coupon = useCouponFlow();
  const { t } = useLocale();

  // 두 훅 모두 매 렌더마다 새 객체를 반환하므로, 객체를 그대로 의존성에 넣으면
  // 아래 콜백들이 매 렌더 재생성된다. 개별 함수는 useCallback([])로 안정적이니
  // 구조 분해해서 그것만 의존성에 넣는다.
  const { goToPhase, proceedToDailyResult } = game;
  const { loadQuestions, submitAnswers, spin, refreshCoupons, reset: resetCoupon } = coupon;

  // localStorage는 서버 렌더링 시점에 없다. 마운트 후에 읽어야 하이드레이션이 어긋나지 않는다.
  const [showDrawEntry, setShowDrawEntry] = useState(false);
  useEffect(() => {
    setShowDrawEntry(hasPendingDraw());
  }, [game.phase]);

  // 시작 화면에서 뽑기로 들어온 경우, 룰렛이 끝나도 오늘의 결과로 보내면 안 된다.
  // resetToStart가 scoreBreakdown/gukbapTier를 이미 비웠기 때문에 그 화면은
  // 렌더 조건을 만족하지 못해 빈 화면이 된다. 시작 화면으로 되돌린다.
  const [fromStartScreen, setFromStartScreen] = useState(false);
  const leaveDrawFlow = useCallback(() => {
    if (fromStartScreen) {
      setFromStartScreen(false);
      goToPhase("start");
      return;
    }
    proceedToDailyResult();
  }, [fromStartScreen, goToPhase, proceedToDailyResult]);

  // 설문 안내로 들어가되, Phase 1 문항이 0개면 설문 화면을 건너뛰고 곧장 룰렛으로 간다.
  const enterSurveyFlow = useCallback(async () => {
    goToPhase("surveyIntro");
    const hasQuestions = await loadQuestions();
    if (!hasQuestions) goToPhase("wheel");
  }, [goToPhase, loadQuestions]);

  const enterDrawFromStart = useCallback(async () => {
    resetCoupon();
    setFromStartScreen(true);
    await enterSurveyFlow();
  }, [resetCoupon, enterSurveyFlow]);

  const handleSurveySubmit = useCallback(
    async (answers: SurveyAnswerMap) => {
      const ok = await submitAnswers(answers);
      if (ok) goToPhase("wheel");
    },
    [goToPhase, submitAnswers]
  );

  const handleSurveyAgain = useCallback(async () => {
    resetCoupon();
    await enterSurveyFlow();
  }, [resetCoupon, enterSurveyFlow]);

  const openMyCoupons = useCallback(async () => {
    await refreshCoupons();
    goToPhase("myCoupons");
  }, [goToPhase, refreshCoupons]);

  return (
    <div className="min-h-screen bg-black">
      <LanguageToggle />
      {game.phase === "start" && (
        <StartScreen
          nickname={game.nickname}
          onRegenerateNickname={game.regenerateNickname}
          isRegeneratingNickname={game.isRegenerating}
          onStart={game.startGame}
          onGoToDraw={showDrawEntry ? enterDrawFromStart : undefined}
        />
      )}

      {game.phase === "loading" && (
        <PreloadScreen loadError={game.loadError} onRetry={game.retryPreload} />
      )}

      {(game.phase === "playing" || game.phase === "stageClear") && game.session && (
        <div className={game.phase !== "playing" ? "blur-sm pointer-events-none" : undefined}>
          <GameScreen
            key={`${game.stageNumber}-${game.loadNonce}`}
            session={game.session}
            stageNumber={game.stageNumber}
            totalStages={game.totalStages}
            remainingTimeSec={game.remainingTimeSec}
            onStageClear={game.handleStageClear}
            onForceAdvance={game.handleForceAdvance}
            onWrongTouch={game.recordWrongTouch}
            onCorrectFind={game.recordCorrectFind}
          />
        </div>
      )}

      {game.phase === "stageClear" && <StageTransitionModal onNext={game.advanceToNextStage} />}

      {game.phase === "gameResult" && game.scoreBreakdown && game.gukbapTier && (
        <GameResultScreen
          scoreBreakdown={game.scoreBreakdown}
          gukbapTier={game.gukbapTier}
          onNext={enterSurveyFlow}
        />
      )}

      {game.phase === "surveyIntro" && (
        <SurveyIntroScreen
          onParticipate={() => goToPhase("survey")}
          onDecline={leaveDrawFlow}
        />
      )}

      {game.phase === "survey" && (
        <SurveyScreen
          questions={coupon.questions}
          isSubmitting={coupon.state === "submitting"}
          errorMessage={coupon.submitError ? t(coupon.submitError) : null}
          onSubmit={handleSurveySubmit}
        />
      )}

      {game.phase === "wheel" && (
        <WheelScreen
          drawResult={coupon.drawResult}
          isDrawing={coupon.state === "drawing"}
          onSpin={spin}
          onNext={leaveDrawFlow}
        />
      )}

      {game.phase === "myCoupons" && (
        <MyCouponsScreen coupons={coupon.coupons} onClose={() => goToPhase("dailyResult")} />
      )}

      {game.phase === "dailyResult" && game.scoreBreakdown && game.gukbapTier && (
        <DailyResultScreen
          nickname={game.nickname}
          gukbapTier={game.gukbapTier}
          totalScore={game.scoreBreakdown.total}
          onRestart={game.resetToStart}
          onSurveyAgain={handleSurveyAgain}
          onOpenMyCoupons={openMyCoupons}
        />
      )}
    </div>
  );
}
