import { test } from "node:test";
import assert from "node:assert/strict";

import { BRAND_LINE_KEYS, INTRO_SLIDES, INTRO_SLIDE_FADE_MS, INTRO_SLIDE_INTERVAL_MS } from "./introSlides.ts";
import { ko } from "./i18n/locales/ko.ts";
import { en } from "./i18n/locales/en.ts";
import { ja } from "./i18n/locales/ja.ts";
import { zh } from "./i18n/locales/zh.ts";

/* 이게 이 파일의 존재 이유다. 키가 빠져도 에러가 나지 않는다 — 폴백 순서
   (요청 로케일 → en → ko → 키 이름)를 타고 조용히 다른 언어가 뜬다.
   zh는 특히 잊기 쉽다(2026-08-13에 나중에 추가된 로케일이라 다른 키도 그랬다). */
test("브랜드 소개글은 네 로케일 모두에 있다", () => {
  for (const [name, dict] of [["ko", ko], ["en", en], ["ja", ja], ["zh", zh]] as const) {
    for (const key of BRAND_LINE_KEYS) {
      const value = dict[key];
      assert.ok(value && value.trim().length > 0, `${name}에 ${key}가 없다`);
    }
  }
});

test("소개글을 뽑는 난수는 항상 유효한 키를 가리킨다", () => {
  // 컴포넌트가 쓰는 것과 같은 식. Math.random()은 [0, 1)이라 상한이 딱 걸린다.
  for (const r of [0, 0.5, 0.999999999]) {
    const key = BRAND_LINE_KEYS[Math.floor(r * BRAND_LINE_KEYS.length)];
    assert.ok(BRAND_LINE_KEYS.includes(key));
  }
});

test("슬라이드 경로는 중복 없이 준비된 애셋을 가리킨다", () => {
  assert.equal(new Set(INTRO_SLIDES).size, INTRO_SLIDES.length);
  for (const src of INTRO_SLIDES) {
    assert.match(src, /^\/images\/intro\/.+\.webp$/);
  }
});

/* fade가 교체 간격보다 길면 다음 장이 시작될 때 이전 장이 아직 사라지는 중이라
   두 장이 계속 겹쳐 보인다. */
test("fade는 교체 간격보다 짧다", () => {
  assert.ok(INTRO_SLIDE_FADE_MS < INTRO_SLIDE_INTERVAL_MS);
});
