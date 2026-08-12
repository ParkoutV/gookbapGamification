"use client";

import { useEffect } from "react";
import { BGM, playBgm } from "../lib/bgm";
import { isSfxMuted } from "../lib/sfx";
import type { GamePhase } from "./useGameProgress";

/**
 * phase에 맞는 BGM을 튼다.
 *
 * 게임 중(`playing`)만 게임 BGM이고 나머지는 전부 메인이다. **`gameEnd`는 메인으로
 * 돌아간다** — 게임이 끝난 시점이 곡이 바뀌는 지점이고(2026-08-12, 이란토
 * "게임이 시작되고 종료될 때까지"), 그 화면에서는 CLEAR!/GAME OVER 멜로디가
 * 따로 울리므로 게임 BGM이 이어지면 겹친다.
 *
 * 카운트다운은 `playing` 안의 불리언이라 자연히 게임 BGM에 들어간다.
 *
 * **자동재생 정책 때문에 마운트만으로는 시작되지 않는다.** 첫 사용자 제스처
 * 전까지 `play()`는 거부되고, 그건 정상 동작이라 `playBgm`이 조용히 삼킨다.
 * 실제 시작은 `useButtonClickSfx`가 첫 pointerdown에서 다시 부를 때 걸린다 —
 * 첫 제스처가 시작 버튼이라는 보장이 없어서(언어 선택, 약관 팝업, 소리 토글)
 * 그쪽에 걸어야 한다. `preloadSfx`를 거기 둔 것과 같은 이유다.
 */
export function useBgm(phase: GamePhase): void {
  useEffect(() => {
    playBgm(phase === "playing" ? BGM.game : BGM.main, isSfxMuted());
  }, [phase]);
}
