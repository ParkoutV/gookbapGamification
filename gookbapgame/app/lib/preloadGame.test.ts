import { test } from "node:test";
import assert from "node:assert/strict";
import { STAGE_CONFIG } from "./stageConfig.ts";
import { preloadAllStages } from "./preloadGame.ts";

test("모든 레벨/이미지가 성공하면 세션 전체를 반환하고 이미지를 전부 로드한다", async () => {
  const fakeSessions = STAGE_CONFIG.map((cfg) => ({
    level: cfg.level,
    leftSceneUrl: `/api/scene?level=${cfg.level}&side=left`,
    rightSceneUrl: `/api/scene?level=${cfg.level}&side=right`,
    slots: [],
    baseImageId: cfg.level * 100,
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

test("특정 레벨 세션 조회가 null이면 실패로 처리하고 해당 레벨을 파라미터에 포함한다", async () => {
  const result = await preloadAllStages(
    async (level) =>
      level === 3 ? null : { level, leftSceneUrl: "x", rightSceneUrl: "y", slots: [], baseImageId: level * 100 },
    async () => {}
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.key, "preload.levelSessionError");
    assert.equal(result.params?.level, 3);
  }
});

test("세션 조회 중 네트워크 오류로 reject되면 예외를 던지지 않고 실패로 처리한다", async () => {
  const result = await preloadAllStages(
    async (level) => {
      if (level === 2) {
        throw new Error("network unreachable");
      }
      return { level, leftSceneUrl: "x", rightSceneUrl: "y", slots: [], baseImageId: level * 100 };
    },
    async () => {}
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.key, "preload.sessionError");
  }
});

test("이미지 로드가 실패하면 실패로 처리한다", async () => {
  const result = await preloadAllStages(
    async (level) => ({ level, leftSceneUrl: "x", rightSceneUrl: "y", slots: [], baseImageId: level * 100 }),
    async () => {
      throw new Error("network fail");
    }
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.key, "preload.imageError");
  }
});

/*
 * 배경이 레벨당 1장뿐인 환경(로컬 픽스처가 그렇다)에서 **다시하기가 막히면 안 된다.**
 * 직전 배경을 후보에서 빼는 방식이었다면 여기서 null → preload.levelSessionError로
 * 게임이 아예 시작되지 않는다. 후순위로 미루는 방식이라 그대로 다시 뽑힌다.
 */
test("직전 배경만 있는 레벨도 다시하기가 된다 — 제외가 아니라 후순위이므로", async () => {
  const lastIds = Object.fromEntries(STAGE_CONFIG.map((cfg) => [cfg.level, cfg.level * 100]));
  const seenExcludes: (number | null | undefined)[] = [];

  const result = await preloadAllStages(
    async (level, _diff, excludeBaseImageId) => {
      seenExcludes.push(excludeBaseImageId);
      // 풀이 1장이라 제외 요청과 무관하게 같은 배경을 돌려준다.
      return { level, leftSceneUrl: "x", rightSceneUrl: "y", slots: [], baseImageId: level * 100 };
    },
    async () => {},
    lastIds
  );

  assert.equal(result.ok, true);
  // 직전 id가 각 레벨에 제대로 전달됐는지도 함께 본다.
  assert.deepEqual(
    seenExcludes.sort((a, b) => Number(a) - Number(b)),
    STAGE_CONFIG.map((cfg) => cfg.level * 100).sort((a, b) => a - b)
  );
});

test("직전 기록이 없으면(첫 판) 제외 없이 부른다", async () => {
  const seenExcludes: (number | null | undefined)[] = [];
  const result = await preloadAllStages(
    async (level, _diff, excludeBaseImageId) => {
      seenExcludes.push(excludeBaseImageId);
      return { level, leftSceneUrl: "x", rightSceneUrl: "y", slots: [], baseImageId: level * 100 };
    },
    async () => {}
  );

  assert.equal(result.ok, true);
  assert.ok(seenExcludes.every((e) => e === null), `제외값: ${seenExcludes.join(",")}`);
});
