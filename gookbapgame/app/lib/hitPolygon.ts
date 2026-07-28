import { convexHull, type Point } from "./convexHull.ts";
import { PNG } from "pngjs";

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
    if (res.ok) {
      const buffer = Buffer.from(await res.arrayBuffer());
      const png = PNG.sync.read(buffer);
      result = extractSilhouetteFromRaw(png.width, png.height, png.data);
    }
  } catch {
    result = null;
  }

  silhouetteCache.set(imageUrl, result);
  return result;
}
