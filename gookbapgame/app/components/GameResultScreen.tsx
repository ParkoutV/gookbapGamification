"use client";

import React, { useEffect, useState } from "react";
import { ScoreBreakdown, GukbapTier } from "../lib/stageConfig";
import { gukbapTierKey } from "../lib/i18n/gukbapTierKey";
import { useLocale } from "../lib/i18n/LocaleContext";
import PixelPanel from "./PixelPanel";
import { playSfx, playTick, SFX } from "../lib/sfx";
import Confetti from "./Confetti";
import ScoreTwinkle from "./ScoreTwinkle";

/** 항목 하나가 0에서 제 값까지 차오르는 시간. */
const ROW_FILL_MS = 320;
/** 틱 소리 간격. 프레임마다 울리면 60Hz라 소리가 뭉갠다. */
const TICK_MS = 45;

/**
 * 등장 연출용 타이머. 상태는 progress 하나뿐이고, 값은 "지금 몇 번째 항목까지
 * 찼는가"를 뜻한다. 항목 i의 채움 비율 = clamp(progress - i, 0, 1) — 그래서
 * 위에서부터 하나씩 순서대로 숫자가 올라간다.
 */
function useRevealProgress(count: number) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // matchMedia는 서버에 없다. 마운트 후에 읽어 연출을 건너뛰는 것이 이 분기의 전부다.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProgress(count);
      return;
    }
    let raf = 0;
    let lastSlot = -1;
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      const p = Math.min(elapsed / ROW_FILL_MS, count);
      // 시간으로 끊는다 — 표시 숫자가 바뀔 때마다 울리면 점수 크기에 따라
      // 초당 수백 번이 되거나 몇 번뿐이 되거나 한다.
      const slot = Math.floor(elapsed / TICK_MS);
      if (p < count && slot !== lastSlot) {
        lastSlot = slot;
        // 아래 항목으로 갈수록 음이 올라간다. 총점 줄에서 가장 높다.
        playTick(784 + Math.floor(p) * 55);
      }
      setProgress(p);
      if (p < count) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [count]);

  return progress;
}

const fillAt = (progress: number, index: number) =>
  Math.min(Math.max(progress - index, 0), 1);

interface GameResultScreenProps {
  scoreBreakdown: ScoreBreakdown;
  gukbapTier: GukbapTier;
  onNext: () => void;
}

export default function GameResultScreen({
  scoreBreakdown,
  gukbapTier,
  onNext,
}: GameResultScreenProps) {
  const { t } = useLocale();

  const rows: { label: string; value: number; isPenalty: boolean }[] = [
    { label: t("gameResult.stageScore"), value: scoreBreakdown.stageScore, isPenalty: false },
    { label: t("gameResult.timeBonus"), value: scoreBreakdown.timeBonus, isPenalty: false },
    { label: t("gameResult.comboBonus"), value: scoreBreakdown.comboBonus, isPenalty: false },
    {
      label: t("gameResult.wrongTouchPenalty"),
      value: scoreBreakdown.wrongTouchPenalty,
      isPenalty: true,
    },
    {
      label: t("gameResult.incompleteLevelPenalty"),
      value: scoreBreakdown.incompleteLevelPenalty,
      isPenalty: true,
    },
  ];

  // 1953점이 총점의 실제 만점이고 그때만 이 등급이 나온다(stageConfig의
  // GUKBAP_TIER_CUTOFFS). 폭죽과 축하음이 함께 이 조건을 본다.
  const isMaster = gukbapTier === "1953 Master";

  // 항목 다섯 줄 + 총점 한 줄.
  const progress = useRevealProgress(rows.length + 1);
  const totalFill = fillAt(progress, rows.length);
  const revealDone = progress >= rows.length + 1;

  // 결과가 나왔다는 신호. **만점자만 다른 소리가 난다**(2026-08-19, 이란토) —
  // coindrop에 얹는 게 아니라 대신 나므로 두 소리가 겹치지 않는다.
  // **카운트업이 끝난 뒤에 운다**(같은 날). 예전에는 마운트 즉시였는데 0.94s짜리
  // coindrop이 tick 소리와 통째로 겹쳐 들리지 않았다.
  // reduced-motion에서는 progress가 즉시 차므로 예전처럼 바로 난다.
  useEffect(() => {
    if (revealDone) playSfx(isMaster ? SFX.gratulate : SFX.coindrop);
  }, [revealDone, isMaster]);

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh text-ink p-6 pb-[var(--footer-space)]">
      {/* 만점자 축하 연출. 소리는 여기서 내지 않는다 — 위 이펙트가 coindrop 자리에
          gratulate를 대신 재생한다.

          **점수가 다 차오른 뒤에 터진다**(2026-08-19, 이란토). 카운트업과 겹치면
          축하가 무엇에 대한 것인지 흐려진다 — 총점이 1953으로 확정되는 순간이
          터뜨릴 자리다. `progress`가 마지막 칸(총점)까지 찼는지가 그 신호다.

          reduced-motion에서는 progress가 즉시 count가 되므로 예전처럼 바로 뜬다. */}
      {isMaster && revealDone && <Confetti />}

      <PixelPanel size="card" title={t("window.brand")} className="max-w-sm w-full text-center">
        <h1 className="text-2xl font-extrabold mb-6 text-ink">{t("gameResult.title")}</h1>
        <dl className="space-y-2 mb-6 text-left">
          {rows.map((row, i) => {
            const fill = fillAt(progress, i);
            return (
              <div
                key={row.label}
                className="flex justify-between"
                style={{
                  opacity: fill > 0 ? 1 : 0,
                  transform: `translateY(${(1 - fill) * 6}px)`,
                }}
              >
                <dt className="text-muted">{row.label}</dt>
                <dd className="text-ink font-bold">
                  {row.isPenalty && row.value > 0 ? "-" : ""}
                  {Math.round(row.value * fill)}
                </dd>
              </div>
            );
          })}
        </dl>
        {/* 총점은 `/1953`을 떼고 점수만 쓴다(2026-08-19, 이란토). 만점이 얼마인지는
            랭킹에서 확인되고, 결과표에서는 불필요한 요소를 걷어내는 편이 낫다는 판단.
            대신 숫자를 한 단계 키워(`text-3xl`) 항목 줄들과 위계를 벌렸다.
            **라벨은 `text-xl`로 둔다** — 같이 키우면 ja/zh의 긴 라벨이 `max-w-sm`
            패널에서 숫자를 밀어낸다. */}
        <div className="border-t border-wood pt-4 mb-2">
          <div
            className="flex justify-between items-baseline text-xl font-extrabold"
            style={{ opacity: totalFill > 0 ? 1 : 0 }}
          >
            <span className="text-ink">{t("gameResult.totalLabel")}</span>
            {/* twinkle은 이 래퍼를 기준으로 흩어진다. `absolute`라 레이아웃을 밀지
                않으며, 넘친 조각이 패널 테두리에 잘리지 않도록 `overflow`를 주지 않는다. */}
            <span className="relative">
              <span className="text-accent text-3xl" style={{ fontFamily: "var(--font-pixel)" }}>
                {Math.round(scoreBreakdown.total * totalFill)}
              </span>
              {revealDone && <ScoreTwinkle />}
            </span>
          </div>
        </div>
        <p className="text-accent font-bold mb-8" style={{ fontFamily: "var(--font-pixel)" }}>
          {t("gameResult.gukbapPowerLabel", { tier: t(gukbapTierKey(gukbapTier)) })}
        </p>
        <button
          onClick={onNext}
          className="pixel-mask-btn-solid w-full py-3 px-6 bg-accent text-accent-ink font-bold transition-opacity active:scale-95"
        >
          {t("gameResult.nextButton")}
        </button>
      </PixelPanel>
    </div>
  );
}
