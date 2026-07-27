"use client";

import React, { useState, useEffect } from "react";
import { GameSession } from "../actions";
import PixelPanel from "./PixelPanel";

interface GameScreenProps {
  session: GameSession;
  stageNumber: number;
  totalStages: number;
  timeLimitSec: number;
  onStageClear: (remainingTimeSec: number) => void;
  onStageTimeout: () => void;
  onWrongTouch: () => void;
}

export default function GameScreen({
  session,
  stageNumber,
  totalStages,
  timeLimitSec,
  onStageClear,
  onStageTimeout,
  onWrongTouch,
}: GameScreenProps) {
  const [timeLeft, setTimeLeft] = useState(timeLimitSec);
  const [foundSlots, setFoundSlots] = useState<Set<number>>(new Set());
  const [scale, setScale] = useState(1);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const totalDifferences = session.slots.filter((s) => s.isDifference).length;

  const updateScale = () => {
    if (containerRef.current) {
      const { clientWidth } = containerRef.current;
      setScale(clientWidth / 1200);
    }
  };

  useEffect(() => {
    window.addEventListener("resize", updateScale);
    updateScale();
    return () => window.removeEventListener("resize", updateScale);
  }, []);

  const handleImageLoad = () => {
    updateScale();
  };

  useEffect(() => {
    if (timeLeft <= 0) {
      onStageTimeout();
      return;
    }

    if (totalDifferences > 0 && foundSlots.size >= totalDifferences) {
      onStageClear(timeLeft);
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, foundSlots.size, totalDifferences, onStageTimeout, onStageClear]);

  const handleSlotClick = (slotId: number, isDifference: boolean) => {
    if (isDifference && !foundSlots.has(slotId)) {
      setFoundSlots((prev) => {
        const newSet = new Set(prev);
        newSet.add(slotId);
        return newSet;
      });
      return;
    }
    onWrongTouch();
  };

  const renderClickOverlays = () =>
    session.slots.map((slot) => (
      <div
        key={slot.slotId}
        className="absolute cursor-pointer overflow-hidden"
        style={{
          left: `${slot.x * scale}px`,
          top: `${slot.y * scale}px`,
          width: `${100 * slot.slotScale * scale}px`,
          height: `${100 * slot.slotScale * scale}px`,
          clipPath: "circle(50%)",
        }}
        onClick={() => handleSlotClick(slot.slotId, slot.isDifference)}
      >
        {foundSlots.has(slot.slotId) && (
          <div className="absolute inset-0 flex items-center justify-center text-4xl bg-black/40 rounded-full animate-in zoom-in z-10">
            ✅
          </div>
        )}
      </div>
    ));

  return (
    <div className="flex flex-col min-h-screen bg-bg-deep text-ink">
      <header className="flex justify-between items-center p-4 md:px-8 bg-surface shadow-lg border-b border-wood z-10 sticky top-0">
        <span className="text-lg md:text-xl font-bold">
          {stageNumber} / {totalStages} 단계
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xl md:text-2xl font-bold">남은 시간:</span>
          <span
            className={`text-2xl md:text-3xl font-extrabold ${timeLeft <= 10 ? "text-error animate-pulse" : "text-amber"}`}
          >
            {timeLeft}초
          </span>
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row items-center justify-center p-4 gap-6 overflow-auto">
        <div
          ref={containerRef}
          className="relative group rounded-2xl overflow-hidden shadow-2xl border-4 border-wood hover:border-accent transition-colors w-full max-w-[1200px]"
          style={{ aspectRatio: "1200 / 800" }}
        >
          <img
            src={session.leftSceneUrl}
            alt="Scene Left"
            className="w-full h-full object-contain select-none pointer-events-none"
            onLoad={handleImageLoad}
          />
          {renderClickOverlays()}
        </div>

        <div
          className="relative group rounded-2xl overflow-hidden shadow-2xl border-4 border-wood hover:border-accent transition-colors w-full max-w-[1200px]"
          style={{ aspectRatio: "1200 / 800" }}
        >
          <img
            src={session.rightSceneUrl}
            alt="Scene Right"
            className="w-full h-full object-contain select-none pointer-events-none"
          />
          {renderClickOverlays()}
        </div>
      </main>

      <footer className="flex justify-between items-center p-4 md:px-8 bg-surface border-t border-wood">
        <PixelPanel size="btn">
          <button type="button" className="w-full font-bold text-ink">
            힌트
          </button>
        </PixelPanel>
        <span className="text-lg font-bold">
          남은 개수: {totalDifferences - foundSlots.size}/{totalDifferences}
        </span>
      </footer>
    </div>
  );
}
