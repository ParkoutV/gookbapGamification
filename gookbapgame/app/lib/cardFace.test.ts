import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveCardFace } from "./cardFace.ts";
import { ONLINE_COUPON_EMOJI } from "./couponEmoji.ts";
import type { IssuedCoupon } from "./issuedCoupons.ts";

const STORE_COUPON: IssuedCoupon = {
  couponId: "11111111-2222-3333-4444-555555555555",
  couponType: { ko: "수육 한 접시" },
  isUsed: false,
  expiredAt: null,
};

const base = { locale: "ko" as const, fallbackName: "온라인몰 쿠폰" };

/* ── 여기부터가 이 파일이 생긴 이유다 ────────────────────────────────
   가챠가 온라인몰 쿠폰을 뽑으면 `usesCard`가 false가 되어 **카드 연출이 통째로
   건너뛰어졌다**(2026-08-21 실기). `gatcha_logs`는 이미 들어간 뒤라 뽑기 한 판을
   쓰고도 카드를 못 보는 상태였다. 2026-08-17에 `wonButHidden`에서 같은 증상이
   한 번 났고 그때 분기만 갈랐다가 되살아난 것이라, 회귀를 여기서 고정한다. */
test("wonOnline은 카드를 쓴다 — 코드를 앞면에 올린다", () => {
  const face = resolveCardFace({ ...base, status: "wonOnline", code: "B43BF088282C4" });
  assert.equal(face?.kind, "online");
  assert.equal(face && face.kind === "online" && face.code, "B43BF088282C4");
});

test("wonOnline: 코드가 없으면 카드를 쓰지 않는다", () => {
  // 코드가 이 쿠폰의 전부다. 빈 카드를 뒤집게 하느니 텍스트 분기로 보낸다.
  assert.equal(resolveCardFace({ ...base, status: "wonOnline" }), null);
  assert.equal(resolveCardFace({ ...base, status: "wonOnline", code: "   " }), null);
});

test("won은 쿠폰 행이 있어야 카드를 쓴다", () => {
  const face = resolveCardFace({ ...base, status: "won", coupon: STORE_COUPON });
  assert.deepEqual(face, { kind: "store", coupon: STORE_COUPON });
  assert.equal(resolveCardFace({ ...base, status: "won" }), null);
});

test("miss도 카드를 쓴다", () => {
  assert.deepEqual(resolveCardFace({ ...base, status: "miss" }), { kind: "miss" });
});

/* 뽑기가 성립하지 않은 결과들. 카드를 뒤집게 하면 기회를 소진한 것처럼 보인다. */
test("rejected·error·wonButHidden은 카드를 쓰지 않는다", () => {
  for (const status of ["rejected", "error", "wonButHidden"]) {
    assert.equal(resolveCardFace({ ...base, status }), null, status);
  }
});

/* 혜택 문구는 운영자가 web_coupon_settings.title에 적는다. 로케일 파일의
   webCoupon.label은 **조회 실패 시 기본값일 뿐**이라 화면에 하드코딩하지 말 것. */
test("온라인 쿠폰 이름은 settings에서 온다", () => {
  const face = resolveCardFace({
    ...base,
    status: "wonOnline",
    code: "ABC",
    settingsTitle: { ko: "1원 할인 쿠폰 (쿠폰삭제 필수)", en: "Web Coupon" },
  });
  assert.equal(face && face.kind === "online" && face.name, "1원 할인 쿠폰 (쿠폰삭제 필수)");
});

/* 실제 데이터가 `ja: ""`, `zh` 키 없음이라 폴백이 늘 걸리는 경로다(webCoupons.ts).
   resolveLocalizedName이 요청 → en → ko로 떨어뜨린다. */
test("요청 로케일이 비면 en으로 떨어진다", () => {
  const face = resolveCardFace({
    ...base,
    locale: "ja",
    status: "wonOnline",
    code: "ABC",
    settingsTitle: { ko: "1원 할인 쿠폰", en: "Web Coupon", ja: "" },
  });
  assert.equal(face && face.kind === "online" && face.name, "Web Coupon");
});

test("settings가 없으면 호출부가 넘긴 기본 이름을 쓴다", () => {
  const face = resolveCardFace({ ...base, status: "wonOnline", code: "ABC" });
  assert.equal(face && face.kind === "online" && face.name, "온라인몰 쿠폰");
});

/* 코너 마크. 실제 값("1원 할인 쿠폰 …")은 기존 키워드 표의 "할인"에 걸려 🎫가
   나오므로 온라인 전용 상수까지 갈 일이 없다. 표에 안 걸릴 때만 그리로 떨어진다 —
   음식 이모지(DEFAULT_COUPON_EMOJI)가 온라인몰 쿠폰에 붙는 것을 막는 것이 목적이다. */
test("이모지: 이름이 표에 걸리면 그 이모지, 아니면 온라인 기본값", () => {
  const matched = resolveCardFace({
    ...base,
    status: "wonOnline",
    code: "ABC",
    settingsTitle: { ko: "1원 할인 쿠폰" },
  });
  assert.equal(matched && matched.kind === "online" && matched.emoji, "🎫");

  const unmatched = resolveCardFace({
    ...base,
    status: "wonOnline",
    code: "ABC",
    settingsTitle: { ko: "무언가" },
  });
  assert.equal(unmatched && unmatched.kind === "online" && unmatched.emoji, ONLINE_COUPON_EMOJI);
});

/* 서브셋 폰트(NotoEmoji-subset.woff2)는 VS16 클러스터를 그리지 못하고 시스템
   컬러 이모지로 떨어진다 — DEFAULT_COUPON_EMOJI가 "🍽️"여서 코너 마크만 컬러로
   떴던 2026-08-07 사고와 같은 자리다. couponEmoji.test.ts가 그 파일을 훑지만
   이쪽 상수도 같은 규칙을 받는다. */
test("온라인 이모지에 VS16이 붙어 있지 않다", () => {
  assert.ok(!ONLINE_COUPON_EMOJI.includes("️"));
});
