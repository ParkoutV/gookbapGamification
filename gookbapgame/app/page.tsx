"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import StartScreen from "./components/StartScreen";
import TutorialScreen from "./components/TutorialScreen";
import PreloadScreen from "./components/PreloadScreen";
import GameScreen from "./components/GameScreen";
import CountdownOverlay from "./components/CountdownOverlay";
import GameEndScreen from "./components/GameEndScreen";
import GameResultScreen from "./components/GameResultScreen";
import SurveyIntroScreen from "./components/SurveyIntroScreen";
import SurveyScreen from "./components/SurveyScreen";
import WheelScreen from "./components/WheelScreen";
import MyCouponsScreen from "./components/MyCouponsScreen";
import RankingScreen from "./components/RankingScreen";
import DailyResultScreen from "./components/DailyResultScreen";
import LanguageToggle from "./components/LanguageToggle";
import SoundToggle from "./components/SoundToggle";
import TermNotice from "./components/TermNotice";
import WebCouponGrantedNotice from "./components/WebCouponGrantedNotice";
import { useGameProgress, type GamePhase } from "./hooks/useGameProgress";
import { useCouponFlow } from "./hooks/useCouponFlow";
import type { SurveyAnswerMap } from "./lib/surveyAnswers";
import { useLocale } from "./lib/i18n/LocaleContext";
import { hasPendingDraw } from "./lib/pendingDraw";
import { hasSurveySubmitted } from "./lib/surveySubmitted";
import { useButtonClickSfx } from "./hooks/useButtonClickSfx";
import { useBgm } from "./hooks/useBgm";
import {
  hasAcknowledgedTerm,
  markTermAcknowledged,
  hasSeenTutorial,
  markTutorialSeen,
} from "./lib/firstRunFlags";

type PageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

/** gameEnd에서 GameScreen의 콜백을 끊는 데 쓴다(아래 렌더 조건의 주석 참고).
 *  **모듈 스코프에 두는 것이 요점이다** — 인라인 `() => {}`로 넘기면 렌더마다
 *  참조가 바뀌어, GameScreen의 onStageClear 의존 이펙트가 매번 다시 돌면서
 *  끊으려던 타이머를 오히려 계속 새로 건다. */
const noop = () => {};

export default function Home({ searchParams }: PageProps) {
  const resolvedSearchParams = use(searchParams);
  const rawTrackId = resolvedSearchParams.q;
  const trackId = typeof rawTrackId === "string" ? rawTrackId : null;

  const game = useGameProgress(trackId);
  const coupon = useCouponFlow();
  const { t } = useLocale();

  // 화면의 모든 버튼에 클릭 소리를 붙인다. 이 컴포넌트가 모든 화면의 루트라
  // 여기 한 번만 걸면 된다 — 버튼마다 심으면 반드시 빠뜨리는 곳이 생긴다.
  useButtonClickSfx();

  // 두 훅 모두 매 렌더마다 새 객체를 반환하므로, 객체를 그대로 의존성에 넣으면
  // 아래 콜백들이 매 렌더 재생성된다. 개별 함수는 useCallback([])로 안정적이니
  // 구조 분해해서 그것만 의존성에 넣는다.
  const { goToPhase, proceedToDailyResult, phase, scoreBreakdown, startGame } = game;
  const { loadQuestions, submitAnswers, spin, refreshCoupons, reset: resetCoupon } = coupon;

  // 게임 중에는 게임 BGM, 나머지 화면은 메인 BGM. 여기가 모든 화면의 루트라
  // 한 곳에서 phase만 보고 갈아끼우면 된다.
  useBgm(phase);

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
    // 오디오 잠금 해제는 여기서 하지 않는다. sfx.ts가 Web Audio로 바뀌면서
    // 재생 직전 ctx.resume()이 그 역할을 맡았고, 프리로드는 useButtonClickSfx가 한다.
    // 예전의 unlockSfx()는 iOS에서 효과음 6개를 실제로 울리는 버그였다(2026-08-12).
    // 클릭 소리는 useButtonClickSfx가 문서 전체에서 잡으므로 여기서 부르지 않는다.

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

  /**
   * "이 판에서 설문 안내를 거절했는가". 오늘의 결과의 '설문하고 쿠폰 받기' 재진입
   * 버튼을 이 사람에게만 보여준다 — 설계 문서상 그 버튼은 **거절한 사람을 위한
   * 구제책**이다(docs/superpowers/specs/2026-08-04-coupon-qr-design.md).
   * 조건 없이 항상 넘기던 탓에 설문·뽑기를 이미 마친 사람에게도 버튼이 떴고,
   * 누르면 hasSurveySubmitted()로 설문을 건너뛰고 뽑기를 한 번 더 태웠다.
   * 서버 제한이 1일 3회로 늘면서 실제로 더 뽑히는 상태가 됐다.
   *
   * localStorage에 남기지 않는다 — 거절은 그 판 안에서만 유효한 상태다.
   * 이 값은 UI 힌트일 뿐이며 발급 자격은 언제나 서버가 판정한다.
   */
  const [declinedSurvey, setDeclinedSurvey] = useState(false);

  // 거절 지점에서만 켠다. leaveDrawFlow는 WheelScreen의 '다음'과도 공유하므로
  // 그 안에서 켜면 뽑기를 끝낸 사람에게도 버튼이 살아나 고치려던 증상이 그대로 난다.
  const declineSurvey = useCallback(() => {
    setDeclinedSurvey(true);
    leaveDrawFlow();
  }, [leaveDrawFlow]);

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
    // 흐름에 들어가는 순간 거절 상태를 끈다 — 버튼은 한 번 쓰면 소진된다.
    // 여기서 끄지 않으면 거절 → 버튼 → 설문 → 뽑기 → 오늘의 결과로 돌아왔을 때
    // 버튼이 또 떠서 뽑기를 계속 태울 수 있다(서버가 하루 3회를 허용한다).
    // 끄는 지점이 여기 하나뿐이라 진입 경로(게임 결과·시작 화면·재진입 버튼)가
    // 늘어도 빠뜨릴 곳이 없다. 다시 거절하면 그때 다시 켜지는 것이 맞다 —
    // 그 사람은 여전히 뽑지 않았다.
    setDeclinedSurvey(false);
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

  /**
   * 앨범을 닫을 때 돌아갈 화면.
   *
   * **`fromStartScreen`을 재사용하지 않는다.** 그것은 뽑기 흐름 전용이고
   * (`leaveDrawFlow`가 소비하며 그 안에서 false로 되돌린다), 앨범 안에 뽑기 진입이
   * 생긴 지금은 두 흐름이 겹친다 — 시작 화면 → 앨범 → 뽑기로 들어가면 한 플래그가
   * 두 복귀 지점을 동시에 뜻해야 해서 반드시 한쪽이 틀린다.
   *
   * 기본값이 `dailyResult`가 아니라 `start`인 이유: 앨범은 이제 시작 화면에서도
   * 열리고, 그쪽이 훨씬 잦은 경로다. 결과 흐름에서 열 때만 명시적으로 지정한다.
   */
  const [myCouponsReturnPhase, setMyCouponsReturnPhase] = useState<GamePhase>("start");

  const openMyCoupons = useCallback(
    async (returnTo: GamePhase = "start") => {
      setMyCouponsReturnPhase(returnTo);
      await refreshCoupons();
      goToPhase("myCoupons");
    },
    [goToPhase, refreshCoupons]
  );

  return (
    <div className="min-h-dvh bg-black">
      {showTerm && <TermNotice onAcknowledge={acknowledgeTerm} />}
      {/* 설문 직후 온라인몰 쿠폰 안내. **화면 전환과 무관하게 최상위에 둔다** —
          설문 제출 성공은 곧 `wheel`로 넘어가는 전이를 부르므로(`handleSurveySubmit`),
          특정 phase 안에 두면 그 화면이 언마운트되면서 팝업도 함께 사라진다. */}
      {coupon.grantedWebCoupon && (
        <WebCouponGrantedNotice
          coupon={coupon.grantedWebCoupon}
          settings={coupon.webCouponSettings}
          onConfirm={coupon.dismissGrantedWebCoupon}
        />
      )}
      {/* 화면 위에 늘 떠 있는 도구 모음. 각 버튼이 스스로 fixed를 갖지 않고
          여기서 위치를 정한다 — 따로 두면 서로 겹친다. */}
      <div className="fixed top-2 left-2 z-[60] flex items-start gap-2">
        <LanguageToggle />
        <SoundToggle />
      </div>
      {game.phase === "start" && (
        <StartScreen
          nickname={game.nickname}
          onRegenerateNickname={game.regenerateNickname}
          isRegeneratingNickname={game.isRegenerating}
          onStart={handleStart}
          onOpenTutorial={openTutorialReview}
          onOpenRanking={() => goToPhase("ranking")}
          /* 뽑기 진입은 이제 앨범 안에 있다 — 여기서는 red-dot 조건만 넘긴다
             (2026-08-13, 이란토). */
          onOpenMyCoupons={() => void openMyCoupons("start")}
          hasPendingDraw={showDrawEntry}
          trackId={trackId}
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

      {/* 카운트다운 오버레이를 이 블록 **안**에 형제로 두는 것이 요점이다 —
          뒤에 게임판이 보여야 하는데, 바깥에 두면 렌더 조건이 갈려 언젠가
          빈 화면 위에 숫자만 뜨는 상태가 생긴다.
          pointer-events-none은 카운트다운 중 클릭이 게임판에 닿아 오답으로
          처리되는 것을 막는다(오버레이 자신이 입력을 삼키는 것과 이중 안전장치).

          **gameEnd에서도 게임판을 계속 렌더한다**(2026-08-11 실기 확인, 이란토).
          GAME OVER / CLEAR!는 화면을 덮는 게 아니라 게임판 위에 뜨는 팝업 창이라
          뒤에 판이 남아 있어야 한다. 예전에는 phase가 갈리는 순간 GameScreen이
          언마운트돼서, 종료 화면이 bg-bg로 덮지 않으면 빈 배경 위에 창만 뜬다.

          phase 자체는 그대로 playing을 벗어난다 — 300초 타이머 가드
          (useGameProgress의 `phase !== "playing"`)가 그 전제로 멈추므로
          이 조건만 넓히고 훅은 건드리지 않는다.

          다만 **콜백은 gameEnd에서 끊어야 한다.** GameScreen에는 "정답을 다 맞히면
          FORCE_ADVANCE_DELAY_MS 뒤 onStageClear"를 거는 이펙트가 있는데(GameScreen.tsx
          의 foundSlots 이펙트), 마운트를 유지하면 그 조건이 계속 참이라 타이머가 다시
          걸린다. 그러면 advanceStage가 한 번 더 돌아 LevelResult가 중복 append되고
          finishGame이 재실행돼 **점수가 조용히 바뀐다.** noop으로 갈아끼우면 판은
          보이면서 진행만 멈춘다. */}
      {(game.phase === "playing" || game.phase === "gameEnd") && game.session && (
        <>
          <div
            className={
              game.isCountingDown || game.phase === "gameEnd"
                ? "pointer-events-none"
                : undefined
            }
          >
            <GameScreen
              key={`${game.stageNumber}-${game.loadNonce}`}
              session={game.session}
              stageNumber={game.stageNumber}
              totalStages={game.totalStages}
              remainingTimeSec={game.remainingTimeSec}
              /* 힌트 카운터는 useGameProgress가 들고 있다 — GameScreen은 단계마다
                 리마운트되므로(위 key) 거기 두면 "게임당 3회"가 "단계당 3회"가 된다. */
              hintsRemaining={game.hintsRemaining}
              onConsumeHint={game.consumeHint}
              onMarkHintSurveyShown={game.markHintSurveyShown}
              onStageClear={game.phase === "gameEnd" ? noop : game.handleStageClear}
              onForceAdvance={game.phase === "gameEnd" ? noop : game.handleForceAdvance}
              onWrongTouch={game.phase === "gameEnd" ? noop : game.recordWrongTouch}
              onCorrectFind={game.phase === "gameEnd" ? noop : game.recordCorrectFind}
            />
          </div>
          {game.isCountingDown && <CountdownOverlay onDone={game.endCountdown} />}
        </>
      )}

      {game.phase === "gameEnd" && game.endReason && (
        <GameEndScreen reason={game.endReason} onNext={() => goToPhase("gameResult")} />
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
          onDecline={declineSurvey}
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

      {/* 시작 화면에서만 들어오므로 닫으면 시작 화면으로 돌아온다(내 쿠폰이
          dailyResult로 돌아가는 것과 다르다 — 그쪽은 결과 흐름 안의 화면이다). */}
      {game.phase === "ranking" && <RankingScreen onClose={() => goToPhase("start")} />}

      {/* 닫으면 **열었던 곳으로** 돌아간다(`myCouponsReturnPhase`) — 시작 화면과 결과
          화면 양쪽에서 열리므로 한쪽으로 고정할 수 없다.

          뽑기 진입은 기회가 남았을 때만 넘긴다. `enterDrawFromStart`를 그대로 쓰는
          이유: 앨범을 시작 화면에서 열었다면 그 이름 그대로 맞고, 결과 화면에서 열었어도
          `leaveDrawFlow`가 `scoreBreakdown` 유무를 함께 보므로 복귀가 어긋나지 않는다
          (그쪽 주석 참고). */}
      {game.phase === "myCoupons" && (
        <MyCouponsScreen
          coupons={coupon.coupons}
          webCoupons={coupon.webCoupons}
          webCouponSettings={coupon.webCouponSettings}
          onClose={() => goToPhase(myCouponsReturnPhase)}
          onGoToDraw={showDrawEntry ? enterDrawFromStart : undefined}
        />
      )}

      {game.phase === "dailyResult" && game.scoreBreakdown && game.gukbapTier && (
        <DailyResultScreen
          nickname={game.nickname}
          gukbapTier={game.gukbapTier}
          totalScore={game.scoreBreakdown.total}
          onRestart={game.resetToStart}
          /* 거절한 사람에게만 준다. DailyResultScreen은 이 prop이 없으면
             버튼을 렌더하지 않는다(옵셔널 prop + 가드). */
          onSurveyAgain={declinedSurvey ? handleSurveyAgain : undefined}
          onOpenMyCoupons={() => void openMyCoupons("dailyResult")}
        />
      )}
    </div>
  );
}
