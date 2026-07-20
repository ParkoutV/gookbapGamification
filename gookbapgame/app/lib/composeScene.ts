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
