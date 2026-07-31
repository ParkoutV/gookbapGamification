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
import { ensureParticipant, reassignNickname as reassignNicknameAction } from "../actions";

export type GamePhase =
  | "start"
  | "loading"
  | "playing"
  | "stageClear"
  | "gameResult"
  | "wheel"
  | "dailyResult";

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

  const finishGame = useCallback(
    (levelsReached: number) => {
      const breakdown = calcFinalScore({
        levelResults,
        elapsedSec: GLOBAL_TIME_LIMIT_SEC - remainingTimeSec,
        totalWrongTouches,
        comboBankedScore,
        comboCurrentStreak,
        comboTotalAnswers: totalAnswersRef.current,
        levelsReached,
      });
      setScoreBreakdown(breakdown);
      setGukbapTier(calcGukbapTier(breakdown.total));
      setPhase("gameResult");
    },
    [levelResults, remainingTimeSec, totalWrongTouches, comboBankedScore, comboCurrentStreak]
  );

  // 전체 300초 단일 타이머: playing/stageClear 구간 내내 흐르고, 0이 되면 그 자리에서 즉시 종료한다.
  // (stageClear 모달을 오래 띄워두는 것으로 시간을 버는 것을 막기 위해 이 구간도 타이머를 멈추지 않는다.)
  useEffect(() => {
    if (phase !== "playing" && phase !== "stageClear") return;
    if (remainingTimeSec <= 0) {
      finishGame(stageIndex + 1);
      return;
    }
    const timer = setInterval(() => {
      setRemainingTimeSec((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, remainingTimeSec, stageIndex, finishGame]);

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
    setLevelResults([]);
    setTotalWrongTouches(0);
    setComboBankedScore(0);
    setComboCurrentStreak(0);
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
    setComboCurrentStreak((prev) => prev + 1);
  }, []);

  const recordWrongTouch = useCallback(() => {
    setTotalWrongTouches((prev) => prev + 1);
    setComboBankedScore(
      (prev) => prev + calcComboBonusForStreak(comboCurrentStreak, totalAnswersRef.current)
    );
    setComboCurrentStreak(0);
  }, [comboCurrentStreak]);

  const recordLevelResult = useCallback(
    (foundCount: number) => {
      setLevelResults((prev) => [
        ...prev,
        {
          pointPool: STAGE_CONFIG[stageIndex].pointPool,
          foundCount,
          actualDiffCount: session ? countDifferences(session) : 0,
        },
      ]);
    },
    [stageIndex, session]
  );

  const goToNextLevelOrFinish = useCallback(() => {
    const nextIndex = stageIndex + 1;
    if (nextIndex < STAGE_CONFIG.length) {
      setStageIndex(nextIndex);
      setPhase("playing");
      return;
    }
    finishGame(STAGE_CONFIG.length);
  }, [stageIndex, finishGame]);

  const handleStageClear = useCallback(
    (foundCount: number) => {
      recordLevelResult(foundCount);
      setPhase("stageClear");
    },
    [recordLevelResult]
  );

  const advanceToNextStage = useCallback(() => {
    goToNextLevelOrFinish();
  }, [goToNextLevelOrFinish]);

  const handleForceAdvance = useCallback(
    (foundCount: number) => {
      recordLevelResult(foundCount);
      goToNextLevelOrFinish();
    },
    [recordLevelResult, goToNextLevelOrFinish]
  );

  const proceedToWheel = useCallback(() => setPhase("wheel"), []);
  const proceedToDailyResult = useCallback(() => setPhase("dailyResult"), []);

  const resetToStart = useCallback(() => {
    setPhase("start");
    setStageIndex(0);
    setSessions([]);
    setRemainingTimeSec(GLOBAL_TIME_LIMIT_SEC);
    setLevelResults([]);
    setTotalWrongTouches(0);
    setComboBankedScore(0);
    setComboCurrentStreak(0);
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
    proceedToWheel,
    proceedToDailyResult,
    resetToStart,
  };
}
