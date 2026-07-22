"use client";

import { useCallback, useState } from "react";
import { fetchGameData, GameSession } from "../actions";
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
  | "playing"
  | "stageClear"
  | "stageFail"
  | "gameResult"
  | "wheel"
  | "dailyResult";

export function useGameProgress() {
  const [phase, setPhase] = useState<GamePhase>("start");
  const [nickname, setNickname] = useState<string>(() => loadOrCreateNickname());
  const [stageIndex, setStageIndex] = useState(0);
  const [session, setSession] = useState<GameSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [remainingTimeByStage, setRemainingTimeByStage] = useState<number[]>([]);
  const [hadWrongTouch, setHadWrongTouch] = useState(false);
  const [scoreBreakdown, setScoreBreakdown] = useState<ScoreBreakdown | null>(null);
  const [gukbapTier, setGukbapTier] = useState<GukbapTier | null>(null);

  const loadStage = useCallback(async (index: number) => {
    setIsLoading(true);
    setLoadError(null);
    const cfg = STAGE_CONFIG[index];
    const data = await fetchGameData(cfg.level, cfg.diffCount);
    setIsLoading(false);
    if (!data) {
      setLoadError("게임 데이터를 불러오는데 실패했습니다.");
      return false;
    }
    setSession(data);
    return true;
  }, []);

  const startGame = useCallback(async () => {
    setStageIndex(0);
    setRemainingTimeByStage([]);
    setHadWrongTouch(false);
    setScoreBreakdown(null);
    setGukbapTier(null);
    const ok = await loadStage(0);
    if (ok) setPhase("playing");
  }, [loadStage]);

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

  const advanceToNextStage = useCallback(async () => {
    const nextIndex = stageIndex + 1;
    if (nextIndex < STAGE_CONFIG.length) {
      setStageIndex(nextIndex);
      const ok = await loadStage(nextIndex);
      if (ok) setPhase("playing");
      return;
    }
    const breakdown = calcFinalScore(remainingTimeByStage, hadWrongTouch);
    setScoreBreakdown(breakdown);
    setGukbapTier(calcGukbapTier(breakdown.total));
    setPhase("gameResult");
  }, [stageIndex, remainingTimeByStage, hadWrongTouch, loadStage]);

  const retryFromStageOne = useCallback(async () => {
    setStageIndex(0);
    setRemainingTimeByStage([]);
    setHadWrongTouch(false);
    const ok = await loadStage(0);
    if (ok) setPhase("playing");
  }, [loadStage]);

  const proceedToWheel = useCallback(() => setPhase("wheel"), []);
  const proceedToDailyResult = useCallback(() => setPhase("dailyResult"), []);

  const resetToStart = useCallback(() => {
    setPhase("start");
    setStageIndex(0);
    setSession(null);
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
    totalStages: STAGE_CONFIG.length,
    timeLimitSec: STAGE_CONFIG[stageIndex].timeLimitSec,
    session,
    isLoading,
    loadError,
    scoreBreakdown,
    gukbapTier,
    startGame,
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
