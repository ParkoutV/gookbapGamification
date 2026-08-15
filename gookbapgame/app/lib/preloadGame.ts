import { STAGE_CONFIG } from "./stageConfig.ts";
import { runWithConcurrencyLimit } from "./concurrencyLimit.ts";
import type { GameSession } from "../actions.ts";

/**
 * `targetDiffCount`는 **폴백일 뿐이다.** 실제 출제 개수는 뽑힌 이미지의
 * `base_images.questions_count`가 정한다(대시보드에서 이미지마다 설정).
 * 그 값이 없거나 0 이하일 때만 이 인자가 쓰인다 — `fetchGameData` 참고.
 */
export type FetchSessionFn = (
  level: number,
  targetDiffCount: number,
  excludeBaseImageId?: number | null
) => Promise<GameSession | null>;

/**
 * 직전 판에서 각 레벨이 쓴 배경 id(`level` → `baseImageId`).
 *
 * 7개 레벨을 **병렬로** 뽑으므로 서로의 선택을 알 수 없고, 서버 액션이라 직전 판도
 *기억하지 못한다. 그래서 호출부가 이 표를 들고 있다가 넘겨준다 — 없으면(첫 판)
 * 그냥 무작위다. 레벨 간 중복은 각 레벨이 자기 풀에서만 뽑아 애초에 불가능하다.
 */
export type LastBaseImageIds = Readonly<Record<number, number>>;

export type LoadImageFn = (url: string) => Promise<void>;

export type LoadError = { key: string; params?: Record<string, string | number> };

export type PreloadResult =
  | { ok: true; sessions: GameSession[] }
  | ({ ok: false } & LoadError);

const PRELOAD_IMAGE_CONCURRENCY = 4;

export function loadImageInBrowser(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`image load failed: ${url}`));
    img.src = url;
  });
}

export async function preloadAllStages(
  fetchSession: FetchSessionFn,
  loadImage: LoadImageFn = loadImageInBrowser,
  lastBaseImageIds: LastBaseImageIds = {}
): Promise<PreloadResult> {
  let sessions: (GameSession | null)[];
  try {
    sessions = await Promise.all(
      STAGE_CONFIG.map((cfg) =>
        fetchSession(cfg.level, cfg.diffCount, lastBaseImageIds[cfg.level] ?? null)
      )
    );
  } catch {
    return { ok: false, key: "preload.sessionError" };
  }

  const missingIndex = sessions.findIndex((s) => s === null);
  if (missingIndex !== -1) {
    return {
      ok: false,
      key: "preload.levelSessionError",
      params: { level: STAGE_CONFIG[missingIndex].level },
    };
  }

  const confirmedSessions = sessions as GameSession[];
  const urls = confirmedSessions.flatMap((s) => [s.leftSceneUrl, s.rightSceneUrl]);

  try {
    await runWithConcurrencyLimit(urls, PRELOAD_IMAGE_CONCURRENCY, loadImage);
  } catch {
    return { ok: false, key: "preload.imageError" };
  }

  return { ok: true, sessions: confirmedSessions };
}
