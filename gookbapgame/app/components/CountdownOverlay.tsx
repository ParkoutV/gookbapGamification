"use client";

import { useEffect, useState } from "react";
import PixelPanel from "./PixelPanel";
import { playSfx, SFX } from "../lib/sfx";

interface CountdownOverlayProps {
  onDone: () => void;
}

/** 한 칸당 머무는 시간. 3 → 2 → 1 → START 네 칸이라 전체 약 3.2초다. */
const STEP_MS = 800;
/** step 0·1·2가 각각 3·2·1, 3이 START. */
const LAST_STEP = 3;

/**
 * 게임 시작 카운트다운. GameScreen 위에 뜨는 **불투명한 팝업 창**이다
 * (2026-08-11 실기 확인, 이란토). 예전에는 배경 없이 글자만 게임판 위에 겹쳐
 * 있었는데, 반투명도 창도 아닌 어중간한 상태라 완성도가 없었다. 오버레이 자체는
 * 투명하게 두고 창(PixelPanel)만 불투명하게 해서 **뒤 게임판은 계속 보인다** —
 * 게임판이 보여야 하는 이유는 KPI에 있다(AGENTS.md: 오버레이가 뜬 시점이
 * 이미 "게임 시작"이다).
 *
 * 타이틀바는 붙이지 않는다(PixelPanel의 title은 옵셔널). 3초 동안 스쳐가는
 * 연출이라 브랜드명 한 줄은 읽히지도 않고 시선만 뺏는다. 종료 화면도 같다.
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

  /*
   * 칸이 바뀔 때마다 소리를 낸다. 3·2·1은 count_ready, START는 count_start다.
   *
   * **위 타이머 이펙트 안에 넣지 말 것.** 저쪽은 `setTimeout` 콜백이 도는 시점,
   * 즉 그 칸이 **끝날 때** 실행된다 — 소리가 한 칸씩 밀린다. 여기는 step이
   * 바뀐 직후, 글자가 나타나는 시점이라 화면과 맞는다.
   *
   * 의존성이 [step] 하나뿐이라 StrictMode에서 두 번 불려도 같은 소리가 겹칠 뿐
   * 진행에는 영향이 없다(playSfx는 실패를 삼키고, 겹침은 원래 허용된다).
   */
  useEffect(() => {
    playSfx(step >= LAST_STEP ? SFX.countStart : SFX.countReady);
  }, [step]);

  /*
   * START는 i18n을 타지 않는다 — 로케일 3종이 전부 같은 영문 리터럴이었다
   * (2026-08-12 확인 후 키 삭제). 종료 화면의 GAME OVER / CLEAR!와 같은 계열의
   * 로고성 표시다.
   */
  const label = step >= LAST_STEP ? "START" : String(LAST_STEP - step);

  return (
    // pointer-events-auto: 카운트다운 중 클릭이 뒤 게임판에 닿으면 오답으로 처리된다.
    // 오버레이가 입력을 통째로 삼킨다.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center pointer-events-auto"
      aria-live="assertive"
      aria-atomic="true"
    >
      <PixelPanel size="card" className="max-w-sm w-full mx-4">
        <div className="game-cue-window">
          {/* key로 칸마다 요소를 갈아치워야 애니메이션이 매번 다시 돈다.
              **크기는 CSS가 정한다** — 예전에는 useFitText가 실측해 인라인으로 넣었는데,
              이 화면은 라벨(3·2·1·START)이 전부 크기 상한에 걸리는 것들이라 그 훅의
              버그를 통째로 맞았다: 상한과 같은 값을 set하면 React가 커밋을 건너뛰어
              훅이 지운 인라인 스타일이 복원되지 않고 글자가 16px로 떴다(2026-08-13,
              이란토 제보). 근거는 globals.css의 `.game-cue`와 AGENTS.md에 있다. */}
          {/* 폰트는 `.game-cue`가 갖는다 — 인라인 var(--font-pixel)을 되살리지 말 것.
              그 변수는 zh에서 본문 폰트로 바뀌는데 크기 계수가 Galmuri 실측이다. */}
          <span key={step} className="game-cue game-cue--pop">
            {label}
          </span>
        </div>
      </PixelPanel>
    </div>
  );
}
