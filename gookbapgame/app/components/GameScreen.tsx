"use client";

import React, { useState, useEffect } from "react";
import { GameSession } from "../actions";

interface GameScreenProps {
  session: GameSession;
  onSuccess: (timeElapsed: number) => void;
  onFail: () => void;
}

export default function GameScreen({ session, onSuccess, onFail }: GameScreenProps) {
  const [timeLeft, setTimeLeft] = useState(30);
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

  const timeElapsed = 30 - timeLeft;

  useEffect(() => {
    if (timeLeft <= 0) {
      onFail();
      return;
    }

    if (totalDifferences > 0 && foundSlots.size >= totalDifferences) {
      onSuccess(timeElapsed);
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, foundSlots.size, onFail, onSuccess, timeElapsed]);

  const handleSlotClick = (slotId: number, isDifference: boolean) => {
    if (isDifference && !foundSlots.has(slotId)) {
      setFoundSlots((prev) => {
        const newSet = new Set(prev);
        newSet.add(slotId);
        return newSet;
      });
    }
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
    <div className="flex flex-col min-h-screen bg-zinc-900 text-white font-sans">
      <header className="flex justify-between items-center p-4 md:px-8 bg-zinc-800 shadow-lg border-b border-zinc-700 z-10 sticky top-0">
        <div className="flex items-center gap-2">
          <span className="text-xl md:text-2xl font-bold">찾은 개수:</span>
          <div className="flex gap-1">
            {Array.from({ length: totalDifferences }).map((_, i) => (
              <div
                key={i}
                className={`w-6 h-6 md:w-8 md:h-8 rounded-full border-2 border-indigo-500 flex items-center justify-center ${i < foundSlots.size ? "bg-indigo-500 text-white" : "bg-transparent text-transparent"}`}
              >
                ✓
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xl md:text-2xl font-bold">남은 시간:</span>
          <span className={`text-2xl md:text-3xl font-extrabold ${timeLeft <= 10 ? "text-red-500 animate-pulse" : "text-green-400"}`}>
            {timeLeft}초
          </span>
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row items-center justify-center p-4 gap-6 overflow-auto">
        <div
          ref={containerRef}
          className="relative group rounded-2xl overflow-hidden shadow-2xl border-4 border-zinc-800 hover:border-indigo-500 transition-colors w-full max-w-[1200px]"
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
          className="relative group rounded-2xl overflow-hidden shadow-2xl border-4 border-zinc-800 hover:border-indigo-500 transition-colors w-full max-w-[1200px]"
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
    </div>
  );
}
