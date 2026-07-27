import { STAGE_CONFIG } from "./stageConfig.ts";
import { runWithConcurrencyLimit } from "./concurrencyLimit.ts";
import type { GameSession } from "../actions.ts";

export type FetchSessionFn = (
  level: number,
  targetDiffCount: number
) => Promise<GameSession | null>;

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
  loadImage: LoadImageFn = loadImageInBrowser
): Promise<PreloadResult> {
  let sessions: (GameSession | null)[];
  try {
    sessions = await Promise.all(
      STAGE_CONFIG.map((cfg) => fetchSession(cfg.level, cfg.diffCount))
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
