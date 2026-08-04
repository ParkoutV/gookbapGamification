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
  | "loading"
  | "playing"
  | "stageClear"
  | "gameResult"
  | "surveyIntro"
  | "survey"
  | "wheel"
  | "dailyResult"
  | "myCoupons";

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

  // 전체 300초 단일 타이머: playing/stageClear 구간 내내 흐르고, 0이 되면 그 자리에서 즉시 종료한다.
  // phase가 "playing"일 때 타임아웃되면, 그 순간 진행 중이던 레벨에서 찾은 정답
  // (currentLevelFoundCountRef)을 합성한 LevelResult를 만들어 반드시 점수에 포함시킨다 —
  // 그렇지 않으면 "그때까지 찾은 정답은 인정한다"는 스펙을 어기고 그 레벨이 0점 처리된다.
  // phase가 "stageClear"일 때 타임아웃되면 그 레벨은 이미 handleStageClear가 levelResults에
  // 기록했으므로 추가로 합성하지 않는다(중복 계상 방지).
  useEffect(() => {
    if (phase !== "playing" && phase !== "stageClear") return;
    if (remainingTimeSec <= 0) {
      if (phase === "playing") {
        finishGame(stageIndex + 1, [...levelResults, buildLevelResult(currentLevelFoundCountRef.current)]);
      } else {
        finishGame(stageIndex + 1, levelResults);
      }
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

  const runPreload = useCallback(async () => {
    setLoadError(null);
    const result = await preloadAllStages(fetchGameData);
    if (result.ok) {
      setSessions(result.sessions);
      totalAnswersRef.current = result.sessions.reduce((sum, s) => sum + countDifferences(s), 0);
      setLoadNonce((n) => n + 1);
      setPhase("playing");
    } else {
      setLoadError({ key: result.key, params: result.params });
    }
  }, []);

  const startGame = useCallback(() => {
    setPhase("loading");
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
  }, [runPreload]);

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

  const handleStageClear = useCallback(
    (foundCount: number) => {
      setLevelResults((prev) => [...prev, buildLevelResult(foundCount)]);
      setPhase("stageClear");
    },
    [buildLevelResult]
  );

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

  // "다음" 버튼 클릭은 handleStageClear가 levelResults를 커밋한 뒤(별도 렌더/커밋 사이클)
  // 일어나는 별개의 이벤트이므로, 여기서는 state를 그대로 읽어도 안전하다(stale 문제 없음).
  const advanceToNextStage = useCallback(() => {
    currentLevelFoundCountRef.current = 0;
    const nextIndex = stageIndex + 1;
    if (nextIndex < STAGE_CONFIG.length) {
      setStageIndex(nextIndex);
      setPhase("playing");
      return;
    }
    finishGame(STAGE_CONFIG.length, levelResults);
  }, [stageIndex, levelResults, finishGame]);

  const proceedToDailyResult = useCallback(() => setPhase("dailyResult"), []);
  const goToPhase = useCallback((next: GamePhase) => setPhase(next), []);

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
    scoreBreakdown,
    gukbapTier,
    startGame,
    retryPreload,
    recordCorrectFind,
    recordWrongTouch,
    handleStageClear,
    handleForceAdvance,
    advanceToNextStage,
    proceedToDailyResult,
    goToPhase,
    resetToStart,
  };
}
