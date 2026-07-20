import sharp from "sharp";

export type PartPlacement = {
  x: number;
  y: number;
  slotScale: number;
  offsetX: number;
  offsetY: number;
  partScale: number;
  partNaturalWidth: number;
  partNaturalHeight: number;
};

export type PlacementResult = {
  left: number;
  top: number;
  width: number;
  height: number;
  clipLeft: number;
  clipTop: number;
  clipWidth: number;
  clipHeight: number;
};

export function computePlacement(p: PartPlacement): PlacementResult {
  const box = 100 * p.slotScale;
  const fit = Math.min(box / p.partNaturalWidth, box / p.partNaturalHeight);
  const width = p.partNaturalWidth * fit * p.partScale;
  const height = p.partNaturalHeight * fit * p.partScale;
  const left = p.x + (box - width) / 2 + p.offsetX;
  const top = p.y + (box - height) / 2 + p.offsetY;

  return {
    left,
    top,
    width,
    height,
    clipLeft: p.x,
    clipTop: p.y,
    clipWidth: box,
    clipHeight: box,
  };
}

export type ScenePart = {
  slotId: number;
  x: number;
  y: number;
  slotScale: number;
  offsetX: number;
  offsetY: number;
  partScale: number;
  imageBuffer: Buffer;
  zIndex: number;
};

const SCENE_WIDTH = 1200;
const SCENE_HEIGHT = 800;

export async function composeScene(
  baseImageBuffer: Buffer,
  parts: ScenePart[]
): Promise<Buffer> {
  // base도 파츠와 동일하게 object-contain으로 배치한다 (강제로 늘리지 않음).
  // fit:"fill"을 쓰면 base가 3:2가 아닐 때 CSS(object-contain) 렌더링과 어긋난다.
  const base = sharp(baseImageBuffer).resize(SCENE_WIDTH, SCENE_HEIGHT, {
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });

  const sortedParts = [...parts].sort((a, b) => a.zIndex - b.zIndex);

  const overlays = (
    await Promise.all(
      sortedParts.map(async (part) => {
        const meta = await sharp(part.imageBuffer).metadata();
        const naturalWidth = meta.width ?? 100;
        const naturalHeight = meta.height ?? 100;

        const placement = computePlacement({
          x: part.x,
          y: part.y,
          slotScale: part.slotScale,
          offsetX: part.offsetX,
          offsetY: part.offsetY,
          partScale: part.partScale,
          partNaturalWidth: naturalWidth,
          partNaturalHeight: naturalHeight,
        });

        const resizedPart = await sharp(part.imageBuffer)
          .resize(Math.round(placement.width), Math.round(placement.height))
          .toBuffer();

        // 슬롯 박스(overflow:hidden)로 클립: 확대된 파츠(partScale>1)는 박스 밖으로
        // 나가므로, 파츠와 박스의 교집합 영역만 잘라내 박스 좌표에 배치한다.
        // sharp의 composite는 overlay가 base 경계를 벗어나면 에러를 던지므로
        // (확대 시 left = x - (width-box)/2 는 거의 항상 음수), extract로 먼저
        // 보이는 영역만 잘라내는 방식이 유일하게 안전한 구현이다.
        const clipLeft = Math.round(placement.clipLeft);
        const clipTop = Math.round(placement.clipTop);
        const clipWidth = Math.round(placement.clipWidth);
        const clipHeight = Math.round(placement.clipHeight);

        const partLeft = Math.round(placement.left);
        const partTop = Math.round(placement.top);
        const partWidth = Math.round(placement.width);
        const partHeight = Math.round(placement.height);

        const extractLeft = Math.max(0, clipLeft - partLeft);
        const extractTop = Math.max(0, clipTop - partTop);
        const extractRight = Math.min(partWidth, clipLeft + clipWidth - partLeft);
        const extractBottom = Math.min(partHeight, clipTop + clipHeight - partTop);
        const extractWidth = Math.max(0, extractRight - extractLeft);
        const extractHeight = Math.max(0, extractBottom - extractTop);

        if (extractWidth === 0 || extractHeight === 0) {
          return null;
        }

        const visiblePart = await sharp(resizedPart)
          .extract({ left: extractLeft, top: extractTop, width: extractWidth, height: extractHeight })
          .toBuffer();

        return {
          input: visiblePart,
          left: clipLeft + extractLeft,
          top: clipTop + extractTop,
        };
      })
    )
  ).filter((overlay): overlay is { input: Buffer; left: number; top: number } => overlay !== null);

  return base.composite(overlays).webp({ lossless: true }).toBuffer();
}
