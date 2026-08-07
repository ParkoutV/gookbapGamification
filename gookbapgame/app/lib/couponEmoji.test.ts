import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveCouponEmoji, DEFAULT_COUPON_EMOJI } from "./couponEmoji.ts";

test("resolveCouponEmoji: 한국어 이름의 키워드로 이모지를 고른다", () => {
  assert.equal(resolveCouponEmoji({ ko: "국밥 1그릇 무료", en: "Free Gookbap" }), "🍲");
  assert.equal(resolveCouponEmoji({ ko: "음료수 1캔" }), "🥤");
});

// "국밥"이 "공기밥"보다 표에서 위에 있어야 성립한다. 순서가 뒤집히면 이 테스트가 깨진다.
test("resolveCouponEmoji: 더 구체적인 키워드가 우선한다", () => {
  assert.equal(resolveCouponEmoji({ ko: "국밥" }), "🍲");
  assert.equal(resolveCouponEmoji({ ko: "공기밥 추가" }), "🍚");
});

test("resolveCouponEmoji: 매칭되지 않으면 기본 이모지", () => {
  // 순대는 전용 이모지가 없어 일부러 매핑하지 않았다.
  assert.equal(resolveCouponEmoji({ ko: "맛보기 순대" }), DEFAULT_COUPON_EMOJI);
  assert.equal(resolveCouponEmoji({ ko: "신규 상품" }), DEFAULT_COUPON_EMOJI);
});

test("resolveCouponEmoji: 한국어 이름이 없으면 기본 이모지", () => {
  assert.equal(resolveCouponEmoji({ en: "Free Gookbap" }), DEFAULT_COUPON_EMOJI);
  assert.equal(resolveCouponEmoji(null), DEFAULT_COUPON_EMOJI);
  assert.equal(resolveCouponEmoji(undefined), DEFAULT_COUPON_EMOJI);
});

/**
 * VS16(U+FE0F)이 붙은 이모지는 서브셋 폰트가 그리지 못하고 시스템 컬러 이모지로
 * 떨어진다 — GSUB을 비운 서브셋이라 클러스터가 합쳐지지 않기 때문이다(couponEmoji.ts 주석).
 * `docs/check-emoji-font.py`는 코드포인트를 낱개로 보므로 이걸 잡지 못한다.
 *
 * 매핑 표가 export되지 않아 소스를 직접 읽는다 — 표에 이모지를 새로 추가해도
 * 자동으로 검사 대상이 된다.
 */
test("couponEmoji.ts의 이모지에는 VS16(U+FE0F)이 없다", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("./couponEmoji.ts", import.meta.url), "utf-8");
  // 주석에서 VS16을 설명하는 줄은 제외하고, 실제 코드의 문자열 리터럴만 본다.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const offenders = [...code.matchAll(/"([^"]*️[^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(offenders, [], `VS16이 붙은 이모지: ${JSON.stringify(offenders)}`);
});
