"use client";

import React, { useState, useEffect } from "react";
import { GameSession } from "../actions";
import PixelPanel from "./PixelPanel";
import { useLocale } from "../lib/i18n/LocaleContext";
import { WRONG_TOUCH_LIMIT_PER_LEVEL } from "../lib/stageConfig";
import HintClipboard from "./HintClipboard";
import { resolveLocalizedName } from "../lib/i18n/localizedName";

interface GameScreenProps {
  session: GameSession;
  stageNumber: number;
  totalStages: number;
  remainingTimeSec: number;
  onStageClear: (foundCount: number) => void;
  onForceAdvance: (foundCount: number) => void;
  onWrongTouch: () => void;
  onCorrectFind: () => void;
}

const FORCE_ADVANCE_DELAY_MS = 400;

type WrongMark = { id: number; x: number; y: number; side: "left" | "right" };

export default function GameScreen({
  session,
  stageNumber,
  totalStages,
  remainingTimeSec,
  onStageClear,
  onForceAdvance,
  onWrongTouch,
  onCorrectFind,
}: GameScreenProps) {
  const { t, locale } = useLocale();
  const [foundSlots, setFoundSlots] = useState<Set<number>>(new Set());
  const [wrongTouchCount, setWrongTouchCount] = useState(0);
  const [wrongMarks, setWrongMarks] = useState<WrongMark[]>([]);
  const [isShaking, setIsShaking] = useState(false);
  const [scale, setScale] = useState(1);
  const [isHintOpen, setIsHintOpen] = useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const wrongMarkIdRef = React.useRef(0);
  const forceAdvanceTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const differenceSlots = session.slots.filter((s) => s.isDifference);
  const totalDifferences = differenceSlots.length;

  // 차이 슬롯 1개당 정확히 한 줄. 이름이 겹쳐도 dedupe 하지 않는다 —
  // 줄이 줄어들면 플레이어가 문제를 다 찾은 것으로 착각한다.
  const hintNames = differenceSlots.map((slot) => resolveLocalizedName(slot.categoryName, locale));

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

  // 다 맞히면 축하 모달 없이 다음 레벨로 넘어간다(제한시간이 레벨당 60초가 아니라
  // 전체 300초로 바뀌면서 중간에 멈춰 세울 이유가 없어졌다).
  // 오답 소진 경로와 같은 지연을 주는 이유는, 방금 맞힌 마지막 정답 표시를 볼 틈도 없이
  // 화면이 바뀌는 것을 막기 위해서다.
  useEffect(() => {
    if (totalDifferences === 0 || foundSlots.size < totalDifferences) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off UI reset tied to this stage-clear transition, not a cascading sync loop
    setIsHintOpen(false);
    const timeoutId = setTimeout(() => onStageClear(foundSlots.size), FORCE_ADVANCE_DELAY_MS);
    return () => clearTimeout(timeoutId);
  }, [foundSlots.size, totalDifferences, onStageClear]);

  useEffect(() => {
    return () => {
      if (forceAdvanceTimeoutRef.current) {
        clearTimeout(forceAdvanceTimeoutRef.current);
      }
    };
  }, []);

  const registerWrongTouch = (x: number, y: number, side: "left" | "right") => {
    if (wrongTouchCount >= WRONG_TOUCH_LIMIT_PER_LEVEL) return;

    setWrongMarks((prev) => [...prev, { id: wrongMarkIdRef.current++, x, y, side }]);
    onWrongTouch();

    const next = wrongTouchCount + 1;
    setWrongTouchCount(next);

    if (next >= WRONG_TOUCH_LIMIT_PER_LEVEL) {
      setIsHintOpen(false);
      setIsShaking(true);
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(100);
      }
      forceAdvanceTimeoutRef.current = setTimeout(() => onForceAdvance(foundSlots.size), FORCE_ADVANCE_DELAY_MS);
    }
  };

  const handleBackgroundClick =
    (side: "left" | "right") => (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      registerWrongTouch(e.clientX - rect.left, e.clientY - rect.top, side);
    };

  const handleSlotClick = (slotId: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    if (wrongTouchCount >= WRONG_TOUCH_LIMIT_PER_LEVEL) return;
    if (foundSlots.has(slotId)) return;

    setFoundSlots((prev) => {
      const newSet = new Set(prev);
      newSet.add(slotId);
      return newSet;
    });
    onCorrectFind();
  };

  const FALLBACK_CLIP_PATH = "circle(25%)";

  const buildClipPath = (polygon: { x: number; y: number }[] | null): string => {
    if (!polygon || polygon.length < 3) {
      return FALLBACK_CLIP_PATH;
    }
    if (polygon.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) {
      return FALLBACK_CLIP_PATH;
    }
    const points = polygon.map((p) => `${p.x * 100}% ${p.y * 100}%`).join(", ");
    return `polygon(${points})`;
  };

  const renderClickOverlays = (side: "left" | "right") =>
    differenceSlots.map((slot) => (
      <div
        key={slot.slotId}
        className="absolute cursor-pointer overflow-hidden"
        style={{
          left: `${slot.x * scale}px`,
          top: `${slot.y * scale}px`,
          width: `${100 * slot.slotScale * scale}px`,
          height: `${100 * slot.slotScale * scale}px`,
          clipPath: buildClipPath(side === "left" ? slot.leftHitPolygon : slot.rightHitPolygon),
          zIndex: foundSlots.has(slot.slotId) ? 2 : 1,
        }}
        onClick={handleSlotClick(slot.slotId)}
      >
        {foundSlots.has(slot.slotId) && (
          <div className="absolute inset-0 flex items-center justify-center animate-in zoom-in [clip-path:none]">
            <img src="/icons/check-success.svg" alt="" className="w-8 h-8" />
          </div>
        )}
      </div>
    ));

  const renderWrongMarks = (side: "left" | "right") =>
    wrongMarks
      .filter((mark) => mark.side === side)
      .map((mark) => (
        <img
          key={mark.id}
          src="/icons/check-failed.svg"
          alt=""
          className="absolute pointer-events-none"
          style={{ left: mark.x - 16, top: mark.y - 16, width: 32, height: 32, zIndex: 3 }}
        />
      ));

  return (
    <div className={`flex flex-col min-h-screen bg-bg-deep text-ink ${isShaking ? "animate-shake" : ""}`}>
      <header className="relative flex justify-end items-center p-4 md:px-8 bg-surface shadow-lg border-b border-wood z-10 sticky top-0">
        <span className="absolute left-1/2 -translate-x-1/2 text-lg md:text-xl font-bold">
          {t("game.stageProgress", { current: stageNumber, total: totalStages })}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xl md:text-2xl font-bold">{t("game.timeRemainingLabel")}</span>
          <span
            className={`text-2xl md:text-3xl font-extrabold ${remainingTimeSec <= 30 ? "text-error animate-pulse" : "text-amber"}`}
          >
            {t("game.secondsUnit", { seconds: remainingTimeSec })}
          </span>
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row items-center justify-center p-4 gap-6 overflow-auto">
        <div
          ref={containerRef}
          className="relative group rounded-2xl overflow-hidden shadow-2xl border-4 border-wood hover:border-accent transition-colors w-full max-w-[1200px] cursor-pointer"
          style={{ aspectRatio: "1200 / 800" }}
          onClick={handleBackgroundClick("left")}
        >
          <img
            src={session.leftSceneUrl}
            alt="Scene Left"
            className="w-full h-full object-contain select-none pointer-events-none"
            onLoad={handleImageLoad}
          />
          {renderClickOverlays("left")}
          {renderWrongMarks("left")}
        </div>

        <div
          className="relative group rounded-2xl overflow-hidden shadow-2xl border-4 border-wood hover:border-accent transition-colors w-full max-w-[1200px] cursor-pointer"
          style={{ aspectRatio: "1200 / 800" }}
          onClick={handleBackgroundClick("right")}
        >
          <img
            src={session.rightSceneUrl}
            alt="Scene Right"
            className="w-full h-full object-contain select-none pointer-events-none"
          />
          {renderClickOverlays("right")}
          {renderWrongMarks("right")}
        </div>
      </main>

      <footer className="flex justify-between items-center p-4 md:px-8 bg-surface border-t border-wood">
        {/* 라벨 대신 '?' 아이콘. 글자가 사라졌으므로 버튼의 의미는 aria-label로 남긴다
            — 화면에 안 보여도 스크린리더에는 "힌트"로 읽혀야 한다. */}
        <PixelPanel size="btn" className="min-w-12">
          <button
            type="button"
            className="w-full font-bold text-ink text-xl leading-none py-1"
            onClick={() => setIsHintOpen((prev) => !prev)}
            aria-expanded={isHintOpen}
            aria-label={t("game.hintButton")}
          >
            ?
          </button>
        </PixelPanel>
        <div
          className="flex items-center gap-1"
          aria-label={t("game.wrongTouchAria", { count: wrongTouchCount, limit: WRONG_TOUCH_LIMIT_PER_LEVEL })}
        >
          {Array.from({ length: WRONG_TOUCH_LIMIT_PER_LEVEL }).map((_, i) => (
            <img
              key={i}
              src="/icons/check-failed.svg"
              alt=""
              className={`w-5 h-5 ${i < wrongTouchCount ? "opacity-100" : "opacity-20"}`}
            />
          ))}
        </div>
        <span className="text-lg font-bold">
          {t("game.remainingCount", { found: totalDifferences - foundSlots.size, total: totalDifferences })}
        </span>
      </footer>
      {isHintOpen && <HintClipboard names={hintNames} onClose={() => setIsHintOpen(false)} />}
    </div>
  );
}
