"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

/**
 * 글자가 창 밖으로 넘치지 않도록 font-size를 실측해서 줄인다.
 *
 * **CSS만으로는 못 한다.** `cqw`는 컨테이너 폭만 알 뿐 그 안에 무슨 글자가
 * 들어가는지 모른다. 예전에는 "Galmuri11 라틴 대문자는 약 0.5em"이라는 가정으로
 * 계수를 손으로 역산해 뒀는데(`19cqw`), 실제 폰트를 열어보니 글자마다 0.333~0.833em으로
 * 다르고 GAME OVER는 가정(4.5em)보다 31% 넓은 5.917em이었다 — 그래서 모든 기기에서
 * 창 밖으로 41~55px씩 넘쳤다(2026-08-12, iOS 실기 제보로 드러났지만 폰트 메트릭
 * 문제라 플랫폼 무관이다).
 *
 * 계수를 실측값으로 다시 잡는 것도 방법이지만, 그러면 라벨이 바뀔 때마다 사람이
 * 다시 계산해야 한다. 브라우저는 이미 정확한 폭을 알고 있으므로 그걸 물어본다 —
 * 라벨·폰트·로케일이 무엇이든 자동으로 맞는다.
 *
 * 반환하는 `fontSize`는 `maxPx` 이하다. 짧은 라벨(3·START·CLEAR!)은 상한에 걸려
 * 지금 크기 그대로 남고, 긴 라벨만 줄어든다. 상한이 없으면 카운트다운의 `3` 한 글자가
 * 창 폭을 꽉 채워 거대해진다.
 *
 * @param text 측정 대상. 바뀌면 다시 잰다.
 * @param maxPx 이 크기를 넘지 않는다.
 */
export function useFitText(text: string, maxPx: number) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLElement | null>(null);
  const [fontSize, setFontSize] = useState(maxPx);

  const measure = useCallback(() => {
    const container = containerRef.current;
    const el = textRef.current;
    if (!container || !el) return;

    const available = container.clientWidth;
    if (available <= 0) return;

    /*
     * 상한 크기로 되돌린 뒤 잰다. 줄어든 상태에서 재면 그 크기가 다음 측정의
     * 출발점이 되어, 창이 넓어져도 글자가 영영 작은 채로 남는다(단조 감소).
     */
    el.style.fontSize = `${maxPx}px`;
    const needed = el.scrollWidth;
    if (needed <= 0) return;

    /*
     * skewX(-8deg)와 text-shadow 4px은 scrollWidth에 잡히지 않는다 —
     * transform은 레이아웃 이후에 적용되고 그림자는 페인트 단계다. 둘을 더한
     * 실제 시각 폭이 창 안쪽에 들어가도록 폰트 크기를 역산한다.
     *
     * 구하려는 fs에 대해:
     *   fs * (needed / maxPx)   글자 폭      (fs에 비례)
     * + fs * tan(8deg)          기울임 번짐  (fs에 비례)
     * + SHADOW_PX * 2           그림자       (고정)
     * <= available
     *
     * **비례항과 고정항을 섞지 말 것.** 그림자까지 fs에 비례한다고 보고
     * `(available - 4) * maxPx / (needed + overhang)`으로 잡으면 필요한 것보다
     * 더 줄여놓고도 정작 넘친다(실측으로 확인했다).
     *
     * **그림자 몫이 2배인 이유**: text-shadow는 오른쪽으로만 4px 뻗는데 글자는
     * 가운데 정렬이라 남는 폭이 좌우로 반씩 갈린다. 4px만 빼면 오른쪽 몫이 2px밖에
     * 안 돌아가 그림자가 2px 삐져나간다(실측). 8px을 빼야 오른쪽에 4px이 남는다.
     */
    const SHADOW_PX = 4;
    const SKEW_RATIO = Math.tan((8 * Math.PI) / 180);
    const next = Math.min(
      maxPx,
      (available - SHADOW_PX * 2) / (needed / maxPx + SKEW_RATIO),
    );

    el.style.fontSize = "";
    setFontSize(next);
  }, [maxPx]);

  useLayoutEffect(() => {
    measure();

    /*
     * 웹폰트(Galmuri11)가 늦게 오면 첫 측정은 폴백 폰트 폭이라 값이 틀린다.
     * 로드가 끝나면 다시 잰다. 이미 로드됐으면 즉시 resolve되므로 분기가 필요 없다.
     */
    let alive = true;
    document.fonts?.ready.then(() => {
      if (alive) measure();
    });

    /* 회전·창 크기 변경. 컨테이너가 창 폭에 묶여 있어 같이 바뀐다. */
    const observer = new ResizeObserver(measure);
    if (containerRef.current) observer.observe(containerRef.current);

    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [measure, text]);

  return { containerRef, textRef, fontSize };
}
