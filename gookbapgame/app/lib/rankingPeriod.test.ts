import { test } from "node:test";
import assert from "node:assert/strict";
import { rankingPeriodStart } from "./rankingPeriod.ts";

/**
 * 경계는 **실제 시점**이어야 한다. KST 오늘 00:00 = UTC 어제 15:00이므로 기대값을 그
 * 형태로 적는다 — `T00:00:00Z`가 기대값에 나타나면 그것이 9시간 구멍이다.
 */
const iso = (period: Parameters<typeof rankingPeriodStart>[0], now: string) =>
  rankingPeriodStart(period, new Date(now))?.toISOString() ?? null;

test("total은 경계가 없다", () => {
  assert.equal(rankingPeriodStart("total", new Date("2026-08-13T04:00:00Z")), null);
});

/*
 * **이 저장소가 정확히 여기서 조용히 틀릴 수 있다.** `kstDayStart`(couponRemaining.ts)를
 * 재사용해 `T00:00:00Z`로 경계를 만들면 KST 00:00~09:00에 플레이한 기록이 통째로
 * 사라지고 오류는 나지 않는다. 아래 세 시각은 모두 KST 8/13이므로 daily 경계가 항상
 * UTC 8/12 15:00이어야 한다.
 */
test("daily: KST 00:00~09:00 구간에서도 경계가 KST 오늘 00:00이다", () => {
  // KST 8/13 00:30 (UTC 8/12 15:30) — 구멍의 시작
  assert.equal(iso("daily", "2026-08-12T15:30:00Z"), "2026-08-12T15:00:00.000Z");
  // KST 8/13 08:59 (UTC 8/12 23:59) — 구멍의 끝
  assert.equal(iso("daily", "2026-08-12T23:59:00Z"), "2026-08-12T15:00:00.000Z");
  // KST 8/13 13:00 (UTC 8/13 04:00) — 구멍 밖. 같은 값이어야 한다.
  assert.equal(iso("daily", "2026-08-13T04:00:00Z"), "2026-08-12T15:00:00.000Z");
});

test("daily: KST 자정을 넘기면 경계도 하루 넘어간다", () => {
  // KST 8/13 23:30 (UTC 8/13 14:30)
  assert.equal(iso("daily", "2026-08-13T14:30:00Z"), "2026-08-12T15:00:00.000Z");
  // KST 8/14 00:30 (UTC 8/13 15:30) — 60분 차이지만 날짜가 넘어갔다.
  assert.equal(iso("daily", "2026-08-13T15:30:00Z"), "2026-08-13T15:00:00.000Z");
});

/*
 * 2026-08-10이 월요일이다. `Date.getDay()`는 일요일이 0이므로 그대로 빼면 일요일에
 * **다음 주** 월요일로 건너뛴다 — `(day + 6) % 7`이 그것을 막는다.
 */
test("weekly: 월요일 당일이면 그날 00:00이다", () => {
  // KST 월 8/10 10:00 (UTC 8/10 01:00)
  assert.equal(iso("weekly", "2026-08-10T01:00:00Z"), "2026-08-09T15:00:00.000Z");
});

test("weekly: 주 중간(목요일)에도 그 주 월요일이다", () => {
  // KST 목 8/13 13:00
  assert.equal(iso("weekly", "2026-08-13T04:00:00Z"), "2026-08-09T15:00:00.000Z");
});

test("weekly: 일요일은 그 주의 마지막 날이다 — 다음 주 월요일로 건너뛰지 않는다", () => {
  // KST 일 8/16 20:00 (UTC 8/16 11:00). 같은 주의 월요일은 8/10이다.
  assert.equal(iso("weekly", "2026-08-16T11:00:00Z"), "2026-08-09T15:00:00.000Z");
  // 하루 뒤(월 8/17)면 경계가 8/17로 넘어간다.
  assert.equal(iso("weekly", "2026-08-17T11:00:00Z"), "2026-08-16T15:00:00.000Z");
});

test("weekly: KST 00:00~09:00의 일요일도 그 주 월요일이다", () => {
  // KST 일 8/16 00:30 (UTC 8/15 15:30) — 요일을 기기 시간대로 구하면 여기서 토요일이 된다.
  assert.equal(iso("weekly", "2026-08-15T15:30:00Z"), "2026-08-09T15:00:00.000Z");
});

test("weekly: 월을 거슬러 올라가는 주도 맞는다", () => {
  // KST 수 2026-09-02. 그 주 월요일은 8/31이다.
  assert.equal(iso("weekly", "2026-09-02T04:00:00Z"), "2026-08-30T15:00:00.000Z");
});

test("monthly: 1일이면 그날 00:00이다", () => {
  // KST 8/1 00:30 (UTC 7/31 15:30) — 구멍 구간의 월초
  assert.equal(iso("monthly", "2026-07-31T15:30:00Z"), "2026-07-31T15:00:00.000Z");
});

test("monthly: 월말에도 그 달 1일이다", () => {
  // KST 8/31 23:30 (UTC 8/31 14:30)
  assert.equal(iso("monthly", "2026-08-31T14:30:00Z"), "2026-07-31T15:00:00.000Z");
  // KST 9/1 00:30 (UTC 8/31 15:30) — 60분 뒤인데 달이 넘어간다.
  assert.equal(iso("monthly", "2026-08-31T15:30:00Z"), "2026-08-31T15:00:00.000Z");
});

/*
 * 연말 경계. UTC로는 아직 12월 31일인데 KST로는 이미 1월 1일인 구간이 있어, 기기
 * 시간대로 연도를 구하면 monthly가 **작년 12월**을 가리킨다.
 */
test("연말: KST 1/1 00:30이면 monthly는 1월 1일, weekly도 그 주 월요일이다", () => {
  // KST 2027-01-01 00:30 = UTC 2026-12-31 15:30
  assert.equal(iso("monthly", "2026-12-31T15:30:00Z"), "2026-12-31T15:00:00.000Z");
  assert.equal(iso("daily", "2026-12-31T15:30:00Z"), "2026-12-31T15:00:00.000Z");
  // 2027-01-01은 금요일이므로 그 주 월요일은 2026-12-28이다.
  assert.equal(iso("weekly", "2026-12-31T15:30:00Z"), "2026-12-27T15:00:00.000Z");
});

test("윤년 2월 말도 맞는다", () => {
  // KST 2028-02-29 10:00 (2028은 윤년)
  assert.equal(iso("monthly", "2028-02-29T01:00:00Z"), "2028-01-31T15:00:00.000Z");
  assert.equal(iso("daily", "2028-02-29T01:00:00Z"), "2028-02-28T15:00:00.000Z");
});
