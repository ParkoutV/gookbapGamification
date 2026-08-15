"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  FOOTER_SCRIM_ALPHA,
  FOOTER_SCRIM_HEIGHT,
  previousStageAtBoundary,
  stageForDate,
  type DaylightStage,
} from "../lib/daylight";

/** 크로스페이드 길이. 요청서의 "5초의 fade" 그대로다(설계 문서 3절). */
const CROSSFADE_MS = 5000;

const bgUrl = (stage: DaylightStage) => `/images/bg/city_${stage}.webp`;

/**
 * `useSyncExternalStore`의 스냅샷들. **반드시 안정적인 값을 돌려줘야 한다** —
 * 매번 새로 계산하면 React가 무한 루프로 판단한다. 접속 시점 한 번만 읽으면 되는
 * 값이라 모듈 평가 시점에 고정한다(게임 중 시간이 흘러 경계를 넘는 경우는 다루지
 * 않는다 — 설계 문서 3절).
 */
const initialNow = new Date();
const initialStage = stageForDate(initialNow);
const initialFadingFrom = previousStageAtBoundary(initialNow);

/** 값이 바뀌지 않으므로 구독은 아무것도 하지 않는다. */
const subscribeNever = () => () => {};
const getStageSnapshot = () => initialStage;
const getFadingFromSnapshot = () => initialFadingFrom;
/** 서버에서는 배경을 고르지 않는다 — 하이드레이션 불일치를 원천 차단한다. */
const getNullSnapshot = () => null;

/**
 * 시간대 배경(설계 문서 3절). **게임 화면을 뺀 모든 화면에 깔린다**(2026-08-15 이란토).
 *
 * `page.tsx`의 루트에 **한 번만** 둔다 — 화면마다 붙이면 화면이 늘어날 때 반드시
 * 하나를 빠뜨린다. 게임 중에만 가려지는데, 그것은 이 컴포넌트가 phase를 보고 숨는
 * 것이 아니라 **`GameScreen`이 불투명한 `bg-bg`로 덮기 때문**이다(그쪽은 게임판에
 * 집중해야 하고, 배경 사진이 비치면 틀린 그림 찾기에 방해가 된다).
 *
 * 그래서 **다른 화면들은 배경을 투명하게 비워둬야 한다.** 각자 `bg-bg`를 칠하면
 * 이 레이어가 보이지 않는다.
 */
export default function DaylightBackground() {
  // **서버에서는 고르지 않는다.** 이 컴포넌트는 클라이언트 컴포넌트지만 Next가 SSR도
  // 하므로, 경계 부근에서 서버와 클라이언트가 다른 단계를 골라 하이드레이션 불일치가
  // 난다. `getServerSnapshot`이 null을 주면 서버 HTML에는 `<img>`가 아예 없고,
  // 클라이언트가 붙으면서 한 장을 고른다 — **현재 시간대 1장만 받는다**는 요구가
  // 저절로 지켜진다(6장을 미리 받으면 용량 판단의 전제가 깨진다).
  //
  // `useEffect` + `setState` 대신 `useSyncExternalStore`를 쓰는 이유는 그것이 정확히
  // 이 모양("서버와 클라이언트가 다른 값을 보는 외부 소스")을 위한 API이기 때문이다.
  const stage = useSyncExternalStore(subscribeNever, getStageSnapshot, getNullSnapshot);
  // 경계 부근에 접속했을 때만 채워지는 '직전 단계'. 이 창(5분) 안에서만 두 장을 받는다.
  const fadingFromInitial = useSyncExternalStore(
    subscribeNever,
    getFadingFromSnapshot,
    getNullSnapshot
  );
  // 5초가 지나면 아래 장을 떼어낸다 — 남겨두면 계속 두 장을 물고 있다.
  //
  // **초기값을 `false`로 박지 말 것.** `initialFadingFrom`은 모듈 평가 시점에 고정인데
  // 이 state는 컴포넌트 것이라, 언마운트-재마운트되면 리셋된다 — 경계 부근에 접속한
  // 사람이 이미 지난 단계의 5초 페이드를 다시 본다. 접속 후 경과 시간으로 판정하면
  // 그 경로가 막힌다.
  const [fadeDone, setFadeDone] = useState(
    () => Date.now() - initialNow.getTime() >= CROSSFADE_MS
  );
  const fadingFrom = fadeDone ? null : fadingFromInitial;

  useEffect(() => {
    if (!fadingFromInitial) return;
    const timer = setTimeout(() => setFadeDone(true), CROSSFADE_MS);
    return () => clearTimeout(timer);
  }, [fadingFromInitial]);

  // 서버 렌더 시점에는 단계를 고르지 않으므로 아무것도 그리지 않는다. 그 순간 페이지가
  // 투명해지지는 않는다 — `globals.css`의 `body { background: var(--bg) }`가 받는다.
  if (!stage) return null;

  return (
    /* **`fixed`다**(`absolute`가 아니다). 루트에 한 번만 두고 모든 화면 뒤에 깔리므로
       뷰포트에 고정되어야 한다 — 내용이 길어 스크롤되는 화면(설문·쿠폰 목록)에서
       배경이 함께 밀려 올라가면 안 된다. 높이도 `inset-0`이라 `vh`가 개입하지 않는다.

       `-z-10`이 반드시 있어야 한다 — 없으면 이 레이어가 화면 내용을 통째로 덮는다.

       **`pointer-events-none`과 `draggable={false}`가 둘 다 필요하다**(2026-08-15
       이란토 제보). `<img>`는 기본이 `draggable=true`라 데스크톱에서 마우스로 끌면
       배경이 고스트 이미지로 딸려 나온다. `background-image`로 바꾸면 이 문제는 없지만
       크로스페이드(두 장 겹쳐 opacity 전환)와 로드 실패 감지를 잃으므로 `<img>`를 쓴다. */
    <div
      className="fixed inset-0 -z-10 overflow-hidden pointer-events-none bg-bg"
      aria-hidden="true"
    >
      {/* 아래 장(직전 단계)은 경계 부근 접속에만 존재한다. 위 장이 5초에 걸쳐 덮는다. */}
      {fadingFrom && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={bgUrl(fadingFrom)}
          alt=""
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover object-center"
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={bgUrl(stage)}
        alt=""
        draggable={false}
        className="absolute inset-0 w-full h-full object-cover object-center"
        style={
          fadingFrom
            ? { animation: `daylight-crossfade ${CROSSFADE_MS}ms ease-in-out both` }
            : undefined
        }
      />
      {/* 하단 그라데이션. 시작 화면 푸터 글자가 사진 위에서도 읽히게 한다 —
          근거와 실측값은 `daylight.ts`의 `FOOTER_SCRIM_ALPHA` 주석에 있다. */}
      <div
        className="absolute inset-x-0 bottom-0"
        style={{
          height: FOOTER_SCRIM_HEIGHT,
          background: `linear-gradient(to top, rgba(0,0,0,${FOOTER_SCRIM_ALPHA}), rgba(0,0,0,0))`,
        }}
      />
    </div>
  );
}
