"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import StartScreen from "./components/StartScreen";
import TutorialScreen from "./components/TutorialScreen";
import PreloadScreen from "./components/PreloadScreen";
import GameScreen from "./components/GameScreen";
import GameResultScreen from "./components/GameResultScreen";
import SurveyIntroScreen from "./components/SurveyIntroScreen";
import SurveyScreen from "./components/SurveyScreen";
import WheelScreen from "./components/WheelScreen";
import MyCouponsScreen from "./components/MyCouponsScreen";
import DailyResultScreen from "./components/DailyResultScreen";
import LanguageToggle from "./components/LanguageToggle";
import TermNotice from "./components/TermNotice";
import { useGameProgress } from "./hooks/useGameProgress";
import { useCouponFlow } from "./hooks/useCouponFlow";
import type { SurveyAnswerMap } from "./lib/surveyAnswers";
import { useLocale } from "./lib/i18n/LocaleContext";
import { hasPendingDraw } from "./lib/pendingDraw";
import { hasSurveySubmitted } from "./lib/surveySubmitted";
import {
  hasAcknowledgedTerm,
  markTermAcknowledged,
  hasSeenTutorial,
  markTutorialSeen,
} from "./lib/firstRunFlags";

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
  const { goToPhase, proceedToDailyResult, phase, scoreBreakdown, startGame } = game;
  const { loadQuestions, submitAnswers, spin, refreshCoupons, reset: resetCoupon } = coupon;

  // localStorage는 서버 렌더링 시점에 없다. 마운트 후에 읽어야 하이드레이션이 어긋나지 않는다.
  const [showDrawEntry, setShowDrawEntry] = useState(false);
  useEffect(() => {
    setShowDrawEntry(hasPendingDraw());
  }, [game.phase]);

  // 쿠키는 서버 렌더링 시점에 읽을 수 없다. showDrawEntry와 같은 이유로 마운트 후에
  // 읽어야 하이드레이션이 어긋나지 않는다 — useState(() => hasAcknowledgedTerm())로
  // 초기값을 계산하면 서버에서는 항상 false가 되어 마크업이 달라진다.
  const [showTerm, setShowTerm] = useState(false);
  useEffect(() => {
    setShowTerm(!hasAcknowledgedTerm());
  }, []);

  const acknowledgeTerm = useCallback(() => {
    markTermAcknowledged();
    setShowTerm(false);
  }, []);

  // 튜토리얼을 "다시 보기"로 열었는지 구분한다. onboarding이면 완주 시 게임으로,
  // review면 시작 화면으로 돌아가야 하는데 phase만으로는 구분할 수 없다.
  const [tutorialMode, setTutorialMode] = useState<"onboarding" | "review">("onboarding");

  // 게임 시작. 튜토리얼을 아직 안 본 참여자만 튜토리얼을 거친다.
  // 쿠키는 클릭 이벤트에서만 읽으므로 서버 렌더 중에는 호출되지 않는다
  // (enterSurveyFlow의 hasSurveySubmitted와 같은 전제).
  const handleStart = useCallback(() => {
    const withTutorial = !hasSeenTutorial();
    setTutorialMode("onboarding");
    startGame(withTutorial);
  }, [startGame]);

  // 시작 화면의 상시 버튼. runPreload를 부르지 않는다 — 부르는 순간
  // 프리로드가 끝나면서 사용자를 게임으로 끌고 갈 경로가 열린다.
  const openTutorialReview = useCallback(() => {
    setTutorialMode("review");
    goToPhase("tutorial");
  }, [goToPhase]);

  // 튜토리얼 완주. onboarding일 때만 쿠키를 쓴다 — 게임에 실제로 진입한
  // 경우에만 "봤다"로 친다.
  const finishTutorial = useCallback(() => {
    if (tutorialMode === "review") {
      goToPhase("start");
      return;
    }
    markTutorialSeen();
    goToPhase("playing");
  }, [tutorialMode, goToPhase]);

  // 좌상단 X. 쿠키를 쓰지 않으므로 다음 게임 시작 때 튜토리얼이 다시 뜬다.
  // preloadStatus는 여기서 건드리지 않는다 — 어차피 handleStart가 다시 startGame을
  // 호출하면 runPreload 첫 문장이 무조건 "loading"으로 리셋하고 처음부터 재요청하므로
  // (preloadAllStages에 캐시가 없다), 여기서 되돌릴 대상 자체가 없다.
  const exitTutorial = useCallback(() => {
    goToPhase("start");
  }, [goToPhase]);

  // 시작 화면에서 뽑기로 들어온 경우, 룰렛이 끝나도 오늘의 결과로 보내면 안 된다.
  // resetToStart가 scoreBreakdown/gukbapTier를 이미 비웠기 때문에 그 화면은
  // 렌더 조건을 만족하지 못해 빈 화면이 된다. 시작 화면으로 되돌린다.
  // scoreBreakdown이 아예 없는 경우(이번 세션에 게임을 안 한 경우)도 같은 이유로
  // start로 보낸다 — fromStartScreen 플래그 하나만 믿으면, 설문 로딩 중 이탈처럼
  // 그 플래그가 이미 꺼진 채로 여기 도달하는 경로에서 빈 화면이 뜬다.
  const [fromStartScreen, setFromStartScreen] = useState(false);
  const leaveDrawFlow = useCallback(() => {
    if (fromStartScreen || !scoreBreakdown) {
      setFromStartScreen(false);
      goToPhase("start");
      return;
    }
    proceedToDailyResult();
  }, [fromStartScreen, scoreBreakdown, goToPhase, proceedToDailyResult]);

  // 현재 phase를 async 콜백 재개 시점에도 읽을 수 있도록 ref로 미러링한다.
  // enterSurveyFlow의 클로저는 호출 시점의 phase만 알고 있어서, await 도중
  // 사용자가 다른 phase로 이동했는지는 이 ref로만 확인할 수 있다.
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // 설문 안내로 들어가되, Phase 1 문항이 0개면 설문 화면을 건너뛰고 곧장 룰렛으로 간다.
  // loadQuestions는 비동기이므로, 그 사이 사용자가 설문 안내를 벗어났다면(예: 참여
  // 거부) 되돌아온 뒤 강제로 wheel로 보내면 안 된다 — 여전히 surveyIntro일 때만 전환한다.
  //
  // 이미 설문을 제출한 적 있는 참여자(hasSurveySubmitted)라면 설문은 짐이 아니라 이미
  // 획득한 혜택이다 — 다시 답하게 하지 않고 곧장 룰렛으로 보낸다. 이 경우 questions를
  // 로드할 이유도 없다(어차피 렌더하지 않는다).
  //
  // 여기서는 phaseRef 가드를 넣지 않는다: goToPhase("surveyIntro") 직후 이 값을 확인하면,
  // 그 setState가 아직 커밋되지 않아 phaseRef.current가 "이전" phase를 가리키는 상태라
  // 가드가 오탐(항상 false)해 wheel 전환이 죽는다. phaseRef는 await로 실제 시간이 흐른
  // 뒤(zero-questions 분기)에만 의미가 있다 — 여기는 동기 경로라 그 사이 사용자가 다른
  // 곳으로 이동할 틈이 없으므로 가드가 필요 없다.
  // hasSurveySubmitted()는 localStorage를 읽지만, 이 콜백은 사용자 클릭 이벤트로만
  // 트리거되어 서버 렌더 중에는 절대 호출되지 않으므로 안전하다 — submitAnswers의 기존
  // 호출과 같은 전제.
  const enterSurveyFlow = useCallback(async () => {
    resetCoupon();
    goToPhase("surveyIntro");
    if (hasSurveySubmitted()) {
      goToPhase("wheel");
      return;
    }
    const outcome = await loadQuestions();
    // "empty"(문항 0건)와 "failed"(조회 실패) 모두 룰렛으로 보낸다 — 설문을 못 불러왔다고
    // 쿠폰 기회까지 막으면 사용자에게 더 큰 손해다. 다만 "failed"는 콘솔에만 남던 것을
    // 여기서 구분해 기록한다. 두 경우가 동일하게 처리되던 탓에 프로덕션에서 설문이
    // 안 뜨는 원인을 추적할 수 없었다.
    if (outcome === "failed") {
      console.error(
        "[enterSurveyFlow] 설문 문항 조회 실패 — 설문을 건너뛰고 룰렛으로 진행한다."
      );
    }
    if (outcome !== "shown" && phaseRef.current === "surveyIntro") {
      goToPhase("wheel");
    }
  }, [resetCoupon, goToPhase, loadQuestions]);

  const enterDrawFromStart = useCallback(async () => {
    setFromStartScreen(true);
    await enterSurveyFlow();
  }, [enterSurveyFlow]);

  const handleSurveySubmit = useCallback(
    async (answers: SurveyAnswerMap) => {
      const ok = await submitAnswers(answers);
      if (ok) goToPhase("wheel");
    },
    [goToPhase, submitAnswers]
  );

  const handleSurveyAgain = useCallback(async () => {
    await enterSurveyFlow();
  }, [enterSurveyFlow]);

  const openMyCoupons = useCallback(async () => {
    await refreshCoupons();
    goToPhase("myCoupons");
  }, [goToPhase, refreshCoupons]);

  return (
    <div className="min-h-screen bg-black">
      {showTerm && <TermNotice onAcknowledge={acknowledgeTerm} />}
      <LanguageToggle />
      {game.phase === "start" && (
        <StartScreen
          nickname={game.nickname}
          onRegenerateNickname={game.regenerateNickname}
          isRegeneratingNickname={game.isRegenerating}
          onStart={handleStart}
          onOpenTutorial={openTutorialReview}
          onGoToDraw={showDrawEntry ? enterDrawFromStart : undefined}
        />
      )}

      {game.phase === "tutorial" && (
        <TutorialScreen
          mode={tutorialMode}
          preloadStatus={game.preloadStatus}
          loadError={game.loadError}
          onRetryPreload={game.retryPreload}
          onFinish={finishTutorial}
          onExit={exitTutorial}
        />
      )}

      {game.phase === "loading" && (
        <PreloadScreen loadError={game.loadError} onRetry={game.retryPreload} />
      )}

      {game.phase === "playing" && game.session && (
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
