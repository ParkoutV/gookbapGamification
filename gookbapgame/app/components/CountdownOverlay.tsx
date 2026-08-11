"use client";

import { useEffect, useState } from "react";
import { useLocale } from "../lib/i18n/LocaleContext";

interface CountdownOverlayProps {
  onDone: () => void;
}

/** 한 칸당 머무는 시간. 3 → 2 → 1 → START 네 칸이라 전체 약 3.2초다. */
const STEP_MS = 800;
/** step 0·1·2가 각각 3·2·1, 3이 START. */
const LAST_STEP = 3;

/**
 * 게임 시작 카운트다운. GameScreen 위에 덮이는 오버레이라 뒤로 게임판이 비쳐 보인다.
 *
 * **진행은 반드시 setTimeout이 몰고 간다.** CSS 애니메이션의 onAnimationEnd로
 * 다음 칸으로 넘기면 prefers-reduced-motion에서 `animation: none`이 걸리는 순간
 * 이벤트가 오지 않아 카운트다운이 영영 끝나지 않는다 — 이건 장식이 아니라
 * **타이밍 게이트**라서 멈추면 게임 자체가 멈춘다. CSS는 확대·페이드만 맡는다.
 *
 * 같은 이유로 reduced-motion에서도 숫자와 시간은 그대로 간다(globals.css). Confetti처럼
 * 아무것도 안 그리는 처리를 하면 게이트가 통째로 사라진다.
 *
 * 그래픽 애셋을 만들지 않는다 — 이미 임베드된 픽셀 폰트(Galmuri11)에 그림자를 넣고
 * 살짝 기울인다.
 */
export default function CountdownOverlay({ onDone }: CountdownOverlayProps) {
  const { t } = useLocale();
  const [step, setStep] = useState(0);

  // 칸마다 타이머를 하나씩 건다. 마지막 칸(START)이 끝나면 게이트를 열고
  // **거기서 멈춘다** — step을 더 올리지 않는 것이 요점이다. 올리면 이 이펙트가
  // 한 번 더 돌아 onDone이 두 번 불린다. 지금은 onDone이 게이트만 열어서 두 번
  // 불려도 티가 안 나지만, 여기에 부수효과를 붙이는 순간 조용히 두 번 실행된다.
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (step >= LAST_STEP) {
        onDone();
        return;
      }
      setStep((prev) => prev + 1);
    }, STEP_MS);
    return () => clearTimeout(timeoutId);
  }, [step, onDone]);

  const label = step >= LAST_STEP ? t("countdown.start") : String(LAST_STEP - step);

  return (
    // pointer-events-auto: 카운트다운 중 클릭이 뒤 게임판에 닿으면 오답으로 처리된다.
    // 오버레이가 입력을 통째로 삼킨다.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center pointer-events-auto"
      aria-live="assertive"
      aria-atomic="true"
    >
      {/* key로 칸마다 요소를 갈아치워야 애니메이션이 매번 다시 돈다. */}
      <span key={step} className="game-cue" style={{ fontFamily: "var(--font-pixel)" }}>
        {label}
      </span>
    </div>
  );
}
