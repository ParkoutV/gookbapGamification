import { STAGE_CONFIG } from "./stageConfig.ts";
import { runWithConcurrencyLimit } from "./concurrencyLimit.ts";
import type { GameSession } from "../actions.ts";

/**
 * 7레벨을 **한 번에** 받는다. 레벨별 함수가 아닌 것이 요점이다 — 좌/우 14장의 합성을
 * 요청 하나로 묶으려면 서버 액션도 그 단위여야 한다(`actions.ts`의
 * `planAllGameSessions`). 반환 배열은 입력 `levels`와 같은 순서이며, 실패한 레벨은
 * 그 자리에 `null`이 들어온다.
 *
 * `diffCount`는 **폴백일 뿐이다.** 실제 출제 개수는 뽑힌 이미지의
 * `base_images.questions_count`가 정한다(대시보드에서 이미지마다 설정).
 * 그 값이 없거나 0 이하일 때만 이 인자가 쓰인다 — `planGameSession` 참고.
 */
export type FetchSessionsFn = (
  levels: { level: number; diffCount: number }[],
  lastBaseImageIds: LastBaseImageIds
) => Promise<(GameSession | null)[]>;

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

/** 세션 데이터만 받는다(이미지 다운로드 없음). 프리워밍이 쓰는 절반이다. */
export async function fetchAllSessions(
  fetchSessions: FetchSessionsFn,
  lastBaseImageIds: LastBaseImageIds = {}
): Promise<PreloadResult> {
  let sessions: (GameSession | null)[];
  try {
    sessions = await fetchSessions(
      STAGE_CONFIG.map((cfg) => ({ level: cfg.level, diffCount: cfg.diffCount })),
      lastBaseImageIds
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

  return { ok: true, sessions: sessions as GameSession[] };
}

export async function loadSessionImages(
  sessions: GameSession[],
  loadImage: LoadImageFn = loadImageInBrowser
): Promise<PreloadResult> {
  const urls = sessions.flatMap((s) => [s.leftSceneUrl, s.rightSceneUrl]);
  try {
    await runWithConcurrencyLimit(urls, PRELOAD_IMAGE_CONCURRENCY, loadImage);
  } catch {
    return { ok: false, key: "preload.imageError" };
  }
  return { ok: true, sessions };
}

export async function preloadAllStages(
  fetchSessions: FetchSessionsFn,
  loadImage: LoadImageFn = loadImageInBrowser,
  lastBaseImageIds: LastBaseImageIds = {}
): Promise<PreloadResult> {
  const fetched = await fetchAllSessions(fetchSessions, lastBaseImageIds);
  if (!fetched.ok) return fetched;
  return loadSessionImages(fetched.sessions, loadImage);
}

/**
 * 첫 상호작용 시점에 세션만 미리 받아두는 래치.
 *
 * - **결과값이 아니라 in-flight 프로미스를 담는다** — 프리워밍 도중에 시작을 눌러도
 *   중복 요청 없이 진행 중인 작업을 기다린다.
 * - **`take()`는 한 번 쓰고 비운다.** 남겨두면 '다시하기'가 같은 세트를 그대로 재생해서
 *   `43252ed`가 막은 중복(같은 배경·같은 정답 위치)이 되살아난다.
 * - **`start()`는 페이지 수명당 한 번뿐이다.** 트리거로 쓰는 pointerdown 리스너는
 *   매 탭마다 불리므로, 이 플래그가 없으면 탭할 때마다 14장짜리 벌크 합성 요청이 나간다.
 */
export function createSessionPrewarm(fetchSessions: () => Promise<PreloadResult>) {
  let inFlight: Promise<PreloadResult> | null = null;
  let started = false;
  return {
    start() {
      if (started) return;
      started = true;
      inFlight = fetchSessions();
    },
    take(): Promise<PreloadResult> | null {
      const p = inFlight;
      inFlight = null;
      return p;
    },
  };
}

/** `createSessionPrewarm`이 돌려주는 래치의 타입. 훅이 ref 타입으로 쓴다. */
export type SessionPrewarm = ReturnType<typeof createSessionPrewarm>;
