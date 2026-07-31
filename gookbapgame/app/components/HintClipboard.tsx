"use client";

import React from "react";
import { useLocale } from "../lib/i18n/LocaleContext";

interface HintClipboardProps {
  /** 차이 슬롯당 한 줄. 중복 이름이어도 합치지 않는다. */
  names: string[];
  onClose: () => void;
}

// 애셋 원본 크기 1626x2624 기준 종이 영역의 대략적 위치(래퍼 대비 백분율).
// top이 26%인 것은 금속 집게가 종이 상단을 덮기 때문이다.
const PAPER_INSET = { left: "13%", right: "18%", top: "26%", bottom: "14%" };

// 감열지 인쇄 느낌의 잉크색. 테마의 --ink는 어두운 배경용 밝은 색이라 흰 종이에서 안 보인다.
const PAPER_INK = "#3A2E24";

export default function HintClipboard({ names, onClose }: HintClipboardProps) {
  const { t } = useLocale();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg-deep/70"
      onClick={onClose}
      role="button"
      tabIndex={0}
      aria-label={t("game.hintCloseAria")}
      onKeyDown={(e) => {
        if (e.key === "Escape" || e.key === "Enter" || e.key === " ") onClose();
      }}
    >
      <div
        className="relative"
        // 세로로 긴 애셋(1626x2624)이라 기본은 높이 기준이되, 좁은 화면에서는 폭 기준으로 줄인다.
        // 중요: maxWidth로 자르면 안 된다. 폭이 잘린 래퍼는 애셋보다 가로가 넓어지고,
        // object-contain이 이미지를 위아래 레터박스로 축소시킨다. 그런데 아래 PAPER_INSET은
        // 이미지가 아니라 "래퍼" 기준 백분율이라, 글자 블록이 종이에서 떨어져 나간다.
        // aspectRatio로 래퍼를 항상 애셋 비율과 정확히 같게 유지해야 백분율이 성립한다.
        style={{
          aspectRatio: "1626 / 2624",
          height: "min(88vh, calc(92vw * 2624 / 1626))",
          width: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
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
            // 예산: 종이 세로 = (100-26-14)% × 88vh = 52.8vh.
            // 줄 높이 1.8 × 2.2vh = 3.96vh, 10줄 = 39.6vh, 헤더+여백 ≈ 4.5vh → 약 44vh.
            // 52.8vh 안에 여유 있게 들어간다. 이 값들을 키우려면 다시 계산할 것.
            fontSize: "min(2.2vh, 3.0vw)",
            lineHeight: 1.8,
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
