"use client";

import { useEffect, useRef } from "react";

/**
 * 만점 축하 폭죽. canvas 하나에 사각 조각을 그린다.
 *
 * DOM 노드 수십 개 대신 canvas를 쓰는 이유: 조각마다 엘리먼트를 만들면 리플로우가
 * 잦고, 어차피 픽셀 아트 톤이라 그리는 것은 사각형뿐이라 canvas 쪽이 단순하다.
 *
 * 소리는 여기서 내지 않는다. 만점자 축하음(`gratulate`)은 결과표가 coindrop 자리에
 * 대신 재생하므로(2026-08-19, 이란토) 이 컴포넌트가 소리를 얹으면 두 번 울린다.
 */

/**
 * 무지개 원색. **이곳만 테마 색을 따르지 않는 예외다**(2026-08-07, 이란토).
 * 다른 화면 요소는 회색 크롬에 맞추지만, 만점 폭죽은 축하 연출이라
 * 화면에서 튀는 것이 목적이다. 이 배열을 테마 색으로 되돌리지 말 것.
 *
 * **밝기는 배경에 종속된다.** 예전 어두운 테마에서는 원색을 흰색과 반씩 섞은
 * 파스텔이었다 — 어두운 바탕에서 원색은 탁해 보이고 흰빛이 섞여야 빛을 받은 듯
 * 보였기 때문이다. 밝은 데스크톱으로 바꾼 뒤로는 그 파스텔이 바탕에 묻혀
 * 거의 안 보인다(2026-08-11). 그래서 원색 쪽으로 되돌렸다.
 * 배경 밝기를 다시 바꾸면 이 배열도 같이 봐야 한다.
 */
export const COLORS = [
  "#E02B20", // 빨강
  "#F07000", // 주황
  "#E8B400", // 노랑
  "#1FA345", // 초록
  "#00A0A8", // 청록
  "#1560D8", // 파랑
  "#8A3FD1", // 보라
  "#E0338C", // 분홍
];

/** 터지는 횟수와 간격. 화면 여기저기서 연달아 터지는 인상을 만든다. */
const BURST_COUNT = 3;
const BURST_INTERVAL_MS = 1000;
/** 한 발의 조각이 살아 있는 시간. */
const PIECE_LIFE_MS = 3000;
const PIECES_PER_BURST = 70;

/**
 * 방사 속도(px/s). 중심에서 사방으로 흩어지는 세기다.
 * 화면 절반 이상을 가로지를 만큼 크게 잡는다 — 작으면 중심에 뭉쳐 고리처럼 보인다.
 */
const SPEED_MIN = 700;
const SPEED_MAX = 1400;
/** 중력(px/s²). 터진 뒤 아래로 가라앉는다. */
const GRAVITY = 900;
/**
 * 공기 저항(60fps 한 프레임당 남는 속도 비율). 1에 가까울수록 멀리 날아간다.
 * 0.86처럼 낮게 잡으면 터지자마자 멈춰 중심 주변에만 머문다.
 */
const DRAG = 0.97;

type Piece = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  spin: number;
  /** 이 조각이 태어난 시각(ms). 수명 계산과 페이드에 쓴다. */
  bornAt: number;
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

    const pieces: Piece[] = [];

    /** 화면 안 임의의 지점에서 사방으로 조각을 뿌린다. */
    const burst = (now: number) => {
      // 터지는 지점도 화면 전체에 흩어야 세 발이 같은 자리에서 터진 것처럼 보이지 않는다.
      // 위쪽에 치우치게 두는 것은 중력으로 아래로 쏟아질 여지를 남기기 위해서다.
      const cx = width * (0.15 + Math.random() * 0.7);
      const cy = height * (0.15 + Math.random() * 0.5);

      for (let i = 0; i < PIECES_PER_BURST; i++) {
        // 각도를 고루 나눈 뒤 흔들어야 한쪽으로 뭉치지 않는다.
        const angle = (i / PIECES_PER_BURST) * Math.PI * 2 + Math.random() * 0.3;
        const speed = SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN);
        pieces.push({
          x: cx,
          y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: 5 + Math.random() * 7,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          rotation: Math.random() * Math.PI,
          spin: (Math.random() - 0.5) * 12,
          bornAt: now,
        });
      }
    };

    let frame = 0;
    let startTime: number | null = null;
    let lastTime: number | null = null;
    let fired = 0;

    const tick = (now: number) => {
      if (startTime === null) startTime = now;
      // 초 단위 델타로 움직여야 프레임률이 달라도 같은 속도로 흩어진다.
      const dt = lastTime === null ? 0 : Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      const elapsed = now - startTime;

      // 1초 간격으로 세 발. 첫 발은 즉시 나간다.
      while (fired < BURST_COUNT && elapsed >= fired * BURST_INTERVAL_MS) {
        burst(now);
        fired++;
      }

      ctx.clearRect(0, 0, width, height);

      for (let i = pieces.length - 1; i >= 0; i--) {
        const p = pieces[i];
        const age = now - p.bornAt;
        if (age > PIECE_LIFE_MS) {
          pieces.splice(i, 1);
          continue;
        }

        // 터진 직후 빠르게 퍼지다가 저항으로 느려지고, 중력에 잡혀 내려앉는다.
        const damp = Math.pow(DRAG, dt * 60);
        p.vx *= damp;
        p.vy = p.vy * damp + GRAVITY * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rotation += p.spin * dt;

        // 수명 끝 800ms 동안 옅어진다. 갑자기 사라지면 눈에 띄게 끊긴다.
        const remain = PIECE_LIFE_MS - age;
        ctx.globalAlpha = remain < 800 ? remain / 800 : 1;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      }

      ctx.globalAlpha = 1;

      // 마지막 발까지 쏘고 조각이 모두 사라지면 멈춘다. 계속 돌면 배터리만 먹는다.
      if (fired >= BURST_COUNT && pieces.length === 0) {
        ctx.clearRect(0, 0, width, height);
        return;
      }
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
