"use client";

import { useState } from "react";
import StartScreen from "./components/StartScreen";
import GameScreen from "./components/GameScreen";
import Modal from "./components/Modal";
import { fetchGameData, GameSession } from "./actions";

type GameState = "start" | "playing" | "success" | "fail";

export default function Home() {
  const [gameState, setGameState] = useState<GameState>("start");
  const [session, setSession] = useState<GameSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [timeElapsed, setTimeElapsed] = useState(0);

  const startGame = async () => {
    setIsLoading(true);
    try {
      const data = await fetchGameData();
      if (data) {
        setSession(data);
        setGameState("playing");
      } else {
        alert("게임 데이터를 불러오는데 실패했습니다.");
      }
    } catch (error) {
      console.error(error);
      alert("오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuccess = (time: number) => {
    setTimeElapsed(time);
    setGameState("success");
  };

  const handleFail = () => {
    setGameState("fail");
  };

  const handleRestart = () => {
    startGame();
  };

  const handleMainMenu = () => {
    setGameState("start");
    setSession(null);
  };

  return (
    <div className="min-h-screen bg-black">
      {gameState === "start" && (
        <StartScreen onStart={startGame} isLoading={isLoading} />
      )}
      
      {gameState === "playing" && session && (
        <GameScreen 
          session={session} 
          onSuccess={handleSuccess} 
          onFail={handleFail} 
        />
      )}

      {(gameState === "success" || gameState === "fail") && (
        <>
          {/* Keep the game screen in the background blurred */}
          {session && (
            <div className="blur-sm pointer-events-none fixed inset-0">
              <GameScreen 
                session={session} 
                onSuccess={() => {}} 
                onFail={() => {}} 
              />
            </div>
          )}
          <Modal 
            type={gameState} 
            timeElapsed={timeElapsed} 
            onRestart={handleRestart} 
            onMainMenu={handleMainMenu} 
          />
        </>
      )}
    </div>
  );
}
