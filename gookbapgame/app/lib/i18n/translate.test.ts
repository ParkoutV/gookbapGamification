import { test } from "node:test";
import assert from "node:assert/strict";
import { t, translateWith } from "./translate.ts";

test("ko 로케일에서 정상 조회", () => {
  assert.equal(t("ko", "start.playButton"), "게임 시작");
});

test("en 로케일에서 정상 조회", () => {
  assert.equal(t("en", "start.playButton"), "Start Game");
});

test("ja 로케일에서 정상 조회", () => {
  assert.equal(t("ja", "start.playButton"), "ゲーム開始");
});

test("zh 로케일에서 정상 조회", () => {
  assert.equal(t("zh", "start.playButton"), "开始游戏");
});

// 아래 폴백 테스트는 실제 번역 데이터를 쓰지 않는다. ja 사전이 채워질수록
// "ja에 그 키가 없는" 상황을 실제 데이터로 만들 수 없게 되기 때문이다.
const FIXTURE = {
  ko: { onlyKo: "한국어만", all: "한국어" },
  en: { all: "English", noJa: "English only" },
  ja: { all: "日本語" },
  zh: { all: "中文" },
};

test("요청한 로케일에 값이 있으면 그것을 쓴다", () => {
  assert.equal(translateWith(FIXTURE, "ja", "all"), "日本語");
  assert.equal(translateWith(FIXTURE, "zh", "all"), "中文");
});

test("ja에 키가 없으면 en으로 폴백한다", () => {
  assert.equal(translateWith(FIXTURE, "ja", "noJa"), "English only");
});

// 중국어 요청서가 명시한 순서(2026-08-13): zh → en → ko.
// DB에 zh가 아직 없어 당분간 zh 사용자가 늘 타는 경로다.
test("zh에 키가 없으면 en으로, en에도 없으면 ko로 폴백한다", () => {
  assert.equal(translateWith(FIXTURE, "zh", "noJa"), "English only");
  assert.equal(translateWith(FIXTURE, "zh", "onlyKo"), "한국어만");
});

test("en에도 없으면 ko로 폴백한다", () => {
  assert.equal(translateWith(FIXTURE, "ja", "onlyKo"), "한국어만");
});

test("셋 다 없으면 키 이름을 그대로 반환한다", () => {
  assert.equal(translateWith(FIXTURE, "ja", "존재하지-않는-키"), "존재하지-않는-키");
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
