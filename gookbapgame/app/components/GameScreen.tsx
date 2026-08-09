"use client";

import React, { useState, useEffect } from "react";
import { GameSession } from "../actions";
import PixelPanel from "./PixelPanel";
import { useLocale } from "../lib/i18n/LocaleContext";
import { WRONG_TOUCH_LIMIT_PER_LEVEL, GLOBAL_TIME_LIMIT_SEC } from "../lib/stageConfig";
import { resolveIndicatorCells, resolveGaugeRatio, isTimeCritical } from "../lib/hudIndicators";
import HintClipboard from "./HintClipboard";
import { resolveLocalizedName } from "../lib/i18n/localizedName";
import { playSfx, SFX } from "../lib/sfx";
import { resolveHitTargetBox } from "../lib/hitTarget";

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

  const indicatorCells = resolveIndicatorCells(totalDifferences, foundSlots.size);
  const gaugeRatio = resolveGaugeRatio(remainingTimeSec, GLOBAL_TIME_LIMIT_SEC);
  const timeCritical = isTimeCritical(remainingTimeSec);

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
    playSfx(SFX.pencilFailed);
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
    playSfx(SFX.pencilSuccess);
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

  /**
   * 히트 영역. 파트 실루엣 모양대로 clip-path를 씌워 정확한 곳만 눌리게 한다.
   *
   * 크기 보정은 두 단계다(2026-08-07, 이란토). 규칙은 `resolveHitTargetBox`에 있다.
   * 1. **최소 56px 보장** — 어느 한 축이라도 미달이면(OR) 그 축만 늘린다. 실측상
   *    3·4·6단계에 유효 면적이 9~15px뿐인 슬롯이 있었고, 맞게 눌러도 빗나갔다.
   *    이 경우 clip-path는 포기한다 — 폴리곤이 %라 박스를 키우면 같은 비율로
   *    커져서 유효 면적이 원래대로 작게 남기 때문이다.
   * 2. **safe-zone 5px** — 크기가 충분한 슬롯도 테두리 바깥에 여유를 준다.
   *    가장자리를 아슬하게 눌러도 정답이 된다.
   * 3. **무판정 구역 5px** — 그 바깥 한 겹은 정답도 오답도 아니다. 아래
   *    renderDeadZones가 그린다.
   *
   * **정답 표시를 이 안에 넣지 말 것.** clip-path는 서브트리 전체에 적용되고
   * 자식이 취소할 수 없어서(`[clip-path:none]`도 소용없다), 실루엣 밖으로 나가는
   * 만큼 마커가 잘려 나가고 슬롯마다 크기도 달라 보인다. 마커는 아래
   * renderFoundMarks가 형제 레이어로 그린다 — renderWrongMarks와 같은 구조다.
   */
  const renderClickOverlays = (side: "left" | "right") =>
    differenceSlots.map((slot) => {
      const polygon = side === "left" ? slot.leftHitPolygon : slot.rightHitPolygon;
      const slotSizePx = 100 * slot.slotScale * scale;
      const box = resolveHitTargetBox(slotSizePx, polygon);

      return (
        <div
          key={slot.slotId}
          className="absolute cursor-pointer"
          style={{
            left: `${slot.x * scale - box.offsetX}px`,
            top: `${slot.y * scale - box.offsetY}px`,
            width: `${box.width}px`,
            height: `${box.height}px`,
            clipPath: box.useClipPath ? buildClipPath(box.polygon) : undefined,
            zIndex: 1,
          }}
          onClick={handleSlotClick(slot.slotId)}
        />
      );
    });

  /**
   * 무판정 구역. 정답 영역 바깥 한 겹으로, 여기를 누르면 **아무 일도 일어나지
   * 않는다**(2026-08-07, 이란토). 거의 맞힌 터치를 오답으로 세지 않기 위한
   * 완충이다 — 오답은 3회 제한과 10점 감점이 걸려 있어 체감이 크다.
   *
   * 배경(오답 판정)보다 위, 정답 영역보다 아래에 깔린다. 하는 일은
   * `stopPropagation`으로 클릭이 배경까지 내려가지 않게 막는 것뿐이다.
   *
   * **이미 찾은 슬롯은 제외한다.** 정답 영역은 `handleSlotClick`이 자체적으로
   * 걸러내지만 여기까지 남겨두면, 다 맞힌 뒤 그 자리를 눌렀을 때 오답으로도
   * 처리되지 않는 죽은 영역이 계속 남는다.
   */
  const renderDeadZones = (side: "left" | "right") =>
    differenceSlots
      .filter((slot) => !foundSlots.has(slot.slotId))
      .map((slot) => {
        const polygon = side === "left" ? slot.leftHitPolygon : slot.rightHitPolygon;
        const slotSizePx = 100 * slot.slotScale * scale;
        const { deadZone, useClipPath } = resolveHitTargetBox(slotSizePx, polygon);

        return (
          <div
            key={`dead-${slot.slotId}`}
            className="absolute"
            style={{
              left: `${slot.x * scale - deadZone.offsetX}px`,
              top: `${slot.y * scale - deadZone.offsetY}px`,
              width: `${deadZone.width}px`,
              height: `${deadZone.height}px`,
              clipPath: useClipPath ? buildClipPath(deadZone.polygon) : undefined,
              zIndex: 0,
            }}
            onClick={(e) => e.stopPropagation()}
          />
        );
      });

  /**
   * 정답 표시. 슬롯 중심에 고정 크기로 놓는다 — 히트 영역의 clip-path 바깥이라
   * 실루엣 모양과 무관하게 항상 온전한 크기로 보인다.
   * 오답 표시(renderWrongMarks)와 같은 32px, 같은 중심 정렬 방식이다.
   */
  const FOUND_MARK_SIZE = 32;
  const renderFoundMarks = () =>
    differenceSlots
      .filter((slot) => foundSlots.has(slot.slotId))
      .map((slot) => {
        const size = 100 * slot.slotScale * scale;
        return (
          <img
            key={slot.slotId}
            src="/icons/check-success.svg"
            alt=""
            className="absolute pointer-events-none animate-in zoom-in"
            style={{
              left: slot.x * scale + size / 2 - FOUND_MARK_SIZE / 2,
              top: slot.y * scale + size / 2 - FOUND_MARK_SIZE / 2,
              width: FOUND_MARK_SIZE,
              height: FOUND_MARK_SIZE,
              zIndex: 2,
            }}
          />
        );
      });

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
        {/* Lv 표시 + 진행 칩. 칩은 시각 정보라 스크린리더에는 기존 문장을 남긴다. */}
        <div
          className="flex flex-col items-end gap-1"
          role="img"
          aria-label={t("game.stageProgress", { current: stageNumber, total: totalStages })}
        >
          <span className="text-xl md:text-2xl font-bold leading-none">Lv.{stageNumber}</span>
          <div className="flex items-center gap-1" aria-hidden="true">
            {Array.from({ length: totalStages }).map((_, i) => (
              <span
                key={i}
                className={`w-3 h-3 md:w-4 md:h-4 ${i < stageNumber ? "bg-accent" : "bg-wood/30"}`}
              />
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row items-center justify-center p-4 gap-3 md:gap-4 overflow-auto">
        {/* 왼쪽(세로 배치에서는 위쪽) 장면 + 그 아래 문항 인디케이터 */}
        <div className="flex flex-col items-center gap-2 w-full max-w-[1200px]">
          {/* 프레임은 인화지(순수 장식)다. 좌표계는 안쪽 사진 영역이므로 containerRef와
              배경 클릭 판정은 .photo-frame__photo에 붙인다 — 프레임에 붙이면
              clientWidth에 좌우 여백 20px이 섞여 scale이 어긋나고, 배경 클릭
              좌표도 여백만큼 밀린다. */}
          <div className="photo-frame w-full">
            <div
              ref={containerRef}
              className="photo-frame__photo cursor-pointer"
              onClick={handleBackgroundClick("left")}
            >
              <img
                src={session.leftSceneUrl}
                alt="Scene Left"
                className="w-full h-full object-contain select-none pointer-events-none"
                onLoad={handleImageLoad}
              />
              {renderDeadZones("left")}
              {renderClickOverlays("left")}
              {renderFoundMarks()}
              {renderWrongMarks("left")}
            </div>
          </div>

          {/* 문항 인디케이터. 가로 배치에서는 왼쪽 그림 아래에 붙는다.
              hidden 칸도 자리를 차지해야 하므로 display가 아니라 opacity로 감춘다. */}
          <div
            className="flex items-center gap-1 self-start"
            role="img"
            aria-label={t("game.remainingCount", {
              found: totalDifferences - foundSlots.size,
              total: totalDifferences,
            })}
          >
            {indicatorCells.map((cell, i) => (
              <span
                key={i}
                aria-hidden="true"
                className={`w-4 h-4 rounded-full border-2 border-wood ${
                  cell === "filled" ? "bg-accent" : "bg-transparent"
                } ${cell === "hidden" ? "opacity-0" : "opacity-100"}`}
              />
            ))}
          </div>
        </div>

        {/* 힌트 + 게이지 (두 그림 사이) */}
        <div className="flex md:flex-col items-center gap-2 w-full md:w-auto md:self-stretch md:justify-center shrink-0">
          <PixelPanel size="btn" className="min-w-12 shrink-0">
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
            className="time-gauge relative flex-1 md:flex-none h-3 w-full md:h-40 md:w-3 bg-wood/30 overflow-hidden"
            style={{ ["--gauge-ratio" as string]: gaugeRatio }}
            role="img"
            aria-label={`${t("game.timeRemainingLabel")} ${t("game.secondsUnit", { seconds: remainingTimeSec })}`}
          >
            <div className={`time-gauge__fill ${timeCritical ? "bg-error" : "bg-amber"}`} />
          </div>

          <span
            className={`text-lg md:text-xl font-extrabold shrink-0 ${
              timeCritical ? "text-error animate-pulse" : "text-amber"
            }`}
          >
            {t("game.secondsUnit", { seconds: remainingTimeSec })}
          </span>
        </div>

        {/* 오른쪽(세로 배치에서는 아래쪽) 장면 + 그 아래 오답 인디케이터 */}
        <div className="flex flex-col items-center gap-2 w-full max-w-[1200px]">
          <div className="photo-frame w-full">
            <div
              className="photo-frame__photo cursor-pointer"
              onClick={handleBackgroundClick("right")}
            >
              <img
                src={session.rightSceneUrl}
                alt="Scene Right"
                className="w-full h-full object-contain select-none pointer-events-none"
              />
              {renderDeadZones("right")}
              {renderClickOverlays("right")}
              {renderFoundMarks()}
              {renderWrongMarks("right")}
            </div>
          </div>

          <div
            className="flex items-center gap-1 self-end"
            role="img"
            aria-label={t("game.wrongTouchAria", {
              count: wrongTouchCount,
              limit: WRONG_TOUCH_LIMIT_PER_LEVEL,
            })}
          >
            {Array.from({ length: WRONG_TOUCH_LIMIT_PER_LEVEL }).map((_, i) => (
              <img
                key={i}
                src="/icons/check-failed.svg"
                alt=""
                aria-hidden="true"
                className={`w-5 h-5 ${i < wrongTouchCount ? "opacity-100" : "opacity-20"}`}
              />
            ))}
          </div>
        </div>
      </main>
      {isHintOpen && <HintClipboard names={hintNames} onClose={() => setIsHintOpen(false)} />}
    </div>
  );
}
