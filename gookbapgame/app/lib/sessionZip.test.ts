import { test } from "node:test";
import assert from "node:assert/strict";
import { zipPlansToSessions } from "./sessionZip.ts";

const plan = (level: number) => ({ level, baseImageId: level * 100 });

/** 성사된 계획 수 × 2개의 URL을 만든다(`[L좌, L우, ...]`). */
const urlsFor = (levels: number[]) => levels.flatMap((l) => [`L${l}-left`, `L${l}-right`]);

test("전부 성공하면 레벨마다 자기 좌/우 URL을 받는다", () => {
  const levels = [1, 2, 3, 4, 5, 6, 7];
  const result = zipPlansToSessions(levels.map(plan), urlsFor(levels));

  assert.equal(result.length, 7);
  result.forEach((r, i) => {
    assert.ok(r);
    assert.equal(r.level, levels[i]);
    assert.equal(r.leftSceneUrl, `L${levels[i]}-left`);
    assert.equal(r.rightSceneUrl, `L${levels[i]}-right`);
  });
});

/*
 * 이 저장소에서 가장 조용히 틀릴 수 있는 자리다. 계획이 실패한 레벨은 조합을 만들지
 * 않으므로 URL도 없다 — 7레벨 중 3단계가 실패하면 URL은 12개다. `plans`의 인덱스로
 * URL을 찾으면 4단계부터 전부 한 칸씩 밀려 **다른 레벨의 그림**을 받게 되는데,
 * 에러가 나지 않아 그대로 게임이 시작된다.
 */
test("일부 레벨의 계획이 실패해도 나머지 레벨이 밀리지 않는다", () => {
  const plans = [plan(1), plan(2), null, plan(4), plan(5), plan(6), plan(7)];
  // 3단계는 조합을 만들지 않았으므로 URL도 없다(12개).
  const urls = urlsFor([1, 2, 4, 5, 6, 7]);

  const result = zipPlansToSessions(plans, urls);

  assert.equal(result.length, 7, "실패한 레벨도 자리는 남는다");
  assert.equal(result[2], null, "3단계는 null이어야 한다");

  // 밀림이 있었다면 4단계가 5단계의 URL을 받는다.
  assert.equal(result[3]?.level, 4);
  assert.equal(result[3]?.leftSceneUrl, "L4-left");
  assert.equal(result[3]?.rightSceneUrl, "L4-right");
  assert.equal(result[6]?.leftSceneUrl, "L7-left", "마지막 레벨까지 밀리지 않는다");
});

test("첫 레벨이 실패한 경우도 나머지가 밀리지 않는다", () => {
  const plans = [null, plan(2), plan(3)];
  const result = zipPlansToSessions(plans, urlsFor([2, 3]));

  assert.equal(result[0], null);
  assert.equal(result[1]?.leftSceneUrl, "L2-left");
  assert.equal(result[2]?.leftSceneUrl, "L3-left");
});

/*
 * `requestUnifiedImages`가 개수를 보장하지만 그 보증은 다른 파일에 있다. 한 칸이라도
 * 밀리면 어느 레벨이 틀렸는지 모르는 채로 틀린 그림이 나가므로, 여기서 통째로 막는다.
 */
test("URL 개수가 계획과 맞지 않으면 통째로 실패로 친다", () => {
  const plans = [plan(1), plan(2), plan(3)];

  assert.deepEqual(zipPlansToSessions(plans, urlsFor([1, 2])), [null, null, null], "부족한 경우");
  assert.deepEqual(
    zipPlansToSessions(plans, urlsFor([1, 2, 3, 4])),
    [null, null, null],
    "남는 경우도 막는다 — 짝이 어긋났다는 뜻이다"
  );
});

test("계획이 전부 실패하면 URL이 없어도 그대로 null 목록이다", () => {
  assert.deepEqual(zipPlansToSessions([null, null], []), [null, null]);
});

test("빈 입력은 빈 결과다", () => {
  assert.deepEqual(zipPlansToSessions([], []), []);
});
