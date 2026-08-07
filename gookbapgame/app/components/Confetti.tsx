"use client";

import { useEffect, useRef } from "react";

/**
 * 만점 축하 폭죽. canvas 하나에 사각 조각을 그린다.
 *
 * DOM 노드 수십 개 대신 canvas를 쓰는 이유: 조각마다 엘리먼트를 만들면 리플로우가
 * 잦고, 어차피 픽셀 아트 톤이라 그리는 것은 사각형뿐이라 canvas 쪽이 단순하다.
 *
 * 소리는 내지 않는다(2026-08-07 결정, 이란토). 결과표의 coindrop이 이미 울리고,
 * 만점자에게만 소리를 하나 더 얹을 이유가 없다는 판단.
 */

/**
 * 무지개 파스텔. **이곳만 테마 색을 따르지 않는 예외다**(2026-08-07, 이란토).
 * 다른 화면 요소는 어두운 우드톤에 맞추지만, 만점 폭죽은 축하 연출이라
 * 화면에서 튀는 것이 목적이다. 이 배열을 테마 색으로 되돌리지 말 것.
 *
 * 원색을 흰색과 반씩 섞은 값이다 — 어두운 배경 위에서 원색 그대로는 탁해 보이고,
 * 흰빛이 섞이면 조각이 빛을 받은 것처럼 보인다.
 */
const COLORS = [
  "#FF9D97", // 빨강
  "#FFCA80", // 주황
  "#FFE680", // 노랑
  "#99E3AC", // 초록
  "#80E3DF", // 청록
  "#80BDFF", // 파랑
  "#D7A9EF", // 보라
  "#FF96CA", // 분홍
];

const PIECE_COUNT = 90;
/** 이 시간이 지나면 조각을 더 그리지 않고 멈춘다. 계속 돌면 배터리만 먹는다. */
const DURATION_MS = 5000;

type Piece = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  spin: number;
};

export default function Confetti() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 움직임을 줄여달라고 한 사용자에게는 아무것도 그리지 않는다. 화면 가득
    // 흩날리는 조각은 전정 장애가 있는 사람에게 실제로 불편을 준다.
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;

    const dpr = window.devicePixelRatio || 1;
    let width = 0;
    let height = 0;

    const resize = () => {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // 화면 위쪽 밖에서 시작해 아래로 흩날린다. x는 전 폭에 고루 퍼뜨린다.
    const pieces: Piece[] = Array.from({ length: PIECE_COUNT }, () => ({
      x: Math.random() * width,
      y: -Math.random() * height * 0.5,
      vx: (Math.random() - 0.5) * 60,
      vy: 80 + Math.random() * 120,
      size: 5 + Math.random() * 7,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rotation: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 4,
    }));

    let frame = 0;
    let startTime: number | null = null;
    let lastTime: number | null = null;

    const tick = (now: number) => {
      if (startTime === null) startTime = now;
      // 초 단위 델타로 움직여야 프레임률이 달라도 같은 속도로 떨어진다.
      const dt = lastTime === null ? 0 : Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      const elapsed = now - startTime;
      if (elapsed > DURATION_MS) {
        ctx.clearRect(0, 0, width, height);
        return;
      }

      // 끝날 무렵 서서히 옅어진다. 갑자기 사라지면 눈에 띄게 끊긴다.
      const fade = elapsed > DURATION_MS - 800 ? (DURATION_MS - elapsed) / 800 : 1;

      ctx.clearRect(0, 0, width, height);
      ctx.globalAlpha = fade;

      for (const p of pieces) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rotation += p.spin * dt;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      }

      ctx.globalAlpha = 1;
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 w-full h-full pointer-events-none z-50"
    />
  );
}
