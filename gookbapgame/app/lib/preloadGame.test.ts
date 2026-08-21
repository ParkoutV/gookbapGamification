import { test } from "node:test";
import assert from "node:assert/strict";
import { STAGE_CONFIG } from "./stageConfig.ts";
import { createSessionPrewarm, fetchAllSessions, preloadAllStages } from "./preloadGame.ts";
import type { PreloadResult } from "./preloadGame.ts";

test("모든 레벨/이미지가 성공하면 세션 전체를 반환하고 이미지를 전부 로드한다", async () => {
  const fakeSessions = STAGE_CONFIG.map((cfg) => ({
    level: cfg.level,
    leftSceneUrl: `/api/scene?level=${cfg.level}&side=left`,
    rightSceneUrl: `/api/scene?level=${cfg.level}&side=right`,
    slots: [],
    baseImageId: cfg.level * 100, baseImageTitle: null,
  }));
  const loadedUrls: string[] = [];

  const result = await preloadAllStages(
    async (levels) => levels.map((c) => fakeSessions.find((s) => s.level === c.level) ?? null),
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
    async (levels) =>
      levels.map(({ level }) =>
        level === 3 ? null : { level, leftSceneUrl: "x", rightSceneUrl: "y", slots: [], baseImageId: level * 100, baseImageTitle: null }
      ),
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
    async () => {
      throw new Error("network unreachable");
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
    async (levels) => levels.map(({ level }) => fakeSession(level)),
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
    async (levels, seen) => {
      seenExcludes.push(...levels.map(({ level }) => seen[level] ?? null));
      // 풀이 1장이라 제외 요청과 무관하게 같은 배경을 돌려준다.
      return levels.map(({ level }) => fakeSession(level));
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
    async (levels, lastIds) => {
      seenExcludes.push(...levels.map(({ level }) => lastIds[level] ?? null));
      return levels.map(({ level }) => fakeSession(level));
    },
    async () => {}
  );

  assert.equal(result.ok, true);
  assert.ok(seenExcludes.every((e) => e === null), `제외값: ${seenExcludes.join(",")}`);
});

/* ── 데이터 프리워밍 (createSessionPrewarm) ─────────────────────────────
 *
 * `runPreload`가 이 래치를 쓰는 방식을 그대로 흉내낸 헬퍼로 검사한다.
 * 훅 테스트 인프라가 없으므로 소비 규약만 순수 로직으로 확인한다.
 */

/** `runPreload`의 세션 확보 부분(이미지 로드 이전)과 같은 순서다. */
async function takeOrFetch(
  prewarm: ReturnType<typeof createSessionPrewarm>,
  fallback: () => Promise<PreloadResult>
): Promise<PreloadResult> {
  const prewarmed = prewarm.take();
  const fetched = prewarmed ? await prewarmed : null;
  return fetched?.ok ? fetched : await fallback();
}

function fakeSession(level: number) {
  return { level, leftSceneUrl: "x", rightSceneUrl: "y", slots: [], baseImageId: level * 100, baseImageTitle: null };
}

/*
 * 이걸 빠뜨리면 2026-08-15에 43252ed로 막은 중복이 되살아난다 — 프리워밍한 세트가
 * ref에 남으면 '다시하기'가 배경도 정답 위치도 똑같은 판을 재생한다.
 */
test("프리워밍한 세션은 정확히 한 번만 소비된다 — 두 번째 판은 다시 받는다", async () => {
  let calls = 0;
  const fetchSessions = async (): Promise<PreloadResult> => {
    calls += 1;
    return fetchAllSessions(async (levels) => levels.map(({ level }) => fakeSession(level)));
  };

  const prewarm = createSessionPrewarm(fetchSessions);
  prewarm.start();

  const first = await takeOrFetch(prewarm, fetchSessions);
  assert.equal(first.ok, true);
  assert.equal(calls, 1, "첫 판은 프리워밍한 것을 그대로 쓴다");

  const second = await takeOrFetch(prewarm, fetchSessions);
  assert.equal(second.ok, true);
  assert.equal(calls, 2, "두 번째 판은 새로 받아야 한다(같은 세트 재생 금지)");
});

test("프리워밍 중 시작을 눌러도 중복 요청이 생기지 않는다", async () => {
  let calls = 0;
  let release: (() => void) | null = null;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const fetchSessions = async (): Promise<PreloadResult> => {
    calls += 1;
    await gate;
    return fetchAllSessions(async (levels) => levels.map(({ level }) => fakeSession(level)));
  };

  const prewarm = createSessionPrewarm(fetchSessions);
  prewarm.start();

  // 프리워밍이 아직 in-flight인 상태에서 시작을 누른다.
  const pending = takeOrFetch(prewarm, fetchSessions);
  release!();
  const result = await pending;

  assert.equal(result.ok, true);
  assert.equal(calls, 1, "진행 중인 프로미스를 기다릴 뿐 새로 부르지 않는다");
});

test("start를 여러 번 불러도 요청은 한 번뿐이다 — pointerdown은 매 탭마다 온다", async () => {
  let calls = 0;
  const prewarm = createSessionPrewarm(async (): Promise<PreloadResult> => {
    calls += 1;
    return fetchAllSessions(async (levels) => levels.map(({ level }) => fakeSession(level)));
  });

  prewarm.start();
  prewarm.start();
  prewarm.start();

  await prewarm.take();
  assert.equal(calls, 1);
});

/*
 * 프리워밍 실패는 조용히 넘긴다. 실패 결과를 그대로 화면에 흘리면 첫 탭 때의
 * 네트워크 끊김이 10초 뒤 누른 시작까지 망가뜨린다 — 정상 경로로 다시 받아야 한다.
 */
test("프리워밍이 실패해도 에러가 되지 않고 정상 경로로 다시 받는다", async () => {
  let fallbackCalls = 0;
  const prewarm = createSessionPrewarm(async (): Promise<PreloadResult> =>
    fetchAllSessions(async () => {
      throw new Error("network unreachable");
    })
  );
  prewarm.start();

  const result = await takeOrFetch(prewarm, async () => {
    fallbackCalls += 1;
    return fetchAllSessions(async (levels) => levels.map(({ level }) => fakeSession(level)));
  });

  assert.equal(result.ok, true, "프리워밍 실패가 에러 상태로 새어나가면 안 된다");
  assert.equal(fallbackCalls, 1);
});

test("프리워밍한 적이 없으면 take는 null이고 정상 경로가 받는다", async () => {
  let fallbackCalls = 0;
  const prewarm = createSessionPrewarm(async (): Promise<PreloadResult> => {
    throw new Error("불려서는 안 된다");
  });

  assert.equal(prewarm.take(), null);

  const result = await takeOrFetch(prewarm, async () => {
    fallbackCalls += 1;
    return fetchAllSessions(async (levels) => levels.map(({ level }) => fakeSession(level)));
  });

  assert.equal(result.ok, true);
  assert.equal(fallbackCalls, 1);
});
