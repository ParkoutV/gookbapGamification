import { convexHull, type Point } from "./convexHull.ts";
import sharp from "sharp";

export type { Point };

const ALPHA_THRESHOLD = 16;

export function extractSilhouetteFromRaw(
  width: number,
  height: number,
  data: Uint8Array | Buffer
): Point[] | null {
  const opaquePoints: Point[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha >= ALPHA_THRESHOLD) {
        opaquePoints.push({ x, y });
      }
    }
  }

  if (opaquePoints.length < 3) {
    return null;
  }

  const hull = convexHull(opaquePoints);
  if (hull.length < 3) {
    return null;
  }

  const maxDim = Math.max(width, height);
  const padX = (maxDim - width) / 2;
  const padY = (maxDim - height) / 2;

  return hull.map((p) => ({
    x: (p.x + padX) / maxDim,
    y: (p.y + padY) / maxDim,
  }));
}

const silhouetteCache = new Map<string, Point[] | null>();

export async function getPartSilhouette(
  imageUrl: string,
  fetchImpl: typeof fetch = fetch
): Promise<Point[] | null> {
  if (silhouetteCache.has(imageUrl)) {
    return silhouetteCache.get(imageUrl) ?? null;
  }

  let result: Point[] | null = null;
  try {
    const res = await fetchImpl(imageUrl);
    if (!res.ok) {
      console.warn(`[getPartSilhouette] fetch 실패 (status=${res.status}): ${imageUrl}`);
    } else {
      const buffer = Buffer.from(await res.arrayBuffer());
      const { data, info } = await sharp(buffer)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      result = extractSilhouetteFromRaw(info.width, info.height, data);
      if (!result) {
        console.warn(`[getPartSilhouette] 실루엣 추출 실패 (${info.width}x${info.height}): ${imageUrl}`);
      }
    }
  } catch (error) {
    console.warn(`[getPartSilhouette] 디코딩 예외 (${error instanceof Error ? error.message : error}): ${imageUrl}`);
  }

  silhouetteCache.set(imageUrl, result);
  return result;
}

export type SlotPlacement = {
  offsetX: number;
  offsetY: number;
  partScale: number;
  slotScale: number;
};

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/**
 * 차이 슬롯 한쪽 면의 히트 폴리곤을 만들 재료(실루엣 + 배치)를 고른다.
 *
 * **"있고 없고" 차이에서는 없는 쪽 파트가 완전 투명이라 hull이 null이다**
 * (2026-08-14, 을숙도 산책로 제보). 대시보드에서 차이를 만드는 방식이 빈 이미지를
 * 짝으로 두는 것이라 **차이 슬롯의 절반은 항상** 이 경우이며, 잘못된 데이터가 아니다.
 *
 * null을 그대로 흘리면 `resolveHitTargetBox`가 `useClipPath: false`로 떨어져 히트
 * 영역이 **슬롯 크기의 정사각형**이 된다. 가로로 납작한 파트(산책로)일수록 세로로
 * 크게 부풀어 근처 슬롯(전망대)을 덮어 누를 수 없게 만든다. 그 사각형 폴백은
 * "실루엣 추출 실패"를 위한 방어라 여기서 쓰면 안 된다.
 *
 * 플레이어가 없는 쪽에서 누르는 자리는 "물체가 있었을 자리"이므로 반대쪽 실루엣이
 * 옳다. **배치값도 함께 빌려온다** — 투명 파트의 offset/scale은 화면에 아무것도
 * 그리지 않아 검증된 적이 없고, 어긋나 있으면 히트 영역이 물체가 있는 쪽과 다른
 * 자리에 생긴다.
 *
 * 양쪽 다 null이면 null을 돌려준다 — 그때는 실루엣 추출이 실제로 실패한 것이라
 * 사각형 폴백이 맞다.
 */
export function pickPolygonSource<T>(own: Point[] | null, other: Point[] | null, ownPlacement: T, otherPlacement: T): { hull: Point[]; placement: T } | null {
  if (own) return { hull: own, placement: ownPlacement };
  if (other) return { hull: other, placement: otherPlacement };
  return null;
}

export function mapSilhouetteToSlot(hull: Point[], placement: SlotPlacement): Point[] {
  const boxSize = 100 * placement.slotScale;
  const scale = placement.partScale;

  return hull.map((p) => ({
    x: clamp01(placement.offsetX / boxSize + (1 - scale) / 2 + p.x * scale),
    y: clamp01(placement.offsetY / boxSize + (1 - scale) / 2 + p.y * scale),
  }));
}
