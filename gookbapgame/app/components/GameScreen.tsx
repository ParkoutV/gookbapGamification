"use client";

import React, { useState, useEffect } from "react";
import { GameSession } from "../actions";
import { useLocale } from "../lib/i18n/LocaleContext";
import {
  WRONG_TOUCH_LIMIT_PER_LEVEL,
  GLOBAL_TIME_LIMIT_SEC,
  HINT_LIMIT_PER_GAME,
} from "../lib/stageConfig";
import { resolveIndicatorCells, resolveGaugeCells, GAUGE_WARN_CELLS } from "../lib/hudIndicators";
import HintClipboard from "./HintClipboard";
import HintSurveyOverlay from "./HintSurveyOverlay";
import { applyHintMask, pickHintMaskIndex, pickHintSurveyQuestion } from "../lib/hintMask";
import { submitSurveyResponses } from "../actions";
import { getHintSurvey } from "../lib/hintSurveyPrefetch";
import type { SurveyQuestion } from "../lib/surveyAnswers";
import { resolveLocalizedName } from "../lib/i18n/localizedName";
import { playSfx, SFX } from "../lib/sfx";
import { resolveHitTargetBox } from "../lib/hitTarget";

interface GameScreenProps {
  session: GameSession;
  stageNumber: number;
  totalStages: number;
  remainingTimeSec: number;
  /** 이 판에 남은 힌트 횟수. 카운터는 useGameProgress가 들고 있다 — 이 컴포넌트는
   *  단계마다 리마운트되므로 여기 두면 "게임당 3회"가 "단계당 3회"가 된다. */
  hintsRemaining: number;
  onConsumeHint: () => void;
  /** 이 판에서 힌트 설문을 처음 띄우는 경우에만 true를 돌려준다(이후에는 false). */
  onMarkHintSurveyShown: () => boolean;
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
  hintsRemaining,
  onConsumeHint,
  onMarkHintSurveyShown,
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
  /** 힌트 설문 오버레이에 띄울 문항. null이면 설문을 띄우지 않는다. */
  const [hintSurveyQuestion, setHintSurveyQuestion] = useState<SurveyQuestion | null>(null);
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

  /**
   * 가릴 줄의 인덱스. **한 번 뽑아서 고정한다** — 열 때마다 다시 뽑으면 클립보드를
   * 여닫는 것만으로 전부 드러난다. `HintClipboard`는 닫을 때 언마운트되므로 그쪽에
   * 두면 반드시 매번 다시 뽑힌다. 여기 있으면 단계가 바뀔 때(리마운트) 새로 뽑히는데,
   * 힌트 목록 자체가 달라지는 시점이라 그게 맞는 동작이다.
   *
   * 슬롯이 2개 이하인 단계에서는 -1(가리지 않음)이 나온다 — `pickHintMaskIndex` 참고.
   */
  const [hintMaskIndex] = useState(() => pickHintMaskIndex(totalDifferences));
  const maskedHintNames = applyHintMask(hintNames, hintMaskIndex);

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

  // 힌트 설문을 미리 받아 둔다. **'?'를 누른 뒤에 부르면 그 사이가 통째로 침묵이고,
  // 게임 타이머는 그동안에도 돈다**(2026-08-20 제보). 캐시가 모듈 스코프라
  // 단계마다 리마운트돼도 요청은 한 번이다.
  useEffect(() => {
    void getHintSurvey();
  }, []);

  const handleImageLoad = () => {
    updateScale();
  };

  // 다 맞히면 축하 모달 없이 다음 레벨로 넘어간다(제한시간이 레벨별이 아니라
  // 게임 전체 단일 타이머로 바뀌면서 중간에 멈춰 세울 이유가 없어졌다).
  // 오답 소진 경로와 같은 지연을 주는 이유는, 방금 맞힌 마지막 정답 표시를 볼 틈도 없이
  // 화면이 바뀌는 것을 막기 위해서다.
  useEffect(() => {
    if (totalDifferences === 0 || foundSlots.size < totalDifferences) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off UI reset tied to this stage-clear transition, not a cascading sync loop
    setIsHintOpen(false);
    // 설문 오버레이도 함께 치운다. 플레이어 의사가 아닌 강제 닫힘이므로 차감·환불
    // 모두 없다(클립보드는 열릴 때 이미 차감됐고 그대로 둔다).
    // 위 disable 주석이 이 줄까지 함께 덮는다 — 규칙이 이펙트당 한 번만 보고하므로
    // 여기에 또 붙이면 "unused eslint-disable" 경고가 난다.
    setHintSurveyQuestion(null);
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
      setHintSurveyQuestion(null);
      setIsShaking(true);
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(100);
      }
      forceAdvanceTimeoutRef.current = setTimeout(() => onForceAdvance(foundSlots.size), FORCE_ADVANCE_DELAY_MS);
    }
  };

  /** 클립보드를 열고 1회 차감한다. 실제로 힌트를 받는 유일한 지점이다. */
  const openClipboard = () => {
    onConsumeHint();
    setIsHintOpen(true);
  };

  /**
   * '?' 버튼. **토글이 아니라 열기 전용이다** — 열려 있는 동안 다시 눌러도 닫히지
   * 않는다. 닫고 다시 열면 1회가 더 나가므로 토글은 곧 실수로 회수를 잃는 경로다.
   *
   * 이 판에서 설문을 아직 띄우지 않았다면 클립보드 대신 설문이 먼저 뜨고, 차감은
   * **응답한 시점**으로 미뤄진다. 두 번째·세 번째 힌트는 설문 없이 곧바로 열린다.
   *
   * **DB가 어떻게 실패하든 플레이어는 힌트를 받는다.** 힌트를 잃는 쪽이 훨씬 나쁘다.
   */
  const handleHintClick = () => {
    if (hintsRemaining <= 0 || isHintOpen || hintSurveyQuestion) return;

    // 첫 힌트가 아니면 설문 없이 곧바로 클립보드.
    // 표시는 **첫 await 이전에** 세운다 — 조회를 기다리는 동안 '?'를 다시 누르면
    // 오버레이가 두 개 뜬다(markHintSurveyShown이 그 판정과 표시를 함께 한다).
    if (!onMarkHintSurveyShown()) {
      openClipboard();
      return;
    }

    void (async () => {
      // 게임 화면에 들어올 때 이미 받아 뒀다(`getHintSurvey`). 대개 즉시 끝나고,
      // 아직이면 그 요청을 기다린다 — 여기서 새로 부르지 않는 것이 요점이다.
      const { questions, pendingIds } = await getHintSurvey();
      // 조회 실패나 문항 0건이면 설문을 건너뛰고 곧바로 클립보드를 연다.
      // **이때도 차감한다** — 힌트를 실제로 받았으므로 공짜가 아니다.
      // pendingIds가 비어 있는 것(전부 응답함/조회 실패)은 실패가 아니다 —
      // pickHintSurveyQuestion이 전체에서 무작위로 재탕한다.
      const question = pickHintSurveyQuestion(questions, pendingIds);
      if (!question) {
        openClipboard();
        return;
      }
      setHintSurveyQuestion(question);
    })();
  };

  /**
   * 설문 응답. 제출 결과를 **await하지 않고** 그대로 힌트를 준다(이란토 지시).
   * `submitSurveyResponses`의 `ok: false`를 화면에 노출하지 말 것 — 쿠폰 경로
   * (`useCouponFlow`)는 이 값을 에러 메시지로 띄우지만 힌트 경로는 무시해야 한다.
   */
  const handleHintSurveyAnswer = (optionIndex: number) => {
    const question = hintSurveyQuestion;
    if (!question) return;
    setHintSurveyQuestion(null);
    void submitSurveyResponses([question], { [question.questionId]: [optionIndex] });
    openClipboard();
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
   *
   * **이미 찾은 슬롯은 제외한다** — renderDeadZones와 같은 이유이며, 이쪽이 더
   * 나쁘다(2026-08-14). `handleSlotClick`은 찾은 슬롯이면 조용히 return하는데
   * 오버레이는 zIndex 1로 남아 있어서, 그 자리가 **아무 반응도 없는 영역**이 된다.
   * 히트 영역은 실루엣보다 크므로 이웃 슬롯을 덮을 수 있고, 그러면 아직 못 찾은
   * 슬롯을 눌러도 먹지 않는다 — "다른 위치를 찍었는데 선택이 안 된다"는 제보가
   * 이 경로다. 오답으로도 처리되지 않아 플레이어는 왜 안 되는지 알 수 없다.
   */
  const renderClickOverlays = (side: "left" | "right") =>
    differenceSlots
      .filter((slot) => !foundSlots.has(slot.slotId))
      .map((slot) => {
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
   * 무판정 구역. 여기를 누르면 **아무 일도 일어나지 않는다**(2026-08-07, 이란토).
   * 거의 맞힌 터치를 오답으로 세지 않기 위한 완충이다 — 오답은 3회 제한과
   * 10점 감점이 걸려 있어 체감이 크다.
   *
   * **실루엣 모양을 따라간다**(2026-08-19 저녁, 실기 확인 후). 사각형이던 동안에는
   * 비스듬히 놓인 큰 파트(7단계 반찬상)의 무판정 사각형이 판 면적의 88%를 덮어
   * **명백한 오답에도 감점이 불가능**했다. 근거와 규칙은 `hitTarget.ts`의
   * `DEAD_ZONE_PX`에 있다.
   *
   * **`deadZone.polygon`이 없을 때 `clipPath`를 걸지 말 것.** `buildClipPath(null)`은
   * "클립 없음"이 아니라 `circle(25%)`를 돌려주므로, 폴리곤 없이 clipPath를 남기면
   * 무판정 구역이 슬롯 1/4짜리 원으로 쪼그라든다 — 의도와 정반대인데 **에러도 나지
   * 않는다.** `hitTarget.test.ts`가 이 줄을 소스에서 직접 검사하는 이유다.
   *
   * **`clipPath`를 다시 걸지 말 것.** `buildClipPath(null)`은 "클립 없음"이 아니라
   * `circle(25%)`를 돌려주므로, 폴리곤만 지우고 clipPath를 남기면 무판정 구역이
   * 슬롯 1/4짜리 원으로 쪼그라든다 — 의도와 정반대인데 **에러도 나지 않는다.**
   * `hitTarget.test.ts`가 이 줄을 소스에서 직접 검사하는 이유다.
   *
   * 배경(오답 판정)보다 위, 정답 영역보다 아래에 깔린다. 하는 일은
   * `stopPropagation`으로 클릭이 배경까지 내려가지 않게 막는 것뿐이다.
   *
   * **이미 찾은 슬롯도 그린다**(2026-08-14). 예전에는 제외했는데, 그 근거였던
   * "오답으로도 처리되지 않는 죽은 영역이 남는다"는 실현된 적이 없다 — 정답
   * 오버레이가 찾은 뒤에도 zIndex 1로 남아 클릭을 먼저 삼켰기 때문이다.
   * 그 오버레이를 걷어낸 지금 여기서도 빼면 찾은 자리가 배경까지 뚫려
   * **다 맞힌 슬롯을 누를 때마다 10점 감점 + 오답 1회**가 된다(체크 표시에는
   * 핸들러가 없어 그것을 눌러도 마찬가지다).
   *
   * 무판정 구역은 zIndex 0이라 **이웃 슬롯의 정답 영역을 가리지 않는다** —
   * 여기 남겨두어도 간섭 문제는 생기지 않는다.
   */
  const renderDeadZones = (side: "left" | "right") =>
    differenceSlots.map((slot) => {
      const polygon = side === "left" ? slot.leftHitPolygon : slot.rightHitPolygon;
      const slotSizePx = 100 * slot.slotScale * scale;
      const { deadZone } = resolveHitTargetBox(slotSizePx, polygon);

      return (
        <div
          key={`dead-${slot.slotId}`}
          className="absolute"
          style={{
            left: `${slot.x * scale + deadZone.left}px`,
            top: `${slot.y * scale + deadZone.top}px`,
            width: `${deadZone.width}px`,
            height: `${deadZone.height}px`,
            clipPath: deadZone.polygon ? buildClipPath(deadZone.polygon) : undefined,
            zIndex: 0,
          }}
          onClick={(e) => e.stopPropagation()}
        />
      );
    });

  /**
   * **출제되지 않은 슬롯의 오답 영역**(2026-08-19, 이란토 제보 + 실기 확인).
   *
   * 무판정 구역은 차이 슬롯에만 그려지지만 그 사각형이 **이웃한 미출제 슬롯 위를
   * 덮는다.** 실기(1단계)에서 오른쪽 위 대추가 옆 슬롯(새우)의 무판정 구역 안에
   * 통째로 들어가, 대추를 눌러도 감점이 일어나지 않았다. 무판정은 "빗나간 터치"를
   * 봐주는 완충이지 **다른 물체를 정확히 누른 터치**를 봐주는 장치가 아니다.
   *
   * 무판정에서 이웃 실루엣을 도려내는 것은 사각형 하나로 표현할 수 없어서, 반대로
   * 미출제 슬롯이 자기 실루엣을 **무판정 위에** 얹는다. 폴리곤은 이미 전 슬롯에
   * 대해 계산돼 있다(`computeSlotPolygons`는 차이 슬롯만 도는 게 아니다).
   *
   * **핸들러를 달지 말 것.** 클릭이 그대로 배경까지 올라가 `handleBackgroundClick`이
   * 오답으로 세는 것이 이 레이어의 전부다 — 하는 일은 무판정 구역이 먼저 삼키지
   * 못하게 위에 서 있는 것뿐이다.
   *
   * **여유(safe-zone)나 56px 보정을 주지 말 것.** 이건 눌러야 하는 표적이 아니라
   * 감점 판정이라, 넓히면 정답 슬롯의 여유를 거꾸로 잡아먹는다. 슬롯 캔버스 크기
   * 그대로에 실루엣 clip만 씌운다(폴리곤 좌표가 캔버스 기준 %라 재배치도 필요 없다).
   *
   * 폴리곤이 없으면 그리지 않는다 — 실루엣을 모르는 채 캔버스를 통째로 깔면
   * 이웃 차이 슬롯의 정답 영역까지 덮는다.
   */
  const renderDecoyZones = (side: "left" | "right") =>
    session.slots
      .filter((slot) => !slot.isDifference)
      .map((slot) => {
        const polygon = side === "left" ? slot.leftHitPolygon : slot.rightHitPolygon;
        if (!polygon || polygon.length < 3) return null;
        const slotSizePx = 100 * slot.slotScale * scale;

        return (
          <div
            key={`decoy-${slot.slotId}`}
            className="absolute"
            style={{
              left: `${slot.x * scale}px`,
              top: `${slot.y * scale}px`,
              width: `${slotSizePx}px`,
              height: `${slotSizePx}px`,
              clipPath: buildClipPath(polygon),
              zIndex: 0,
            }}
          />
        );
      });

  /**
   * 정답 표시. 슬롯 중심에 고정 크기로 놓는다 — 히트 영역의 clip-path 바깥이라
   * 실루엣 모양과 무관하게 항상 온전한 크기로 보인다.
   * 오답 표시(renderWrongMarks)와 같은 32px, 같은 중심 정렬 방식이다.
   */
  /**
   * **`pointer-events-none`을 붙이지 말 것**(2026-08-19). 마커는 캔버스 중심에
   * 놓이는데 무판정 구역은 실루엣 bbox를 따라가므로, 치우친 실루엣에서는 마커가
   * 무판정 바깥으로 삐져나간다. 클릭을 통과시키면 그 자리가 배경까지 내려가
   * **다 맞힌 슬롯의 체크 표시를 눌렀는데 10점 감점 + 오답 1회**가 된다.
   * 여기서 `stopPropagation`으로 삼킨다.
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
            className="absolute animate-in zoom-in"
            onClick={(e) => e.stopPropagation()}
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

  // 높이는 `h-dvh`다 — 다른 화면의 `min-h-dvh`와 다르고, 둘 다 `vh`가 아니다.
  //
  // `vh`는 **툴바가 없는 상태의 높이**로 고정돼서, 하단 툴바가 두꺼운 브라우저에서는
  // 그만큼 화면이 넘친다. iOS Firefox 실기에서 게임판이 잘려 위아래로 스크롤하며
  // 플레이해야 했다(2026-08-12 제보). `dvh`는 툴바를 뺀 실제 가시 높이라
  // 브라우저·제조사가 달라도 알아서 맞는다 — 안드로이드는 기본 브라우저와 화면 규격이
  // 제각각이라 개별 대응이 불가능하다.
  //
  // **`env(safe-area-inset-*)`로는 못 고친다.** 그건 OS 노치·홈 인디케이터용이고
  // 브라우저 툴바와 무관하다. 일반 탭에서는 OS 인셋이 이미 뷰포트에서 빠져 있어
  // `viewport-fit=cover` 없이는 0으로 계산된다 — 넣어도 아무것도 안 바뀐다.
  //
  // 이 화면만 `min-`이 없는 이유: 게임 중 페이지가 스크롤되면 안 된다. `min-h-dvh`는
  // 내용이 길어지면 늘어나므로 아래 `main`의 `overflow-auto`가 무의미해진다.
  // `h-dvh`로 루트를 묶어야 `flex-1`인 main이 함께 묶이고, 넘치는 내용은 페이지가
  // 아니라 **main 안에서만** 스크롤된다(헤더와 게이지는 제자리에 남는다).
  //
  // 바탕은 다른 화면과 같은 --bg다. 예전엔 이 화면만 더 어두운 --bg-deep을 썼는데,
  // 밝은 테마로 바꾼 뒤로는 (1) 이 화면만 눈에 띄게 어두워 패널 화면들과 톤이 갈리고,
  // (2) 시간 임박 경고(text-error)의 대비가 1.55까지 떨어져 정작 가장 중요한 경고가
  // 안 보였다(2026-08-11 실측). 그래서 --bg로 합치고 --bg-deep 자체를 없앴다.
  return (
    <div className={`flex flex-col h-dvh bg-bg text-ink ${isShaking ? "animate-shake" : ""}`}>
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
          <div className="photo-frame photo-frame--fit w-full">
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
              {renderDecoyZones("left")}
              {renderClickOverlays("left")}
              {renderFoundMarks()}
              {renderWrongMarks("left")}
            </div>
          </div>

          {/* 문항 인디케이터. 세로 배치에서는 그림 위(order -1)에 가운데 정렬,
              가로 배치에서는 그림 아래 왼쪽 정렬로 돌아간다.

              **`justify-center`가 빠져 있어 실제로는 왼쪽 정렬이었다**(2026-08-13
              실기 확인, 이란토). 당시엔 문항 수를 넘는 칸을 `opacity: 0`으로 감추면서
              자리는 남겨뒀는데, 그 여백이 전부 오른쪽에 몰려 5문항 단계에서 마커가
              왼쪽으로 쏠려 보였다. 여분 칸은 없앴고(`resolveIndicatorCells`) 정렬은
              여기서 지정한다 — 주석이 말하던 동작을 코드가 따라온 것이다.

              오답 카운터와 같은 방식으로 마커 이미지를 그대로 쓴다(2026-08-10, 이란토) —
              한쪽만 원형 도트면 같은 줄에 놓인 두 지표가 다른 체계로 보인다.
              찾은 칸은 불투명, 남은 칸은 opacity-35로 흐리게 (오답 쪽과 동일). */}
          <div
            className="flex items-center justify-center gap-1 order-first md:order-none md:justify-start md:self-start"
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
                className={`w-5 h-5 ${cell === "filled" ? "opacity-100" : "opacity-35"}`}
              />
            ))}
          </div>
        </div>

        {/* 힌트 + 게이지 (두 그림 사이).
            세로 배치에서 **인화지와 좌우 끝을 맞춘다**(`photo-frame--fit`, 2026-08-16 이란토).
            사진이 짧은 화면에서 좁아지는데 이 줄만 `w-full`로 남으면 혼자 튀어나와
            중심이 어긋나 보인다(실측 양쪽 28px). 같은 상한을 쓰므로 자동으로 따라간다 —
            `md:` 가로 배치에서는 그 상한이 100%로 풀리고 `md:w-auto`가 이긴다. */}
        <div className="photo-frame--fit flex md:flex-col items-center gap-2 w-full md:w-auto md:self-stretch md:justify-center shrink-0">
          {/* 잔여 힌트 칸. **'?' 버튼보다 앞(위)** — "second gauge의 반대편"이라는
              이란토 지시다.

              **`.time-gauge`를 재사용하지 말 것**(2026-08-13에 그렇게 만들었다가
              되돌렸다). 총 칸 수만 `--gauge-total: 3`으로 갈아끼우면 시간 게이지를
              길이만 짧게 찌그러뜨린 모양이 되어, 같은 굵기의 막대 두 개가 나란히
              붙어 "같은 종류의 지표 둘"로 읽힌다 — 하나는 초, 하나는 횟수인데도.

              이란토 지시는 "second gauge의 **표시기와 같은 디자인**으로 3칸"이고,
              그 표시기 방식은 이 화면의 문항·오답 인디케이터가 이미 쓰고 있다 —
              아이콘을 나란히 놓고 남은 만큼 불투명하게. 세 지표가 한 체계로 보인다.

              힌트는 **남은 것**을 세므로 채움 방향이 오답과 반대다(오답은 쓴 것을
              센다). `i < hintsRemaining`이 맞다. */}
          <div
            className="flex md:flex-col items-center gap-1 shrink-0"
            role="img"
            aria-label={t("game.hintRemainingAria", {
              remaining: Math.max(0, hintsRemaining),
              limit: HINT_LIMIT_PER_GAME,
            })}
          >
            {Array.from({ length: HINT_LIMIT_PER_GAME }).map((_, i) => (
              <span
                key={i}
                aria-hidden="true"
                className={`w-4 h-4 border border-wood bg-accent ${
                  i < hintsRemaining ? "opacity-100" : "opacity-20"
                }`}
              />
            ))}
          </div>

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
            className="icon-round-btn w-9 h-9 flex items-center justify-center rounded-full border border-wood bg-surface/90 text-lg leading-none shrink-0 disabled:opacity-40"
            onClick={handleHintClick}
            disabled={hintsRemaining <= 0}
            aria-expanded={isHintOpen}
            aria-label={
              hintsRemaining <= 0 ? t("game.hintExhaustedAria") : t("game.hintButton")
            }
          >
            <span aria-hidden="true">{"❓"}</span>
          </button>

          <div
            /* 두께(h-5/md:w-5)는 베벨 2px + padding 2px이 양쪽으로 8px을 먹기
               때문이다. 예전 h-3(12px)이면 정작 칸이 4px만 남는다.
               배경은 .time-gauge가 --bg로 칠하므로 bg-wood/30을 걷어냈다. */
            className={`time-gauge relative flex-1 md:flex-none h-5 w-full md:h-40 md:w-5 overflow-hidden ${
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
          <div className="photo-frame photo-frame--fit w-full">
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
              {renderDecoyZones("right")}
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
      {/* 두 오버레이는 닫기 핸들러를 공유하지 않는다 — 클립보드는 이미 차감됐으므로
          바깥 탭으로 닫히면 안 되고, 설문은 차감이 없으므로 쉽게 빠져나가야 한다.
          응답 없이 설문을 닫으면 클립보드도 뜨지 않고 차감도 없다. */}
      {isHintOpen && (
        <HintClipboard names={maskedHintNames} onClose={() => setIsHintOpen(false)} />
      )}
      {hintSurveyQuestion && (
        <HintSurveyOverlay
          question={hintSurveyQuestion}
          onAnswer={handleHintSurveyAnswer}
          onDismiss={() => setHintSurveyQuestion(null)}
        />
      )}
    </div>
  );
}
