"use client";

import StartScreen from "./components/StartScreen";
import GameScreen from "./components/GameScreen";
import StageTransitionModal from "./components/StageTransitionModal";
import GameResultScreen from "./components/GameResultScreen";
import WheelScreen from "./components/WheelScreen";
import DailyResultScreen from "./components/DailyResultScreen";
import { useGameProgress } from "./hooks/useGameProgress";

export default function Home() {
  const game = useGameProgress();

  return (
    <div className="min-h-screen bg-black">
      {game.phase === "start" && (
        <StartScreen
          nickname={game.nickname}
          onRegenerateNickname={game.regenerateNickname}
          onStart={game.startGame}
          isLoading={game.isLoading}
          loadError={game.loadError}
        />
      )}

      {(game.phase === "playing" ||
        game.phase === "stageClear" ||
        game.phase === "stageFail") &&
        game.session && (
          <div className={game.phase !== "playing" ? "blur-sm pointer-events-none" : undefined}>
            <GameScreen
              key={game.stageNumber}
              session={game.session}
              stageNumber={game.stageNumber}
              totalStages={game.totalStages}
              timeLimitSec={game.timeLimitSec}
              onStageClear={game.handleStageClear}
              onStageTimeout={game.handleStageTimeout}
              onWrongTouch={game.recordWrongTouch}
            />
          </div>
        )}

      {game.phase === "stageClear" && (
        <StageTransitionModal type="stageClear" onNext={game.advanceToNextStage} />
      )}

      {game.phase === "stageFail" && (
        <StageTransitionModal type="stageFail" onNext={game.retryFromStageOne} />
      )}

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
