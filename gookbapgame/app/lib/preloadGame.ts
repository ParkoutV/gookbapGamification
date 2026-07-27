import { STAGE_CONFIG } from "./stageConfig.ts";
import { runWithConcurrencyLimit } from "./concurrencyLimit.ts";
import type { GameSession } from "../actions.ts";

export type FetchSessionFn = (
  level: number,
  targetDiffCount: number
) => Promise<GameSession | null>;

export type LoadImageFn = (url: string) => Promise<void>;

export type PreloadResult =
  | { ok: true; sessions: GameSession[] }
  | { ok: false; error: string };

const PRELOAD_IMAGE_CONCURRENCY = 4;

export function loadImageInBrowser(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`이미지 로드 실패: ${url}`));
    img.src = url;
  });
}

export async function preloadAllStages(
  fetchSession: FetchSessionFn,
  loadImage: LoadImageFn = loadImageInBrowser
): Promise<PreloadResult> {
  const sessions = await Promise.all(
    STAGE_CONFIG.map((cfg) => fetchSession(cfg.level, cfg.diffCount))
  );

  const missingIndex = sessions.findIndex((s) => s === null);
  if (missingIndex !== -1) {
    return {
      ok: false,
      error: `${STAGE_CONFIG[missingIndex].level}단계 게임 데이터를 불러오지 못했습니다.`,
    };
  }

  const confirmedSessions = sessions as GameSession[];
  const urls = confirmedSessions.flatMap((s) => [s.leftSceneUrl, s.rightSceneUrl]);

  try {
    await runWithConcurrencyLimit(urls, PRELOAD_IMAGE_CONCURRENCY, loadImage);
  } catch {
    return {
      ok: false,
      error: "이미지를 불러오는데 실패했습니다. 네트워크 상태를 확인해주세요.",
    };
  }

  return { ok: true, sessions: confirmedSessions };
}
