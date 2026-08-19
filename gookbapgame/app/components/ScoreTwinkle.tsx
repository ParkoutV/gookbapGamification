"use client";

import { useState } from "react";
import { COLORS } from "./Confetti";

/**
 * 결과표 총점 주변에서 한 번 튀는 반짝임.
 *
 * **만점자 전용이 아니다**(2026-08-19, 이란토). 폭죽은 1953점에만 터지지만 이쪽은
 * 모든 점수에서 뜬다 — 총점이 결과표의 주인공이라는 표시이고, 숫자만 덩그러니
 * 놓인 자리가 심심했다는 것이 출발점이다.
 *
 * **색은 테마를 따르지 않고 폭죽의 원색 배열을 그대로 쓴다.** 축하 연출끼리
 * 색이 어긋나면 만점자 화면에서 두 벌처럼 보인다 — `Confetti`의 COLORS 주석 참고.
 *
 * 그리기는 DOM이다. 조각이 십수 개뿐이고 총점 줄이라는 좁은 범위에만 머물러서,
 * canvas를 띄우고 rAF를 돌리는 폭죽 쪽 구조를 가져올 이유가 없다. 애니메이션은
 * `globals.css`의 `score-twinkle`이 전부 맡는다.
 */

/** 조각 수. 총점 한 줄 주변이라 폭죽(70개/발)만큼 필요하지 않다. */
const PIECE_COUNT = 14;
/** 중심에서 흩어지는 거리(px). 총점 줄 높이를 넘지 않을 만큼만. */
const SPREAD_MIN = 30;
const SPREAD_MAX = 78;

type Piece = {
  x: number;
  y: number;
  size: number;
  color: string;
  delay: number;
};

export default function ScoreTwinkle() {
  // **렌더 중에 `Math.random()`을 불러도 안전하다.** 이 컴포넌트는 `revealDone`
  // (rAF로만 참이 된다)일 때만 마운트되므로 서버 렌더를 타지 않는다 —
  // 서버가 그린 좌표와 어긋날 여지 자체가 없다. 다른 자리에서 재사용하게 되면
  // 그 전제부터 다시 볼 것.
  const [pieces] = useState(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return [];
    return Array.from({ length: PIECE_COUNT }, (_, i): Piece => {
      // 각도를 고루 나눈 뒤 흔든다. 순수 난수면 한쪽에 뭉쳐 반짝임이 아니라
      // 얼룩으로 보인다(폭죽의 burst와 같은 이유).
      const angle = (i / PIECE_COUNT) * Math.PI * 2 + Math.random() * 0.5;
      // 가로로 긴 총점 줄이라 세로 확산은 눌러야 패널 위아래로 새지 않는다.
      const dist = SPREAD_MIN + Math.random() * (SPREAD_MAX - SPREAD_MIN);
      return {
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist * 0.55,
        size: 4 + Math.random() * 5,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        delay: Math.random() * 420,
      };
    });
  });

  return (
    <span aria-hidden="true" className="absolute inset-0 pointer-events-none">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="score-twinkle"
          style={
            {
              "--tw-x": `${p.x}px`,
              "--tw-y": `${p.y}px`,
              "--tw-size": `${p.size}px`,
              "--tw-color": p.color,
              "--tw-delay": `${p.delay}ms`,
            } as React.CSSProperties
          }
        />
      ))}
    </span>
  );
}
