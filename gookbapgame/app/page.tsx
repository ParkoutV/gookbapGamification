"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import StartScreen from "./components/StartScreen";
import LegalNotice from "./components/LegalNotice";
import TutorialScreen from "./components/TutorialScreen";
import PreloadScreen from "./components/PreloadScreen";
import GameScreen from "./components/GameScreen";
import CountdownOverlay from "./components/CountdownOverlay";
import GameEndScreen from "./components/GameEndScreen";
import GameResultScreen from "./components/GameResultScreen";
import SurveyIntroScreen from "./components/SurveyIntroScreen";
import SurveyScreen from "./components/SurveyScreen";
import WheelScreen from "./components/WheelScreen";
import GatchaLoading from "./components/GatchaLoading";
import DaylightBackground from "./components/DaylightBackground";
import MyCouponsScreen from "./components/MyCouponsScreen";
import RankingScreen from "./components/RankingScreen";
import DailyResultScreen from "./components/DailyResultScreen";
import LanguageToggle from "./components/LanguageToggle";
import SoundToggle from "./components/SoundToggle";
import WebCouponGrantedNotice from "./components/WebCouponGrantedNotice";
import { useGameProgress, type GamePhase } from "./hooks/useGameProgress";
import { useCouponFlow } from "./hooks/useCouponFlow";
import type { SurveyAnswerMap } from "./lib/surveyAnswers";
import { useLocale } from "./lib/i18n/LocaleContext";
import { hasPendingDraw } from "./lib/pendingDraw";
import { fetchGatchaLimit, fetchPendingSurvey } from "./actions";
import { gatchaLimitNotice, type GatchaLimitNotice } from "./lib/gatchaLimit";
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

/**
 * 쿠폰 설문. 힌트 설문(phase 0)과 달리 **뽑기 자격이 걸려 있어** 서버가 같은 값을
 * 검증한다(`/api/gatcha/draw`). `GameScreen`의 `HINT_SURVEY_PHASE = 0`과 짝이다.
 */
const COUPON_SURVEY_PHASE = 1;

export default function Home({ searchParams }: PageProps) {
  const resolvedSearchParams = use(searchParams);
  const rawTrackId = resolvedSearchParams.q;
  const trackId = typeof rawTrackId === "string" ? rawTrackId : null;

  const game = useGameProgress(trackId);
  const coupon = useCouponFlow();
  const { t } = useLocale();

  // 화면의 모든 버튼에 클릭 소리를 붙인다. 이 컴포넌트가 모든 화면의 루트라
  // 여기 한 번만 걸면 된다 — 버튼마다 심으면 반드시 빠뜨리는 곳이 생긴다.
  // 두 번째 인자로 데이터 프리워밍을 얹는다 — 첫 상호작용에서 세션만 미리 받아둔다
  // (실제로 한 번만 도는 것은 훅 안의 래치가 보장한다).
  useButtonClickSfx(game.prewarmSessions);

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

  /**
   * 튜토리얼 마지막 장에 붙일 뽑기 횟수 제한 안내.
   *
   * **마운트 시 한 번만 읽는다.** 운영 중에 바뀌는 값이 아니고(운영자가 대시보드에서
   * 가끔 조정한다), 튜토리얼을 열 때마다 부르면 '게임 방법'을 여닫는 것만으로 요청이
   * 쌓인다. 실패하면 null로 남아 그 줄이 빠질 뿐이라 흐름을 막지 않는다.
   */
  const [drawLimitNotice, setDrawLimitNotice] = useState<GatchaLimitNotice | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchGatchaLimit().then((settings) => {
      if (!cancelled) setDrawLimitNotice(gatchaLimitNotice(settings));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const acknowledgeTerm = useCallback(() => {
    markTermAcknowledged();
    setShowTerm(false);
  }, []);

  /* 시작 화면 푸터에서 여는 열람용. **최초 고지(`showTerm`)와 별개의 state다** —
     합치면 이미 고지받은 사람이 푸터로 열었다 닫을 때 쿠키를 다시 쓰게 되고,
     반대로 최초 고지에 ✕가 생겨 "거부라는 선택지를 두지 않는다"는 설계가 깨진다
     (`LegalNotice`의 firstRun 주석). */
  const [showLegalReview, setShowLegalReview] = useState(false);

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
  /**
   * 설문을 띄울지 서버에 묻는 중인가. 그동안 `surveyIntro` 위에 대기 오버레이를 덮는다
   * (근거는 `enterSurveyFlow` 안 주석). 설문 안내가 잘못 번쩍이는 것을 막는 UI 전용
   * 플래그이며, 흐름 판정에는 관여하지 않는다.
   */
  const [surveyGateWaiting, setSurveyGateWaiting] = useState(false);

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
  // 이미 답한 사람이라면 설문은 짐이 아니라 이미 획득한 혜택이다 — 다시 답하게 하지
  // 않고 곧장 룰렛으로 보낸다. **그 판정은 서버(RPC)가 한다**(아래 주석 참고).
  //
  // phaseRef 가드는 **await 뒤의 wheel 전환에만** 건다. `goToPhase("surveyIntro")`
  // 직후에 확인하면 그 setState가 아직 커밋되지 않아 phaseRef.current가 "이전" phase를
  // 가리켜 가드가 항상 false로 오탐한다 — 그래서 동기 구간에는 두지 않는다.
  // 반대로 await를 지난 뒤에는 그 사이 사용자가 화면을 벗어났을 수 있으므로 반드시
  // 필요하다(설문 안내에서 참여를 거부하고 나갔는데 강제로 룰렛에 들어가면 안 된다).
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

    /*
     * **설문을 건너뛸지는 서버(RPC)가 정한다**(2026-08-15, 구자건 지적).
     *
     * 예전에는 `hasSurveySubmitted()`(localStorage)만 보고 곧장 wheel로 보냈다.
     * 그런데 **쿠키(`gookbapgame_token`)와 localStorage는 수명이 다르다** — 쿠키가
     * 지워지거나 만료되면 participant_id가 새로 생기는데 localStorage 플래그는 남아,
     * 클라이언트는 "설문 했음"으로 보고 건너뛰지만 서버 기준으로는 응답이 없어
     * 뽑기가 403(SURVEY_REQUIRED)으로 거절된다. 실제로 프로덕션에서 난 증상이다.
     *
     * localStorage는 **지우지 않고 힌트로 남긴다** — 재제출 차단(`submitAnswers`)과
     * `declinedSurvey` 연동이 그 값에 걸려 있다. 여기서는 "판정 권위"만 RPC로 옮긴다.
     *
     * **조회 실패는 fail closed** — 설문을 보여주는 쪽으로 떨어진다. 빈 목록을
     * "건너뛰기"로 쓰는 자리라 실패를 빈 목록과 뭉뚱그리면 그대로 403이 되고,
     * 설문을 한 번 더 보는 쪽이 쿠폰을 못 받는 것보다 낫다.
     */
    /*
     * **판정이 끝날 때까지 설문 안내를 가린다**(2026-08-15 이란토 제보).
     *
     * 아래 RPC를 기다리는 동안 `surveyIntro`가 이미 그려져 있어서, 설문을 이미 마쳐
     * 곧장 룰렛으로 갈 사람에게도 **설문 독려 화면이 한 번 번쩍 스쳤다.** 안 해도 될
     * 설문을 권하는 화면이라 잘못된 안내다.
     *
     * 화면 전환 자체를 늦추지는 않는다 — 그러면 이번엔 결과 화면이 멈춰 보인다.
     * 대신 뽑기 화면과 **같은 대기 오버레이**를 덮는다(게임 안의 "서버를 기다리는
     * 화면"은 전부 같은 모양이라는 원칙, `GatchaLoading` 주석).
     */
    setSurveyGateWaiting(true);
    try {
      const pending = await fetchPendingSurvey(COUPON_SURVEY_PHASE);
      // await를 지났으므로 그 사이 사용자가 설문 안내를 벗어났을 수 있다(위 주석).
      if (pending.ok && pending.questionIds.length === 0) {
        if (phaseRef.current === "surveyIntro") goToPhase("wheel");
        return;
      }

      // **문항 조회까지 가려야 한다.** 이쪽도 "empty"/"failed"면 룰렛으로 보내므로,
      // 여기서 오버레이를 걷으면 설문 독려 화면이 그 사이에 다시 번쩍인다.
      const outcome = await loadQuestions(pending.questionIds);
      // "empty"(문항 0건)와 "failed"(조회 실패) 모두 룰렛으로 보낸다 — 설문을 못
      // 불러왔다고 쿠폰 기회까지 막으면 사용자에게 더 큰 손해다. 다만 "failed"는
      // 콘솔에만 남던 것을 여기서 구분해 기록한다.
      if (outcome === "failed") {
        console.error(
          "[enterSurveyFlow] 설문 문항 조회 실패 — 설문을 건너뛰고 룰렛으로 진행한다."
        );
      }
      if (outcome !== "shown" && phaseRef.current === "surveyIntro") {
        goToPhase("wheel");
      }
    } finally {
      // 어느 경로로 빠져나가든 반드시 걷는다 — 남으면 설문 화면 위에 오버레이가 얹힌다.
      setSurveyGateWaiting(false);
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

  /**
   * 조회를 기다리지 않고 **먼저 화면을 바꾼다**(2026-08-15, 이란토 실기 제보).
   *
   * 예전에는 `await refreshCoupons()` 뒤에 전환해서, 기다리는 동안 화면이 아무 말도
   * 하지 않았다. 그래서 사용자가 여러 번 눌렀고 **눌린 횟수만큼 전환이 큐에 쌓여
   * 다른 페이지로 이동한 뒤에도 보관함이 계속 떴다.**
   *
   * 호출부가 세 곳이므로(시작 화면·뽑기 거절·오늘의 결과) 버튼마다 `disabled`를 다는
   * 방식은 쓰지 않는다 — 세 곳에 흩어지면 언젠가 하나가 빠진다. 여기 한 곳에서 막는다.
   *
   * **가드는 화면 전환이 아니라 조회에만 건다.** 전환보다 앞에 두면 조회가 끝나기 전에
   * 앨범을 닫고 다시 여는 경로에서(`onClose`는 아무것도 기다리지 않는다) 가드가 아직
   * 켜져 있어 **버튼이 죽는다** — 느린 네트워크일수록 그 창이 길어지므로, 애초에
   * 문제였던 "눌렀는데 아무 일도 안 일어난다"를 그대로 되살리는 셈이다.
   * 전환은 멱등하고 비용이 없으니 언제나 연다.
   * ref인 이유는 state로 두면 리렌더가 한 박자 늦어 그 사이의 연타를 못 막기 때문이다.
   */
  const couponsLoadingRef = useRef(false);
  const [couponsLoading, setCouponsLoading] = useState(false);

  const openMyCoupons = useCallback(
    async (returnTo: GamePhase = "start") => {
      setMyCouponsReturnPhase(returnTo);
      goToPhase("myCoupons");
      if (couponsLoadingRef.current) return;
      couponsLoadingRef.current = true;
      setCouponsLoading(true);
      try {
        await refreshCoupons();
      } finally {
        couponsLoadingRef.current = false;
        setCouponsLoading(false);
      }
    },
    [goToPhase, refreshCoupons]
  );

  return (
    <div className="min-h-dvh">
      {/* 시간대 배경. **여기 한 곳에만 둔다** — 화면마다 붙이면 화면이 늘어날 때
          반드시 하나를 빠뜨린다. 게임 중에만 가려지는데, 그것은 이 컴포넌트가 phase를
          보는 것이 아니라 `GameScreen`이 불투명한 `bg-bg`로 덮기 때문이다(2026-08-15
          이란토). 따라서 **다른 화면들은 배경을 칠하지 말아야 한다.**

          **이 루트에 배경색을 칠하지 말 것.** `DaylightBackground`가 `-z-10`이라
          **부모의 배경보다도 아래**로 내려간다 — 여기에 `bg-bg`(또는 `bg-black`)를
          주면 사진이 그 색에 완전히 가려져 아예 보이지 않는다. 실제로 한 번 그렇게
          만들었고, DOM에는 레이어가 멀쩡히 있어서 검사로는 잡히지 않았다(2026-08-15).
          폴백 색은 레이어 안쪽이 들고 있다. */}
      <DaylightBackground />
      {/* 최초 고지가 열려 있는 동안에는 열람용을 띄우지 않는다 — 겹치면 같은 창이
          두 겹으로 쌓인다. 최초 고지 쪽이 우선이다(먼저 확인해야 하는 것이므로). */}
      {showTerm && <LegalNotice firstRun onClose={acknowledgeTerm} />}
      {!showTerm && showLegalReview && (
        <LegalNotice firstRun={false} onClose={() => setShowLegalReview(false)} />
      )}
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
          onOpenLegal={() => setShowLegalReview(true)}
        />
      )}

      {game.phase === "tutorial" && (
        <TutorialScreen
          mode={tutorialMode}
          preloadStatus={game.preloadStatus}
          loadError={game.loadError}
          onRetryPreload={game.retryPreload}
          drawLimitNotice={drawLimitNotice}
          onFinish={finishTutorial}
          onExit={exitTutorial}
        />
      )}

      {game.phase === "loading" && (
        <PreloadScreen
          loadError={game.loadError}
          onRetry={game.retryPreload}
          onGoToStart={game.resetToStart}
        />
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

          phase 자체는 그대로 playing을 벗어난다 — 180초 타이머 가드
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
        <>
          {/* 판정이 끝날 때까지 **설문 안내를 그리지 않는다.** 뽑기 화면과 같은 대기
              오버레이를 쓴다 — 게임 안의 "서버를 기다리는 화면"은 전부 같은 모양이다.

              예전에는 안내 화면을 그대로 둔 채 오버레이만 얹었는데, `GatchaLoading`이
              배경을 칠하지 않아(시간대 배경이 비쳐야 한다) **'불러오는 중' 창 뒤로
              설문 독려 화면이 그대로 비쳤다**(2026-08-17 제보). 안 해도 될 설문을
              권하는 화면이 미리 보이는 것이라 잘못된 안내이기도 하다.
              스크림으로 덮지 말 것 — 시간대 배경까지 덮인다(`WheelScreen` 주석). */}
          {surveyGateWaiting ? (
            <GatchaLoading variant="waiting" />
          ) : (
            <SurveyIntroScreen
              onParticipate={() => goToPhase("survey")}
              onDecline={declineSurvey}
            />
          )}
        </>
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
          /* 거절당했을 때 보관함으로 안내할지 판정한다(WheelScreen의 rejected 분기).
             `spin()`이 거절 직후 목록을 이미 읽어 `coupon.coupons`에 담아둔다. */
          hasCoupons={coupon.coupons.length > 0}
          /* 돌아올 곳을 'wheel'로 준다 — 여기서 열었으므로 닫으면 이 화면으로
             되돌아와야 '다음'을 눌러 흐름을 계속 진행할 수 있다. 기본값('start')으로
             두면 결과 흐름 중간에서 시작 화면으로 튕긴다. */
          onOpenMyCoupons={() => openMyCoupons("wheel")}
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
          loading={couponsLoading}
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
