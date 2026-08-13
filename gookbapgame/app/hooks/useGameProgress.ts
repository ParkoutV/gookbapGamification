"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchGameData, GameSession } from "../actions";
import { preloadAllStages } from "../lib/preloadGame";
import type { LoadError } from "../lib/preloadGame";
import {
  STAGE_CONFIG,
  GLOBAL_TIME_LIMIT_SEC,
  HINT_LIMIT_PER_GAME,
  calcComboBonusForStreak,
  calcFinalScore,
  calcGukbapTier,
  ScoreBreakdown,
  GukbapTier,
  LevelResult,
} from "../lib/stageConfig";
import { ensureParticipant, reassignNickname as reassignNicknameAction, recordGameStart, submitGameScore } from "../actions";
import type { GameEndReason } from "../lib/gameEnd";
import type { Nickname } from "../lib/nicknameParts";

export type GamePhase =
  | "start"
  | "tutorial"
  | "loading"
  | "playing"
  // 게임이 끝난 직후 GAME OVER / CLEAR를 보여주는 구간. 자동으로 넘어가지 않고
  // 사용자가 '결과 확인'을 눌러야 gameResult로 간다.
  //
  // 카운트다운(isCountingDown)은 playing 안의 불리언인데 이쪽만 별도 phase인
  // 이유는 각자 얻는 불변식이 다르기 때문이다. 카운트다운은 뒤에 GameScreen이
  // 보여야 해서 playing을 유지해야 하고(별도 phase면 렌더 조건이 무너진다),
  // 종료는 반대로 300초 타이머가 멈춰야 해서 playing을 벗어나는 편이 공짜다
  // (타이머 이펙트의 `phase !== "playing"` 가드가 그대로 처리한다).
  | "gameEnd"
  | "gameResult"
  | "surveyIntro"
  | "survey"
  | "wheel"
  | "dailyResult"
  | "myCoupons"
  // 시작 화면에서 열고 닫으면 시작 화면으로 돌아온다. 게임 진행과 무관한 조회 화면이라
  // 이 훅의 다른 상태(session·scoreBreakdown 등)를 건드리지 않는다.
  | "ranking";

/**
 * 프리로드의 진행 상태. "화면 전환"과 분리된 값이라는 점이 핵심이다.
 *
 * 예전에는 runPreload가 완료 시 곧바로 setPhase("playing")을 호출해서
 * "프리로드 완료 = 게임 시작"이었다. 튜토리얼을 병렬로 띄우려면 이 둘이
 * 분리되어야 한다 — 안 그러면 프리로드가 끝나는 순간 튜토리얼을 읽던
 * 사용자가 게임으로 튕겨나간다.
 */
export type PreloadStatus = "idle" | "loading" | "ready" | "error";

function countDifferences(session: GameSession): number {
  return session.slots.filter((s) => s.isDifference).length;
}

export function useGameProgress(trackId: string | null) {
  const [phase, setPhase] = useState<GamePhase>("start");
  /*
   * 문자열이 아니라 조립 전 재료다. 화면이 렌더 시점에 로케일로 고른다
   * (`formatNickname`) — 여기서 문자열로 확정하면 언어 토글에 따라오지 않는다.
   * 초기값은 아직 아무것도 못 받은 상태이므로 빈 문자열 형태로 둔다.
   */
  const [nickname, setNickname] = useState<Nickname>({ text: "" });
  const [isRegenerating, setIsRegenerating] = useState(false);
  const nicknameSyncedRef = useRef(false);
  const [stageIndex, setStageIndex] = useState(0);
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [loadNonce, setLoadNonce] = useState(0);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [preloadStatus, setPreloadStatus] = useState<PreloadStatus>("idle");
  // runPreload의 세대 번호. X로 튜토리얼을 나갔다가 곧바로 다시 시작하면
  // runPreload가 두 번 in-flight로 겹칠 수 있다(예전에는 재시도 버튼이 유일한
  // 재진입 경로였고, 그 버튼은 첫 요청이 실패로 끝난 뒤에만 렌더되어 겹칠 일이
  // 없었다). 늦게 끝난 쪽이 이미 playing 중인 sessions/loadNonce를 덮어쓰면
  // 플레이 도중 그림이 갈리고 GameScreen이 리마운트된다. 각 호출이 진입 시
  // 세대를 증가시켜 자기 세대를 기억해두고, await 이후 그 세대가 여전히
  // 최신인 경우에만 setState한다 — 낡은 세대는 조용히 버린다.
  const preloadGenerationRef = useRef(0);

  const [remainingTimeSec, setRemainingTimeSec] = useState(GLOBAL_TIME_LIMIT_SEC);
  const [levelResults, setLevelResults] = useState<LevelResult[]>([]);
  const [totalWrongTouches, setTotalWrongTouches] = useState(0);
  const [comboBankedScore, setComboBankedScore] = useState(0);
  const [comboCurrentStreak, setComboCurrentStreak] = useState(0);
  /**
   * 이 판에서 쓴 힌트 횟수. **`GameScreen`이 아니라 여기 있는 것이 요점이다** —
   * 저쪽은 단계마다 리마운트되므로 카운터를 두면 "게임당 3회"가 아니라 "단계당 3회"가
   * 된다. `isHintOpen`은 반대로 `GameScreen`의 로컬 state가 맞다(단계가 바뀌면
   * 닫히는 게 옳은 동작).
   */
  const [hintsUsed, setHintsUsed] = useState(0);
  /** 이 판에서 힌트 설문을 이미 띄웠는지. 게임당 최초 1회만 띄운다 —
   *  "응답했는지"가 아니라 "띄웠는지"다(응답 없이 닫아도 다시 띄우지 않는다). */
  const hintSurveyShownRef = useRef(false);
  const totalAnswersRef = useRef(0);
  const currentLevelFoundCountRef = useRef(0);

  // finishGame이 (GameScreen의 setTimeout처럼) 임의로 낡을 수 있는 클로저에서 호출되더라도
  // 항상 "지금 이 순간의 진짜 값"을 읽도록, 아래 4개 state는 ref로도 함께 미러링해둔다.
  // ref는 객체 identity가 바뀌지 않으므로 클로저가 몇 번째 렌더의 것이든 상관없이 최신값을 가리킨다.
  const remainingTimeSecRef = useRef(GLOBAL_TIME_LIMIT_SEC);
  const totalWrongTouchesRef = useRef(0);
  const comboBankedScoreRef = useRef(0);
  const comboCurrentStreakRef = useRef(0);

  const [scoreBreakdown, setScoreBreakdown] = useState<ScoreBreakdown | null>(null);
  const [gukbapTier, setGukbapTier] = useState<GukbapTier | null>(null);
  const [endReason, setEndReason] = useState<GameEndReason | null>(null);

  /**
   * 3 → 2 → 1 → START 카운트다운 중인가. **playing 안의 불리언이다.**
   *
   * 별도 phase로 만들면 page.tsx의 `phase === "playing" && session` 렌더 조건에
   * 걸려 뒤에 GameScreen이 보이지 않는다(오버레이 방식이 요구사항).
   *
   * 대신 300초 타이머가 이 구간에 흐르지 않도록 타이머 이펙트의 가드를 이 값까지
   * 넓혔다 — 그게 playing을 유지하는 대가로 치르는 유일한 추가 가드다.
   */
  const [isCountingDown, setIsCountingDown] = useState(false);

  const session = sessions[stageIndex] ?? null;

  useEffect(() => {
    let cancelled = false;
    void ensureParticipant(trackId).then((result) => {
      if (cancelled) return;
      setNickname(result.nickname);
      nicknameSyncedRef.current = result.nicknameSynced;
    });
    return () => {
      cancelled = true;
    };
  }, [trackId]);

  const buildLevelResult = useCallback(
    (foundCount: number): LevelResult => ({
      pointPool: STAGE_CONFIG[stageIndex].pointPool,
      foundCount,
      actualDiffCount: session ? countDifferences(session) : 0,
    }),
    [stageIndex, session]
  );

  // finishGame은 levelResults를 state 클로저로 읽지 않는다 — 호출부가 방금 큐잉한 항목까지
  // 합쳐서 명시적으로 넘긴다. state를 그대로 읽으면 "같은 이벤트 안에서 setLevelResults 직후
  // 바로 finishGame을 호출"하는 경로(handleForceAdvance가 마지막 레벨일 때)에서 그 setState가
  // 아직 커밋되지 않은 값을 쓰게 되어 마지막 레벨 점수가 누락되는 버그가 있었다.
  //
  // 시간/오답/콤보 4개 값은 state가 아니라 ref(remainingTimeSecRef 등)에서 읽는다. GameScreen의
  // registerWrongTouch는 3번째 오답에서 onWrongTouch()를 동기 호출한 직후 같은 함수 안에서
  // setTimeout(() => onForceAdvance(...), 400)을 예약하는데, 이 화살표 함수가 캡처하는
  // onForceAdvance(→ finishGame)는 onWrongTouch()로 인한 리렌더가 커밋되기 "이전" 렌더의
  // 클로저다. 그 클로저가 state를 직접 읽으면 400ms 뒤 실행될 때 3번째 오답 반영 전
  // totalWrongTouches와 최대 1틱 밀린 remainingTimeSec을 읽어 마지막 레벨 강제진행 시
  // wrongTouchPenalty가 10점 부족하게 계산되는 문제가 있었다. ref는 객체 identity가 바뀌지
  // 않으므로 아무리 오래된(stale) 클로저에서 .current를 읽어도 항상 최신값이 나온다.
  //
  // reason은 추론하지 않고 호출부에서 받는다(app/lib/gameEnd.ts 주석 참고).
  const finishGame = useCallback(
    (levelsReached: number, finalLevelResults: LevelResult[], reason: GameEndReason) => {
      const breakdown = calcFinalScore({
        levelResults: finalLevelResults,
        elapsedSec: GLOBAL_TIME_LIMIT_SEC - remainingTimeSecRef.current,
        totalWrongTouches: totalWrongTouchesRef.current,
        comboBankedScore: comboBankedScoreRef.current,
        comboCurrentStreak: comboCurrentStreakRef.current,
        comboTotalAnswers: totalAnswersRef.current,
        levelsReached,
      });
      setScoreBreakdown(breakdown);
      setGukbapTier(calcGukbapTier(breakdown.total));
      // 점수 기록은 결과 화면을 막지 않는다(await하지 않는다). 다만 쿠폰 뽑기가
      // 이 기록을 근거로 확률 구간을 고르므로, 룰렛 진입 전에는 들어가 있어야 한다.
      void submitGameScore(breakdown.total);
      // 결과표로 바로 가지 않는다 — GAME OVER / CLEAR를 먼저 보여주고,
      // 사용자가 '결과 확인'을 누르면 그때 gameResult로 넘어간다.
      setEndReason(reason);
      setPhase("gameEnd");
    },
    []
  );

  // 전체 300초 단일 타이머: playing 구간 내내 흐르고, 0이 되면 그 자리에서 즉시 종료한다.
  // 타임아웃되면 그 순간 진행 중이던 레벨에서 찾은 정답(currentLevelFoundCountRef)을 합성한
  // LevelResult를 만들어 반드시 점수에 포함시킨다 — 그렇지 않으면 "그때까지 찾은 정답은
  // 인정한다"는 스펙을 어기고 그 레벨이 0점 처리된다.
  //
  // 카운트다운(3 → 2 → 1 → START) 중에는 흐르지 않는다. 이 가드가 없으면
  // 시작 연출을 보는 동안 제한시간이 깎여 나간다.
  useEffect(() => {
    if (phase !== "playing" || isCountingDown) return;
    if (remainingTimeSec <= 0) {
      finishGame(
        stageIndex + 1,
        [...levelResults, buildLevelResult(currentLevelFoundCountRef.current)],
        "timeout"
      );
      return;
    }
    const timer = setInterval(() => {
      setRemainingTimeSec((prev) => {
        const next = prev - 1;
        remainingTimeSecRef.current = next;
        return next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, isCountingDown, remainingTimeSec, stageIndex, levelResults, buildLevelResult, finishGame]);

  // 리셋(setPreloadStatus("loading"))을 startGame이 아니라 여기 첫 문장에 두는 이유:
  // 호출자마다 리셋을 기억해야 하는 구조면 언젠가 빠진다. retryPreload를 포함한
  // 모든 호출자가 자동으로 같은 보장을 받게 한다.
  //
  // 리셋이 왜 필요한가: startGame은 sessions를 비우지 않고, page.tsx의 leaveDrawFlow는
  // sessions를 든 채로 start phase로 돌아올 수 있다. status가 "ready"로 남아 있으면
  // 두 번째 판이 직전 판의 스테이지 데이터로 시작된다.
  //
  // 경합은 없다: startGame이 setPhase(...)를 호출한 직후 동기적으로 runPreload를 부르고,
  // runPreload는 첫 await 이전에 이 setState를 실행한다. 같은 React 배치에 들어가므로
  // phase === "loading" && preloadStatus === "ready"인 중간 렌더가 존재하지 않는다.
  // 불변식: preloadStatus === "error"와 loadError !== null은 항상 함께 성립해야 한다.
  // 이 둘은 서로 다른 소비자가 같은 에러 UI를 켜는 근거다 —
  // PreloadScreen은 loadError의 유무로, TutorialScreen은 preloadStatus === "error"로 판단한다.
  // 한쪽만 세팅하는 수정이 들어오면(예: 재시도 로직 리팩터링) 한쪽 화면은 에러 문구 없이
  // 재시도 버튼만 뜨거나, 문구는 뜨는데 재시도 버튼이 없는 상태로 조용히 깨진다.
  const runPreload = useCallback(async () => {
    const generation = ++preloadGenerationRef.current;
    setLoadError(null);
    setPreloadStatus("loading");
    const result = await preloadAllStages(fetchGameData);
    // 대기하는 동안 더 최신 runPreload가 시작됐다면 이 결과는 낡은 것이다.
    // 최신 세대가 이미 자기 몫의 loading/sessions/preloadStatus를 세팅해뒀으므로
    // 여기서는 아무것도 하지 않고 그냥 반환한다.
    if (generation !== preloadGenerationRef.current) return;
    if (result.ok) {
      setSessions(result.sessions);
      totalAnswersRef.current = result.sessions.reduce((sum, s) => sum + countDifferences(s), 0);
      setLoadNonce((n) => n + 1);
      setPreloadStatus("ready");
    } else {
      setLoadError({ key: result.key, params: result.params });
      setPreloadStatus("error");
    }
  }, []);

  // 게임 진입의 자동 경로는 여기 한 곳만 담당한다.
  // phase가 "loading"일 때만 작동하므로, 튜토리얼(phase === "tutorial") 중에
  // 프리로드가 끝나도 사용자를 끌어가지 않는다. 튜토리얼에서의 진입은
  // 사용자가 "시작하기"를 누를 때 page.tsx가 goToPhase("playing")으로 처리한다.
  useEffect(() => {
    if (phase === "loading" && preloadStatus === "ready") {
      setPhase("playing");
    }
  }, [phase, preloadStatus]);

  // KPI 2단계(게임 시작/재도전). startGame이 아니라 phase가 실제로 "playing"이
  // 되는 순간에 센다 — startGame은 튜토리얼 진입도 포함해서 불리므로, 거기 걸면
  // 튜토리얼에서 X를 눌러 이탈한 사람까지 게임 시작자로 잡혀 시작률이 부풀어 오른다.
  //
  // 진입 경로가 여럿이라(프리로드 완료, 튜토리얼 완주, 재시작) 각 호출부에 흩어
  // 배선하면 언젠가 하나가 빠진다. phase 전이 자체를 한 곳에서 감지한다.
  //
  // **카운트다운도 같은 전이에 건다.** "playing이 되는 순간"이 아니라 "playing으로
  // 새로 들어오는 순간"이어야 한다 — handleForceAdvance가 다음 단계로 갈 때마다
  // setPhase("playing")을 부르므로 단순히 phase === "playing"에 걸면 단계마다
  // 카운트다운이 재발동해서 한 판에 여러 번 뜬다. wasPlayingRef가 이미 그 함정을
  // 피하고 있으니 판별을 새로 만들지 않고 얹는다(이미 playing이면 React가 setPhase를
  // bail out해서 이 이펙트가 재실행되지도 않는다).
  //
  // KPI(game_start)는 카운트다운이 **끝난 뒤**가 아니라 이 전이에서 센다.
  // 카운트다운 오버레이가 뜬 시점에 이미 게임 화면에 진입했으므로(게임판이 뒤에
  // 보인다) 여기가 "게임 시작"이다. 종료 시점으로 미루면 3.2초 안에 이탈한 사람이
  // 빠져 **다른 것을 세게 된다** — 그건 시작자가 아니라 완주 의향자에 가깝다.
  // 코드가 KPI 정의를 조용히 바꾸면 대시보드 수치가 이유 없이 떨어지고 나중에
  // 원인을 추적할 수 없다(2026-08-11, 이란토).
  const wasPlayingRef = useRef(false);
  useEffect(() => {
    const isPlaying = phase === "playing";
    if (isPlaying && !wasPlayingRef.current) {
      setIsCountingDown(true);
      void recordGameStart();
    }
    wasPlayingRef.current = isPlaying;
  }, [phase]);

  // 카운트다운 종료. 게이트만 연다 — KPI는 위에서 이미 셌다.
  const endCountdown = useCallback(() => {
    setIsCountingDown(false);
  }, []);

  // withTutorial이면 튜토리얼로 진입하고, 프리로드는 그 뒤에서 병렬로 돈다.
  // 아니면 기존과 동일하게 로딩 화면으로 간다(재방문자 경로).
  //
  // 기본값을 false로 둔 이유는 호출부를 아직 안 고쳤을 때 기존 동작이 유지되게
  // 하려는 것이다. 튜토리얼 배선은 page.tsx에서 별도로 한다.
  const startGame = useCallback(
    (withTutorial: boolean = false) => {
      setPhase(withTutorial ? "tutorial" : "loading");
      setStageIndex(0);
      setRemainingTimeSec(GLOBAL_TIME_LIMIT_SEC);
      remainingTimeSecRef.current = GLOBAL_TIME_LIMIT_SEC;
      setLevelResults([]);
      setTotalWrongTouches(0);
      totalWrongTouchesRef.current = 0;
      setComboBankedScore(0);
      comboBankedScoreRef.current = 0;
      setComboCurrentStreak(0);
      comboCurrentStreakRef.current = 0;
      currentLevelFoundCountRef.current = 0;
      setHintsUsed(0);
      hintSurveyShownRef.current = false;
      setScoreBreakdown(null);
      setGukbapTier(null);
      setEndReason(null);

      if (!nicknameSyncedRef.current) {
        void reassignNicknameAction().then((result) => {
          setNickname(result.nickname);
          nicknameSyncedRef.current = result.nicknameSynced;
        });
      }

      void runPreload();
    },
    [runPreload]
  );

  const retryPreload = useCallback(() => {
    void runPreload();
  }, [runPreload]);

  const regenerateNickname = useCallback(() => {
    setIsRegenerating(true);
    void reassignNicknameAction()
      .then((result) => {
        setNickname(result.nickname);
        nicknameSyncedRef.current = result.nicknameSynced;
      })
      .finally(() => setIsRegenerating(false));
  }, []);

  const recordCorrectFind = useCallback(() => {
    setComboCurrentStreak((prev) => {
      const next = prev + 1;
      comboCurrentStreakRef.current = next;
      return next;
    });
    currentLevelFoundCountRef.current += 1;
  }, []);

  /** 힌트 1회 차감. 클립보드가 실제로 열리는 시점에만 부른다 — 설문을 응답 없이
   *  닫은 경우는 힌트를 받지 못했으므로 차감하지 않는다. */
  const consumeHint = useCallback(() => {
    setHintsUsed((prev) => prev + 1);
  }, []);

  /** 설문을 띄웠다고 표시한다. **첫 await 이전에** 부르는 것이 요점이다 —
   *  조회를 기다리는 동안 '?'를 다시 누르면 오버레이가 두 개 뜬다. */
  const markHintSurveyShown = useCallback(() => {
    if (hintSurveyShownRef.current) return false;
    hintSurveyShownRef.current = true;
    return true;
  }, []);

  const recordWrongTouch = useCallback(() => {
    setTotalWrongTouches((prev) => {
      const next = prev + 1;
      totalWrongTouchesRef.current = next;
      return next;
    });
    setComboBankedScore((prev) => {
      const next = prev + calcComboBonusForStreak(comboCurrentStreak, totalAnswersRef.current);
      comboBankedScoreRef.current = next;
      return next;
    });
    setComboCurrentStreak(0);
    comboCurrentStreakRef.current = 0;
  }, [comboCurrentStreak]);

  // 마지막 레벨에서 강제진행되는 경우, 방금 조립한 updatedLevelResults를 finishGame에
  // "직접" 넘긴다 — setLevelResults(state) 갱신을 기다렸다가 다시 읽지 않는다(그게 문제 1의 원인이었다).
  const advanceStage = useCallback(
    (foundCount: number, reason: GameEndReason) => {
      const updatedLevelResults = [...levelResults, buildLevelResult(foundCount)];
      setLevelResults(updatedLevelResults);
      currentLevelFoundCountRef.current = 0;

      const nextIndex = stageIndex + 1;
      if (nextIndex < STAGE_CONFIG.length) {
        setStageIndex(nextIndex);
        setPhase("playing");
        return;
      }
      // 중간 단계의 이유는 의미가 없다 — 마지막 단계에서 끝날 때만 화면에 쓰인다.
      finishGame(STAGE_CONFIG.length, updatedLevelResults, reason);
    },
    [stageIndex, levelResults, buildLevelResult, finishGame]
  );

  // 정답을 다 맞힌 경우와 오답 기회를 다 쓴 경우의 **처리는 여전히 같다** — 둘 다
  // 축하 모달 없이 그 자리에서 다음 레벨로 넘어간다(advanceStage 하나가 처리한다).
  // 예전에는 다 맞히면 "stageClear" phase로 가서 StageTransitionModal의 "다음"
  // 버튼을 눌러야 했는데, 제한시간이 레벨당 60초에서 전체 300초로 바뀌면서 진행을
  // 멈춰 세울 이유가 없어져 그 단계를 걷어냈다.
  //
  // 다만 예전처럼 `const handleStageClear = handleForceAdvance`로 **별칭을 두지는
  // 않는다.** 별칭이면 종료 사유가 소실되어 GAME OVER / CLEAR를 고를 근거가 사라진다
  // — page.tsx가 두 경로를 별개 prop으로 넘겨 이미 사실을 알고 있으므로, 그 사실을
  // 여기서 버리지 말고 흘려보낸다. 갈리는 것은 라벨뿐이다.
  const handleStageClear = useCallback(
    (foundCount: number) => advanceStage(foundCount, "cleared"),
    [advanceStage]
  );
  const handleForceAdvance = useCallback(
    (foundCount: number) => advanceStage(foundCount, "wrongTouchExhausted"),
    [advanceStage]
  );

  const proceedToDailyResult = useCallback(() => setPhase("dailyResult"), []);
  const goToPhase = useCallback((next: GamePhase) => setPhase(next), []);

  // preloadStatus를 여기서 리셋하지 않는 것은 의도다. 그 전제는 "loading" phase
  // 진입이 startGame을 통해서만 일어난다는 것 — startGame이 phase를 세팅한 직후
  // 동기적으로 runPreload를 부르고, runPreload가 첫 await 이전에 preloadStatus를
  // "loading"으로 리셋하므로 여기서 손댈 필요가 없다.
  // goToPhase("loading")을 직접 호출하는 코드를 추가하지 말 것 — 그 경로는 이 전제를
  // 깨서, preloadStatus가 직전 판의 "ready"로 남아 있는 채로 위 자동 전환 useEffect가
  // 즉시 phase를 "playing"으로 보내고, 아직 비어 있지 않은 직전 판의 sessions로 게임이
  // 시작된다.
  const resetToStart = useCallback(() => {
    setPhase("start");
    setStageIndex(0);
    setSessions([]);
    setRemainingTimeSec(GLOBAL_TIME_LIMIT_SEC);
    remainingTimeSecRef.current = GLOBAL_TIME_LIMIT_SEC;
    setLevelResults([]);
    setTotalWrongTouches(0);
    totalWrongTouchesRef.current = 0;
    setComboBankedScore(0);
    comboBankedScoreRef.current = 0;
    setComboCurrentStreak(0);
    comboCurrentStreakRef.current = 0;
    currentLevelFoundCountRef.current = 0;
    setHintsUsed(0);
    hintSurveyShownRef.current = false;
    setScoreBreakdown(null);
    setGukbapTier(null);
    setEndReason(null);
    // 시작 화면으로 되돌아갔다면 다음 판은 카운트다운부터 다시 시작한다.
    // (wasPlayingRef는 phase가 "start"가 되면서 이 뒤 이펙트에서 false로 내려간다.)
    setIsCountingDown(false);
  }, []);

  return {
    phase,
    nickname,
    regenerateNickname,
    isRegenerating,
    stageNumber: stageIndex + 1,
    loadNonce,
    totalStages: STAGE_CONFIG.length,
    remainingTimeSec,
    session,
    loadError,
    preloadStatus,
    scoreBreakdown,
    gukbapTier,
    endReason,
    isCountingDown,
    endCountdown,
    hintsRemaining: HINT_LIMIT_PER_GAME - hintsUsed,
    consumeHint,
    markHintSurveyShown,
    startGame,
    retryPreload,
    recordCorrectFind,
    recordWrongTouch,
    handleStageClear,
    handleForceAdvance,
    proceedToDailyResult,
    goToPhase,
    resetToStart,
  };
}
