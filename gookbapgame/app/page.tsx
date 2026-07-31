"use client";

import { use } from "react";
import StartScreen from "./components/StartScreen";
import PreloadScreen from "./components/PreloadScreen";
import GameScreen from "./components/GameScreen";
import StageTransitionModal from "./components/StageTransitionModal";
import GameResultScreen from "./components/GameResultScreen";
import WheelScreen from "./components/WheelScreen";
import DailyResultScreen from "./components/DailyResultScreen";
import LanguageToggle from "./components/LanguageToggle";
import { useGameProgress } from "./hooks/useGameProgress";

type PageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default function Home({ searchParams }: PageProps) {
  const resolvedSearchParams = use(searchParams);
  const rawTrackId = resolvedSearchParams.q;
  const trackId = typeof rawTrackId === "string" ? rawTrackId : null;

  const game = useGameProgress(trackId);

  return (
    <div className="min-h-screen bg-black">
      <LanguageToggle />
      {game.phase === "start" && (
        <StartScreen
          nickname={game.nickname}
          onRegenerateNickname={game.regenerateNickname}
          isRegeneratingNickname={game.isRegenerating}
          onStart={game.startGame}
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
          onNext={game.proceedToWheel}
        />
      )}

      {game.phase === "wheel" && <WheelScreen onNext={game.proceedToDailyResult} />}

      {game.phase === "dailyResult" && game.scoreBreakdown && game.gukbapTier && (
        <DailyResultScreen
          nickname={game.nickname}
          gukbapTier={game.gukbapTier}
          totalScore={game.scoreBreakdown.total}
          onRestart={game.resetToStart}
        />
      )}
    </div>
  );
}
