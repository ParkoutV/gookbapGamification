/**
 * 튜토리얼 각 장의 예시 이미지. 애셋은 `docs/build-tutorial-assets.sh`가 만든다.
 *
 * 컴포넌트가 아니라 여기에 둔 이유는 테스트다 — `npm test`는
 * `node --experimental-strip-types`로 도는데 JSX를 파싱하지 못한다(`introSlides.ts`와 같다).
 *
 * **비율(`aspect`)이 장마다 다르다.** 통짜 스크린샷 하나를 돌려쓰지 않고 본문이
 * 말하는 영역만 잘라냈기 때문이다(그 이유는 빌드 스크립트에 적어뒀다). 화면은 이
 * 값을 `aspect-ratio`로 그대로 쓰므로, 크롭 범위를 바꾸면 **여기 숫자도 같이
 * 고쳐야 한다** — 어긋나면 `object-contain`이 레터박스를 만들어 위아래가 빈다.
 *
 * **마커(링·화살표)를 얹지 않는다.** 크롭 자체가 "여기를 보라"는 역할을 하고,
 * `what`에 링을 치면 정답 위치를 알려주는 셈이라 문장과 모순된다(2026-08-16, 이란토).
 */
export type TutorialShot = {
  src: string;
  /** 크롭 실측 비율(가로/세로). 빌드 스크립트의 crop 값과 일치해야 한다. */
  aspect: number;
};

/** 키는 `PAGE_KEYS`(`TutorialScreen`)와 같아야 한다 — 없는 장은 이미지 없이 그린다. */
export const TUTORIAL_SHOTS: Readonly<Record<string, TutorialShot>> = {
  /** 두 인화지. 나란히 놓은 것 자체가 "비교하라"는 지시다. 630x1005 */
  what: { src: "/images/tutorial/what.webp", aspect: 630 / 1005 },
  /** HUD 띠(힌트·게이지·시간). 가로로 길어 패널 폭을 꽉 채운다. 630x65 */
  limit: { src: "/images/tutorial/limit.webp", aspect: 630 / 65 },
  /** CLEAR! 연출. 결과 집계표가 아니라 게임 안의 마지막 장면이다. 376x116 */
  score: { src: "/images/tutorial/score.webp", aspect: 376 / 116 },
};
