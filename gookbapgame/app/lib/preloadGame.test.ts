import { test } from "node:test";
import assert from "node:assert/strict";
import { STAGE_CONFIG } from "./stageConfig.ts";
import { preloadAllStages } from "./preloadGame.ts";

test("모든 레벨/이미지가 성공하면 세션 7개를 반환하고 이미지 14장을 전부 로드한다", async () => {
  const fakeSessions = STAGE_CONFIG.map((cfg) => ({
    level: cfg.level,
    leftSceneUrl: `/api/scene?level=${cfg.level}&side=left`,
    rightSceneUrl: `/api/scene?level=${cfg.level}&side=right`,
    slots: [],
  }));
  const loadedUrls: string[] = [];

  const result = await preloadAllStages(
    async (level) => fakeSessions.find((s) => s.level === level) ?? null,
    async (url) => {
      loadedUrls.push(url);
    }
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.sessions.length, STAGE_CONFIG.length);
  }
  assert.equal(loadedUrls.length, STAGE_CONFIG.length * 2);
});

test("특정 레벨 세션 조회가 null이면 실패로 처리하고 해당 레벨을 메시지에 포함한다", async () => {
  const result = await preloadAllStages(
    async (level) =>
      level === 3 ? null : { level, leftSceneUrl: "x", rightSceneUrl: "y", slots: [] },
    async () => {}
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /3단계/);
  }
});

test("이미지 로드가 실패하면 실패로 처리한다", async () => {
  const result = await preloadAllStages(
    async (level) => ({ level, leftSceneUrl: "x", rightSceneUrl: "y", slots: [] }),
    async () => {
      throw new Error("network fail");
    }
  );

  assert.equal(result.ok, false);
});
