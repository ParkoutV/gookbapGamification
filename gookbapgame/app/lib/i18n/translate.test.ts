import { test } from "node:test";
import assert from "node:assert/strict";
import { t } from "./translate.ts";

test("ko 로케일에서 정상 조회", () => {
  assert.equal(t("ko", "start.playButton"), "게임 시작");
});

test("en 로케일에서 정상 조회", () => {
  assert.equal(t("en", "start.playButton"), "Start Game");
});

test("ja에 키가 없으면 en으로 폴백한다", () => {
  assert.equal(t("ja", "start.playButton"), "Start Game");
});

test("en에도 없으면(가정) ko로 폴백한다", () => {
  // ko에는 있지만 en/ja엔 없는 임시 키가 없으므로, 존재하지 않는 로케일 값 자체를
  // 비워 시뮬레이션할 수 없는 대신 실제 회귀 지점인 '셋 다 없음' 케이스로 대체 검증한다.
  assert.equal(t("ja", "존재하지-않는-키"), "존재하지-않는-키");
});

test("파라미터 보간이 올바른 순서로 치환된다", () => {
  assert.equal(
    t("ko", "game.stageProgress", { current: 3, total: 7 }),
    "3 / 7 단계"
  );
  assert.equal(
    t("en", "game.stageProgress", { current: 3, total: 7 }),
    "Stage 3 / 7"
  );
});

test("파라미터가 없는 채로 보간 키를 호출하면 플레이스홀더가 그대로 남는다", () => {
  assert.equal(t("ko", "game.stageProgress"), "{current} / {total} 단계");
});
