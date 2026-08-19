/**
 * 튜토리얼 각 장의 예시 이미지.
 *
 * 컴포넌트가 아니라 여기에 둔 이유는 테스트다 — `npm test`는
 * `node --experimental-strip-types`로 도는데 JSX를 파싱하지 못한다(`introSlides.ts`와 같다).
 *
 * **크기·비율을 코드가 알지 않는다**(2026-08-19, 이란토). 예전에는 장마다 크롭
 * 비율을 여기 숫자로 적고 화면이 `aspect-ratio`로 썼는데, 애셋을 다시 만들 때마다
 * 이 숫자를 같이 고치지 않으면 그림이 조용히 찌그러지거나 작아졌다 — 실제로
 * 630×953으로 통일한 새 세 장이 옛 숫자(0.63 / 9.69 / 3.24) 때문에 납작해졌다.
 * 지금은 화면이 **상한 둘만 준다**(`max-w-full` / `max-h-[50dvh]`). 브라우저가
 * 파일에서 실제 크기를 읽어 비율을 적용하므로 그림을 갈아끼우기만 하면 된다.
 * 비율 상수를 되살리지 말 것.
 *
 * **마커(링·화살표)를 얹지 않는다.** 크롭 자체가 "여기를 보라"는 역할을 하고,
 * `what`에 링을 치면 정답 위치를 알려주는 셈이라 문장과 모순된다(2026-08-16, 이란토).
 */

/** 키는 `PAGE_KEYS`(`TutorialScreen`)와 같아야 한다 — 없는 장은 이미지 없이 그린다. */
export const TUTORIAL_SHOTS: Readonly<Record<string, string>> = {
  what: "/images/tutorial/what.webp",
  limit: "/images/tutorial/limit.webp",
  score: "/images/tutorial/score.webp",
};
