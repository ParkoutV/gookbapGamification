"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchGameData, GameSession } from "../actions";
import { preloadAllStages } from "../lib/preloadGame";
import type { LoadError } from "../lib/preloadGame";
import {
  STAGE_CONFIG,
  GLOBAL_TIME_LIMIT_SEC,
  calcComboBonusForStreak,
  calcFinalScore,
  calcGukbapTier,
  ScoreBreakdown,
  GukbapTier,
  LevelResult,
} from "../lib/stageConfig";
import { ensureParticipant, reassignNickname as reassignNicknameAction, submitGameScore } from "../actions";

export type GamePhase =
  | "start"
  | "tutorial"
  | "loading"
  | "playing"
  | "gameResult"
  | "surveyIntro"
  | "survey"
  | "wheel"
  | "dailyResult"
  | "myCoupons";

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
  const [nickname, setNickname] = useState<string>("");
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
  const finishGame = useCallback(
    (levelsReached: number, finalLevelResults: LevelResult[]) => {
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
      setPhase("gameResult");
    },
    []
  );

  // 전체 300초 단일 타이머: playing 구간 내내 흐르고, 0이 되면 그 자리에서 즉시 종료한다.
  // 타임아웃되면 그 순간 진행 중이던 레벨에서 찾은 정답(currentLevelFoundCountRef)을 합성한
  // LevelResult를 만들어 반드시 점수에 포함시킨다 — 그렇지 않으면 "그때까지 찾은 정답은
  // 인정한다"는 스펙을 어기고 그 레벨이 0점 처리된다.
  useEffect(() => {
    if (phase !== "playing") return;
    if (remainingTimeSec <= 0) {
      finishGame(stageIndex + 1, [...levelResults, buildLevelResult(currentLevelFoundCountRef.current)]);
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
  }, [phase, remainingTimeSec, stageIndex, levelResults, buildLevelResult, finishGame]);

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
      setScoreBreakdown(null);
      setGukbapTier(null);

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
  const handleForceAdvance = useCallback(
    (foundCount: number) => {
      const updatedLevelResults = [...levelResults, buildLevelResult(foundCount)];
      setLevelResults(updatedLevelResults);
      currentLevelFoundCountRef.current = 0;

      const nextIndex = stageIndex + 1;
      if (nextIndex < STAGE_CONFIG.length) {
        setStageIndex(nextIndex);
        setPhase("playing");
        return;
      }
      finishGame(STAGE_CONFIG.length, updatedLevelResults);
    },
    [stageIndex, levelResults, buildLevelResult, finishGame]
  );

  // 정답을 다 맞힌 경우와 오답 기회를 다 쓴 경우의 처리가 같다 — 둘 다 축하 모달 없이
  // 그 자리에서 다음 레벨로 넘어간다. 예전에는 다 맞히면 "stageClear" phase로 가서
  // StageTransitionModal의 "다음" 버튼을 눌러야 했는데, 제한시간이 레벨당 60초에서
  // 전체 300초로 바뀌면서 진행을 멈춰 세울 이유가 없어져 그 단계를 걷어냈다.
  const handleStageClear = handleForceAdvance;

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
    setScoreBreakdown(null);
    setGukbapTier(null);
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
