/**
 * 로딩 화면(`PreloadScreen`)의 읽을거리 — 순환하는 사진 슬라이드와 고정 소개글.
 *
 * 컴포넌트가 아니라 여기에 둔 이유는 테스트다. `npm test`는
 * `node --experimental-strip-types`로 도는데 JSX를 파싱하지 못하므로 `.tsx`에서
 * import할 수 없다.
 */

/**
 * 슬라이드 3장. **세 장의 비율이 제각각이다**(0.85 / 1.0 / 1.07) —
 * 고정 높이 컨테이너 + `object-contain`으로 담아야 슬라이드가 바뀔 때 창 높이가
 * 출렁이지 않는다. 랭킹 목록이 겪었던 것과 같은 함정이다(`rankingLayout.ts`).
 */
export const INTRO_SLIDES = [
  "/images/intro/1953_brand_1.webp",
  "/images/intro/1953_grandmother_mrs-rah.webp",
  "/images/intro/table.webp",
] as const;

/** 슬라이드 교체 간격(ms). fade 시간(`INTRO_SLIDE_FADE_MS`)보다 넉넉히 길어야 한다. */
export const INTRO_SLIDE_INTERVAL_MS = 3000;

/** 크로스페이드 시간(ms). CSS transition duration과 같은 값이어야 한다. */
export const INTRO_SLIDE_FADE_MS = 800;

/**
 * 브랜드 소개글 키. **로딩 화면이 뜰 때 한 종류를 뽑아 고정한다** — 이미지는
 * 순환하지만 글은 고정이라는 것이 요청서의 요점이다.
 *
 * **네 로케일(ko/en/ja/zh) 모두에 있어야 한다.** 빠지면 폴백 순서(요청 로케일 →
 * en → ko → 키 이름)를 타고 조용히 다른 언어가 뜬다 — 에러가 나지 않아 아무도
 * 모른다. `introSlides.test.ts`가 이걸 잡는다.
 */
export const BRAND_LINE_KEYS = [
  "preload.brandLine1",
  "preload.brandLine2",
  "preload.brandLine3",
] as const;
