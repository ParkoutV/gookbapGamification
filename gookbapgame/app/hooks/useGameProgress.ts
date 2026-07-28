"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchGameData, GameSession } from "../actions";
import { preloadAllStages } from "../lib/preloadGame";
import type { LoadError } from "../lib/preloadGame";
import {
  STAGE_CONFIG,
  calcFinalScore,
  calcGukbapTier,
  ScoreBreakdown,
  GukbapTier,
} from "../lib/stageConfig";
import {
  loadOrCreateNickname,
  regenerateNickname as regenerateStoredNickname,
} from "../lib/nickname";

export type GamePhase =
  | "start"
  | "loading"
  | "playing"
  | "stageClear"
  | "stageFail"
  | "gameResult"
  | "wheel"
  | "dailyResult";

export function useGameProgress() {
  const [phase, setPhase] = useState<GamePhase>("start");
  const [nickname, setNickname] = useState<string>("");
  const [stageIndex, setStageIndex] = useState(0);
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [loadNonce, setLoadNonce] = useState(0);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [remainingTimeByStage, setRemainingTimeByStage] = useState<number[]>([]);
  const [hadWrongTouch, setHadWrongTouch] = useState(false);
  const [scoreBreakdown, setScoreBreakdown] = useState<ScoreBreakdown | null>(null);
  const [gukbapTier, setGukbapTier] = useState<GukbapTier | null>(null);

  const session = sessions[stageIndex] ?? null;

  useEffect(() => {
    setNickname(loadOrCreateNickname());
  }, []);

  const runPreload = useCallback(async () => {
    setLoadError(null);
    const result = await preloadAllStages(fetchGameData);
    if (result.ok) {
      setSessions(result.sessions);
      setLoadNonce((n) => n + 1);
      setPhase("playing");
    } else {
      setLoadError({ key: result.key, params: result.params });
    }
  }, []);

  const startGame = useCallback(() => {
    setPhase("loading");
    setStageIndex(0);
    setRemainingTimeByStage([]);
    setHadWrongTouch(false);
    setScoreBreakdown(null);
    setGukbapTier(null);
    void runPreload();
  }, [runPreload]);

  const retryPreload = useCallback(() => {
    void runPreload();
  }, [runPreload]);

  const regenerateNickname = useCallback(() => {
    setNickname(regenerateStoredNickname());
  }, []);

  const recordWrongTouch = useCallback(() => {
    setHadWrongTouch(true);
  }, []);

  const handleStageClear = useCallback((remainingTimeSec: number) => {
    setRemainingTimeByStage((prev) => [...prev, remainingTimeSec]);
    setPhase("stageClear");
  }, []);

  const handleStageTimeout = useCallback(() => {
    setPhase("stageFail");
  }, []);

  const advanceToNextStage = useCallback(() => {
    const nextIndex = stageIndex + 1;
    if (nextIndex < STAGE_CONFIG.length) {
      setStageIndex(nextIndex);
      setLoadNonce((n) => n + 1);
      setPhase("playing");
      return;
    }
    const breakdown = calcFinalScore(remainingTimeByStage, hadWrongTouch);
    setScoreBreakdown(breakdown);
    setGukbapTier(calcGukbapTier(breakdown.total));
    setPhase("gameResult");
  }, [stageIndex, remainingTimeByStage, hadWrongTouch]);

  const retryFromStageOne = useCallback(() => {
    setStageIndex(0);
    setRemainingTimeByStage([]);
    setHadWrongTouch(false);
    setLoadNonce((n) => n + 1);
    setPhase("playing");
  }, []);

  const proceedToWheel = useCallback(() => setPhase("wheel"), []);
  const proceedToDailyResult = useCallback(() => setPhase("dailyResult"), []);

  const resetToStart = useCallback(() => {
    setPhase("start");
    setStageIndex(0);
    setSessions([]);
    setRemainingTimeByStage([]);
    setHadWrongTouch(false);
    setScoreBreakdown(null);
    setGukbapTier(null);
  }, []);

  return {
    phase,
    nickname,
    regenerateNickname,
    stageNumber: stageIndex + 1,
    loadNonce,
    totalStages: STAGE_CONFIG.length,
    timeLimitSec: STAGE_CONFIG[stageIndex].timeLimitSec,
    session,
    loadError,
    scoreBreakdown,
    gukbapTier,
    startGame,
    retryPreload,
    recordWrongTouch,
    handleStageClear,
    handleStageTimeout,
    advanceToNextStage,
    retryFromStageOne,
    proceedToWheel,
    proceedToDailyResult,
    resetToStart,
  };
}
