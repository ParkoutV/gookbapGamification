import { test } from "node:test";
import assert from "node:assert/strict";
import { gatchaLimitNotice } from "./gatchaLimit.ts";

test("days + 1일이면 '하루' 문구를 쓴다", () => {
  assert.deepEqual(gatchaLimitNotice({ limitType: "days", limitN: 1, limitM: 3 }), {
    key: "tutorial.drawLimitDaily",
    params: { count: 3 },
  });
});

test("days + 2일 이상이면 일수를 함께 알린다", () => {
  // "오늘 3회"로 뭉뚱그리면 범위를 좁게 오해한다.
  assert.deepEqual(gatchaLimitNotice({ limitType: "days", limitN: 7, limitM: 5 }), {
    key: "tutorial.drawLimitDays",
    params: { days: 7, count: 5 },
  });
});

/*
 * hours는 KST 자정이 아니라 `now - N시간` 롤링이라(저쪽 draw route 실물),
 * "오늘"이라는 말을 쓸 수 없다 — 키 자체가 갈려야 한다.
 */
test("hours면 '오늘'을 쓰지 않는 별도 키로 간다", () => {
  assert.deepEqual(gatchaLimitNotice({ limitType: "hours", limitN: 6, limitM: 2 }), {
    key: "tutorial.drawLimitHours",
    params: { hours: 6, count: 2 },
  });
});

test("설정이 없으면 안내하지 않는다", () => {
  assert.equal(gatchaLimitNotice(null), null);
});

test("0회·음수는 안내하지 않는다 — '0회까지 가능'은 말이 되지 않는다", () => {
  assert.equal(gatchaLimitNotice({ limitType: "days", limitN: 1, limitM: 0 }), null);
  assert.equal(gatchaLimitNotice({ limitType: "days", limitN: 1, limitM: -1 }), null);
  assert.equal(gatchaLimitNotice({ limitType: "days", limitN: 0, limitM: 3 }), null);
});

test("모르는 limit_type은 days로 친다 — 대시보드 select의 기본값이다", () => {
  assert.deepEqual(gatchaLimitNotice({ limitType: "", limitN: 1, limitM: 3 }), {
    key: "tutorial.drawLimitDaily",
    params: { count: 3 },
  });
});
