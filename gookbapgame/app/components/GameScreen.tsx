"use client";

import React, { useState, useEffect } from "react";
import { GameSession } from "../actions";
import { useLocale } from "../lib/i18n/LocaleContext";
import { WRONG_TOUCH_LIMIT_PER_LEVEL, GLOBAL_TIME_LIMIT_SEC } from "../lib/stageConfig";
import { resolveIndicatorCells, resolveGaugeCells, GAUGE_WARN_CELLS } from "../lib/hudIndicators";
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

/**
 * 직전 단계의 장면 URL. 모듈 스코프에 두는 이유는 GameScreen이 단계마다
 * 리마운트되기 때문이다(page.tsx의 key). 컴포넌트 상태로는 이전 단계 값을
 * 넘겨받을 수 없다.
 *
 * page.tsx에 상태를 추가하지 않는 이유는 그쪽이 GameScreen 두 개를 동시에
 * 살리는 구조로 번지기 쉬워서다 — 그러면 타이머 effect와 onStageClear 콜백이
 * 둘씩 살아난다(useGameProgress.ts:111~114의 stale closure 주석 참고).
 */
let lastSceneUrls: { left: string; right: string } | null = null;

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
  // 단계 전환 연출용. 리마운트되므로 "이전 단계"가 아니라 **이 컴포넌트가 처음
  // 그려질 때 겹쳐 보여줄 직전 사진**을 page.tsx가 아니라 여기서 들고 있는다.
  //
  // prevSceneUrls가 null이면 전환 연출 없이 그냥 그린다(첫 단계 또는 연출 종료 후).
  const [prevSceneUrls, setPrevSceneUrls] = useState<{ left: string; right: string } | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const wrongMarkIdRef = React.useRef(0);
  const forceAdvanceTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const differenceSlots = session.slots.filter((s) => s.isDifference);
  const totalDifferences = differenceSlots.length;

  // 차이 슬롯 1개당 정확히 한 줄. 이름이 겹쳐도 dedupe 하지 않는다 —
  // 줄이 줄어들면 플레이어가 문제를 다 찾은 것으로 착각한다.
  const hintNames = differenceSlots.map((slot) => resolveLocalizedName(slot.categoryName, locale));

  const indicatorCells = resolveIndicatorCells(totalDifferences, foundSlots.size);
  /* 게이지 칸 수 하나가 색 전환·breath·가속을 **전부** 판정한다. 초로 따로 비교하면
     경고 시점이 둘로 갈린다 — 남은 시간 숫자도 같은 값을 본다. */
  const gaugeCells = resolveGaugeCells(remainingTimeSec, GLOBAL_TIME_LIMIT_SEC);
  const timeCritical = gaugeCells <= GAUGE_WARN_CELLS;

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

  // 마운트 시점에 직전 단계 사진이 있으면 겹쳐 놓고 0.3s 뒤에 치운다.
  // CSS 애니메이션 duration(photo-swap-out)과 같은 값이어야 한다.
  useEffect(() => {
    const incoming = { left: session.leftSceneUrl, right: session.rightSceneUrl };
    const previous = lastSceneUrls;
    lastSceneUrls = incoming;

    // 같은 사진이면(첫 단계, 또는 리마운트가 단계 변경이 아닌 경우) 연출하지 않는다.
    if (!previous || (previous.left === incoming.left && previous.right === incoming.right)) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회, 외부(모듈 스코프) 값을 React로 들여오는 처리
    setPrevSceneUrls(previous);
    const timeoutId = setTimeout(() => setPrevSceneUrls(null), 300);
    return () => clearTimeout(timeoutId);
  }, [session.leftSceneUrl, session.rightSceneUrl]);

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

  // 바탕은 다른 화면과 같은 --bg다. 예전엔 이 화면만 더 어두운 --bg-deep을 썼는데,
  // 밝은 테마로 바꾼 뒤로는 (1) 이 화면만 눈에 띄게 어두워 패널 화면들과 톤이 갈리고,
  // (2) 시간 임박 경고(text-error)의 대비가 1.55까지 떨어져 정작 가장 중요한 경고가
  // 안 보였다(2026-08-11 실측). 그래서 --bg로 합치고 --bg-deep 자체를 없앴다.
  return (
    <div className={`flex flex-col min-h-screen bg-bg text-ink ${isShaking ? "animate-shake" : ""}`}>
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
        {/* 왼쪽(세로 배치에서는 위쪽) 장면 + 문항 인디케이터.
            인디케이터는 세로 배치에서 그림 **위**, 가로 배치에서 그림 **아래**에 온다
            (2026-08-09, 이란토). DOM 순서를 바꾸지 않고 order로 처리하는 이유는
            그림이 먼저 읽히는 편이 스크린리더 순서로도 자연스럽기 때문이다. */}
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
              {prevSceneUrls && (
                <img
                  src={prevSceneUrls.left}
                  alt=""
                  aria-hidden="true"
                  className="photo-swap__outgoing w-full h-full object-contain select-none pointer-events-none"
                />
              )}
              <img
                src={session.leftSceneUrl}
                alt="Scene Left"
                className={`w-full h-full object-contain select-none pointer-events-none ${
                  prevSceneUrls ? "photo-swap__incoming" : ""
                }`}
                onLoad={handleImageLoad}
              />
              {renderDeadZones("left")}
              {renderClickOverlays("left")}
              {renderFoundMarks()}
              {renderWrongMarks("left")}
            </div>
          </div>

          {/* 문항 인디케이터. 세로 배치에서는 그림 위(order -1)에 가운데 정렬,
              가로 배치에서는 그림 아래 왼쪽 정렬로 돌아간다.
              hidden 칸도 자리를 차지해야 하므로 display가 아니라 opacity로 감춘다.

              오답 카운터와 같은 방식으로 마커 이미지를 그대로 쓴다(2026-08-10, 이란토) —
              한쪽만 원형 도트면 같은 줄에 놓인 두 지표가 다른 체계로 보인다.
              찾은 칸은 불투명, 남은 칸은 opacity-20으로 흐리게 (오답 쪽과 동일). */}
          <div
            className="flex items-center gap-1 order-first md:order-none md:self-start"
            role="img"
            aria-label={t("game.remainingCount", {
              found: totalDifferences - foundSlots.size,
              total: totalDifferences,
            })}
          >
            {indicatorCells.map((cell, i) => (
              <img
                key={i}
                src="/icons/check-success.svg"
                alt=""
                aria-hidden="true"
                /* 미발견 칸의 opacity는 배경 밝기에 종속된다. 어두운 테마 시절엔
                   0.2로도 윤곽이 보였지만, 밝은 데스크톱 배경에서는 마커의 흰 halo가
                   배경과 밝기가 비슷해 통째로 사라진다(2026-08-11). */
                className={`w-5 h-5 ${
                  cell === "hidden" ? "opacity-0" : cell === "filled" ? "opacity-100" : "opacity-35"
                }`}
              />
            ))}
          </div>
        </div>

        {/* 힌트 + 게이지 (두 그림 사이) */}
        <div className="flex md:flex-col items-center gap-2 w-full md:w-auto md:self-stretch md:justify-center shrink-0">
          {/* 힌트 버튼. 좌상단 언어·소리 토글과 같은 양식(w-9 h-9 원형)이다
              — 화면에 떠 있는 보조 버튼이라는 성격이 같아서 생김새를 맞췄다.
              아이콘은 물음표 이모지(U+2753). **그림 이모지를 쓰지 말 것**
              (2026-08-09에 구명보트로 바꿨다가 되돌렸다) — 서브셋 폰트(Noto Emoji)는
              흑백 **아웃라인**이라 속이 빈 모양이 되어, 형태가 복잡한 그림은
              게임 중 순간적으로 알아보기 어렵다. 물음표는 형태가 단순해 견딘다.
              **VS16(U+FE0F)을 붙이지 말 것** — 서브셋은 GSUB이 비어 있어 VS16
              클러스터가 합쳐지지 않고 시스템 컬러 이모지로 넘어간다. */}
          <button
            type="button"
            className="icon-round-btn w-9 h-9 flex items-center justify-center rounded-full border border-wood bg-surface/90 text-lg leading-none shrink-0"
            onClick={() => setIsHintOpen((prev) => !prev)}
            aria-expanded={isHintOpen}
            aria-label={t("game.hintButton")}
          >
            <span aria-hidden="true">{"❓"}</span>
          </button>

          <div
            className={`time-gauge relative flex-1 md:flex-none h-3 w-full md:h-40 md:w-3 bg-wood/30 overflow-hidden ${
              timeCritical ? "time-gauge--warn" : ""
            } ${gaugeCells <= 1 ? "time-gauge--last" : ""}`}
            style={{ ["--gauge-cells" as string]: gaugeCells }}
            role="img"
            aria-label={`${t("game.timeRemainingLabel")} ${t("game.secondsUnit", { seconds: remainingTimeSec })}`}
          >
            <div className="time-gauge__fill" />
          </div>

          {/* 남은 시간 숫자. 경고 색은 --warning이 아니라 --error다 — 주황 계열은
              밝은 바탕에서 글자 대비가 모자란다(면에만 쓸 색). 전환 시점은
              게이지와 같은 gaugeCells 판정을 공유한다. */}
          <span
            className={`text-lg md:text-xl font-extrabold shrink-0 ${
              timeCritical ? "text-error animate-pulse" : "text-ink"
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
              {prevSceneUrls && (
                <img
                  src={prevSceneUrls.right}
                  alt=""
                  aria-hidden="true"
                  className="photo-swap__outgoing w-full h-full object-contain select-none pointer-events-none"
                />
              )}
              <img
                src={session.rightSceneUrl}
                alt="Scene Right"
                className={`w-full h-full object-contain select-none pointer-events-none ${
                  prevSceneUrls ? "photo-swap__incoming" : ""
                }`}
              />
              {renderDeadZones("right")}
              {renderClickOverlays("right")}
              {renderFoundMarks()}
              {renderWrongMarks("right")}
            </div>
          </div>

          {/* 오답 표시. 세로 배치에서는 가운데, 가로 배치에서는 오른쪽 그림 아래
              오른쪽 정렬(2026-08-09, 이란토). */}
          <div
            className="flex items-center gap-1 md:self-end"
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
