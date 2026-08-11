"use client";

import React from "react";
import { useLocale } from "../lib/i18n/LocaleContext";

interface HintClipboardProps {
  /** 차이 슬롯당 한 줄. 중복 이름이어도 합치지 않는다. */
  names: string[];
  onClose: () => void;
}

// 애셋 원본 크기 1626x2624 기준 종이 영역의 위치(래퍼 대비 백분율).
// top이 큰 것은 금속 집게가 종이 상단을 덮기 때문이다. 집게의 가장 아래 지점이
// 래퍼 높이의 약 20% 위치이므로 22%가 사실상 상한이다 — 더 올리면 글자가 집게에 가린다.
const PAPER_INSET = { left: "13%", right: "18%", top: "22%", bottom: "14%" };

// 감열지 인쇄 느낌의 잉크색. 흰 종이 위 글자라 테마와 무관하게 어두워야 한다.
const PAPER_INK = "#1A1F24";

export default function HintClipboard({ names, onClose }: HintClipboardProps) {
  const { t } = useLocale();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "var(--scrim)" }}
      onClick={onClose}
      role="button"
      tabIndex={0}
      aria-label={t("game.hintCloseAria")}
      onKeyDown={(e) => {
        if (e.key === "Escape" || e.key === "Enter" || e.key === " ") onClose();
      }}
    >
      {/* 크기 결정은 globals.css의 .hint-clipboard에 있다 — 방향별 분기가 필요해서
          인라인 스타일로는 표현할 수 없다. 그 클래스가 래퍼를 애셋과 같은 비율로
          고정하고 container-type: size를 걸어, 아래 cqh 단위가 성립하게 한다. */}
      <div className="relative hint-clipboard" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element -- static local decorative asset,
            no next/image optimization needed for a fixed-size overlay graphic */}
        <img
          src="/icons/hint-clipboard.webp"
          alt=""
          className="w-full h-full object-contain select-none pointer-events-none"
        />

        <div
          className="absolute flex flex-col justify-start overflow-hidden"
          style={{
            ...PAPER_INSET,
            color: PAPER_INK,
            fontFamily: "monospace",
            // 1cqh = 래퍼(클립보드) 높이의 1%. 뷰포트가 아니라 클립보드에 비례하므로
            // globals.css의 높이 상한을 바꿔도 글자와 종이의 비율은 그대로 유지된다.
            //
            // 예산: 종이 세로 = (100 - 22 - 14)% = 64cqh. 목표는 9줄 수용.
            // 실제 최대 문제 수는 7개(STAGE_CONFIG)이고, 나머지 2줄은 긴 이름이
            // 줄바꿈될 때를 위한 여유다.
            //
            // 줄 높이 1.5 × 4.1cqh = 6.15cqh.
            // 본문 9줄 55.35cqh + 헤더 6.15cqh + 헤더 아래 여백 12px(≈1.8cqh) = 63.3cqh.
            // 64cqh 안에 0.7cqh 여유.
            //
            // fontSize나 lineHeight를 더 키우려면 9줄 요구를 먼저 낮춰야 한다 — 넘치면
            // overflow-hidden에 줄이 조용히 잘려서 "줄 수 == 차이 슬롯 수"가 깨진다.
            fontSize: "4.1cqh",
            lineHeight: 1.5,
          }}
        >
          <div className="font-bold tracking-widest border-b border-dashed border-current pb-1 mb-2">
            {t("game.hintTitle")}
          </div>
          {names.map((name, i) => (
            <div key={i} className="break-words">
              {name}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
