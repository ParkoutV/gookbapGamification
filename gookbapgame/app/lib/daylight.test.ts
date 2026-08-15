import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SUNRISE_MIN,
  SUNSET_MIN,
  isoWeekKST,
  kstMinutesOfDay,
  previousStageAtBoundary,
  stageForDate,
  stageForMinutes,
  type DaylightStage,
} from "./daylight.ts";

/** KST 시각을 그대로 적기 위한 헬퍼. `+09:00`이라 실행 환경 시간대와 무관하다. */
const kst = (iso: string) => new Date(`${iso}+09:00`);

test("표는 53주차까지 있다", () => {
  // 손으로 옮겨 적은 배열이라 잘림이 가장 현실적인 실패다. 그리고 클램프가 그 잘림을
  // **가려준다** — 52개짜리 표에 Math.min을 걸면 오류 없이 틀린 주차를 읽는다.
  assert.equal(SUNRISE_MIN.length, 53);
  assert.equal(SUNSET_MIN.length, 53);
  assert.ok(SUNRISE_MIN.every(Number.isInteger));
  assert.ok(SUNSET_MIN.every(Number.isInteger));
});

test("표 검증값 — W01 일출 07:33, 하지 무렵 05:10, 동지 무렵 07:34", () => {
  assert.equal(SUNRISE_MIN[0], 7 * 60 + 33);
  assert.equal(Math.min(...SUNRISE_MIN), 5 * 60 + 10);
  assert.equal(Math.max(...SUNRISE_MIN), 7 * 60 + 34);
});

test("ISO 주차 — 2026년은 53주차가 존재한다", () => {
  assert.equal(isoWeekKST(kst("2026-01-01T12:00:00")), 1);
  assert.equal(isoWeekKST(kst("2026-06-24T12:00:00")), 26);
  assert.equal(isoWeekKST(kst("2026-12-31T12:00:00")), 53);
  // 53주차는 해를 넘어 이어진다(2027-01-03 일요일까지).
  assert.equal(isoWeekKST(kst("2027-01-01T12:00:00")), 53);
  assert.equal(isoWeekKST(kst("2027-12-31T12:00:00")), 52);
});

test("53주차에도 표를 읽을 수 있다 (클램프)", () => {
  // 색인이 범위를 벗어나면 undefined가 나와 NaN 비교로 **조용히** 틀린 배경이 뜬다.
  const week = isoWeekKST(kst("2026-12-31T12:00:00"));
  assert.equal(week, 53);
  for (const minutes of [0, 300, 453, 600, 1000, 1100, 1380, 1439]) {
    const stage = stageForMinutes(minutes, week);
    assert.ok(
      ["dawn", "morning", "day", "evening", "night", "midnight"].includes(stage),
      `week 53 / ${minutes}분에서 ${stage}`
    );
  }
  // 표 밖의 주차를 넣어도 마지막 칸으로 떨어질 뿐 터지지 않는다.
  assert.equal(stageForMinutes(720, 54), stageForMinutes(720, 53));
  assert.equal(stageForMinutes(720, 0), stageForMinutes(720, 1));
});

test("6단계 경계 — W25(하지 무렵, 일출 310 / 일몰 1181)", () => {
  const week = 25;
  const sunrise = SUNRISE_MIN[week - 1];
  const sunset = SUNSET_MIN[week - 1];
  assert.equal(sunrise, 310);
  assert.equal(sunset, 1181);

  const cases: [number, DaylightStage][] = [
    [sunrise - 61, "midnight"],
    [sunrise - 60, "dawn"],
    [sunrise - 1, "dawn"],
    [sunrise, "morning"],
    [sunrise + 179, "morning"],
    [sunrise + 180, "day"],
    [sunset - 91, "day"],
    [sunset - 90, "evening"],
    [sunset + 89, "evening"],
    [sunset + 90, "night"],
    [23 * 60 - 1, "night"],
    [23 * 60, "midnight"],
    [1439, "midnight"],
    [0, "midnight"],
  ];
  for (const [minutes, expected] of cases) {
    assert.equal(stageForMinutes(minutes, week), expected, `${minutes}분`);
  }
});

test("모든 주차에서 6단계가 빈틈·모순 없이 하루를 덮는다", () => {
  for (let week = 1; week <= 53; week += 1) {
    const seen = new Set<DaylightStage>();
    for (let minutes = 0; minutes < 1440; minutes += 1) {
      seen.add(stageForMinutes(minutes, week));
    }
    // 6단계가 모두 나와야 한다 — 하나라도 빠지면 구간 하나가 삼켜진 것이다.
    assert.equal(seen.size, 6, `week ${week}: ${[...seen].join(",")}`);
  }
});

test("midnight은 자정을 넘어 감긴다 — 23:00 직후와 새벽이 같은 단계다", () => {
  // 오름차순 임계값 체인만 쓰면 이 한 칸이 조용히 깨진다.
  for (let week = 1; week <= 53; week += 1) {
    assert.equal(stageForMinutes(23 * 60 + 30, week), "midnight", `week ${week} 23:30`);
    assert.equal(stageForMinutes(60, week), "midnight", `week ${week} 01:00`);
  }
});

test("시각은 KST 고정 — 기기 시간대를 타지 않는다", () => {
  // 2026-06-24T20:00Z = KST 2026-06-25 05:00 → W26 일출 311분(05:11) 직전이라 dawn.
  // 같은 순간을 UTC(20:00)나 뉴욕(16:00)으로 읽으면 night/evening이 된다 —
  // getHours()로 되돌리면 이 케이스가 바로 갈린다.
  const instant = new Date("2026-06-24T20:00:00Z");
  assert.equal(kstMinutesOfDay(instant), 5 * 60);
  assert.equal(stageForDate(instant), "dawn");
  assert.notEqual(stageForMinutes(20 * 60, 26), "dawn"); // UTC로 읽었다면
  assert.notEqual(stageForMinutes(16 * 60, 26), "dawn"); // 뉴욕으로 읽었다면

  // UTC 자정 = KST 09:00. hourCycle h23이 아니면 여기서 "24"가 나오는 ICU 빌드가 있다.
  assert.equal(kstMinutesOfDay(new Date("2026-06-24T15:00:00Z")), 0);
  assert.equal(kstMinutesOfDay(new Date("2026-06-24T00:00:00Z")), 9 * 60);

  // 날짜도 KST 기준으로 넘어간다 — 주차 판정이 하루 어긋나면 안 된다.
  assert.equal(isoWeekKST(new Date("2026-12-27T16:00:00Z")), 53); // KST 12-28 01:00 = W53 월요일
  assert.equal(isoWeekKST(new Date("2026-12-27T14:00:00Z")), 52); // KST 12-27 23:00 = W52 일요일
});

test("경계 부근 접속에만 이전 단계를 돌려준다", () => {
  const week = 25;
  const sunrise = SUNRISE_MIN[week - 1]; // 310 → KST 05:10, 2026-06-17이 W25 수요일
  const day = "2026-06-17";
  const at = (minutes: number) =>
    kst(`${day}T${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00`);

  assert.equal(isoWeekKST(at(720)), week);
  // 일출(morning 진입) 직후 2분 → 직전 단계 dawn으로 시작해 크로스페이드한다.
  assert.equal(previousStageAtBoundary(at(sunrise + 2)), "dawn");
  // 창(5분) 밖이면 그냥 현재 단계 한 장이다.
  assert.equal(previousStageAtBoundary(at(sunrise + 30)), null);
  assert.equal(previousStageAtBoundary(at(720)), null);
  // 23:00 경계도 같다.
  assert.equal(previousStageAtBoundary(at(23 * 60 + 1)), "night");
  assert.equal(previousStageAtBoundary(at(23 * 60 - 1)), null);
});

test("자정 직후 경계 계산이 감긴 시각에서 터지지 않는다", () => {
  // (minutes - window + 1440) % 1440 을 빠뜨리면 음수 색인으로 엉뚱한 단계가 나온다.
  const result = previousStageAtBoundary(kst("2026-06-17T00:02:00"));
  assert.equal(result, null); // 23:57도 00:02도 모두 midnight이다
});
