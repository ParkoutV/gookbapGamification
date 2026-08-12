"use client";

import { useEffect } from "react";
import { isSfxMuted, playSfx, preloadSfx, SFX } from "../lib/sfx";
import { resumeBgm } from "../lib/bgm";

/**
 * 화면의 모든 버튼에 클릭 소리를 붙인다.
 *
 * 버튼마다 onClick에 playSfx를 심지 않고 document 한 곳에서 위임 처리하는 이유:
 * 버튼이 수십 개라 일일이 심으면 반드시 빠뜨리는 곳이 생기고, 새 버튼을 만들 때마다
 * 기억해야 하는 규칙이 하나 늘어난다(예전 `touch`가 딱 그렇게 세 곳에만 붙어 있었다).
 *
 * **pointerdown에 건다.** click은 손을 뗄 때 발생해서 :active 표시보다 늦고,
 * 누른 채 밖으로 끌어 취소하면 아예 오지 않는다 — 눌리는 느낌과 소리가 어긋난다.
 *
 * 캡처 단계로 듣는다. 버튼 핸들러가 stopPropagation을 부르는 경우가 있는데,
 * 버블 단계였다면 그런 버튼만 조용해진다.
 */
export function useButtonClickSfx(): void {
  useEffect(() => {
    // 여기서 효과음을 미리 받아 디코드한다. 시작 버튼에 걸면 늦다 — 첫 pointerdown이
    // 시작 버튼이라는 보장이 없고(언어 선택·약관 팝업·소리 토글이 앞선다),
    // 버퍼가 없는 재생은 조용히 건너뛰어져 첫 클릭만 소리가 안 난다.
    preloadSfx();

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;

      // 진짜 <button>과, 버튼처럼 동작하는 요소(카드의 role="button" div) 모두 잡는다.
      const el = target.closest('button, [role="button"], a[href]');
      if (!el) return;

      // 비활성 버튼은 눌러도 아무 일이 없으므로 소리도 내지 않는다 —
      // 소리가 나면 "눌렸는데 왜 반응이 없지"가 된다.
      if (el instanceof HTMLButtonElement && el.disabled) return;
      if (el.getAttribute("aria-disabled") === "true") return;

      playSfx(SFX.click);
    };

    /*
     * 첫 사용자 제스처에서 BGM을 깨운다.
     *
     * `useBgm`이 마운트 시점에 이미 `play()`를 걸지만 자동재생 정책에 막혀 거부된다.
     * 여기서 한 번 더 밀어줘야 실제로 소리가 난다.
     *
     * **버튼 판정 바깥이다.** 화면 아무 데나 눌러도 시작되어야 한다 — 첫 조작이
     * 버튼이라는 보장이 없고, 여기서 놓치면 다음 버튼을 누를 때까지 무음이다.
     * `resumeBgm`은 이미 재생 중이면 아무것도 하지 않으므로 매번 불려도 된다.
     */
    const onFirstGesture = () => resumeBgm(isSfxMuted());

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointerdown", onFirstGesture, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointerdown", onFirstGesture, true);
    };
  }, []);
}
