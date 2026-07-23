import sharp, { OverlayOptions } from 'sharp';

interface PartOverlay {
  imageUrl: string;
  slotX: number;
  slotY: number;
  slotScale: number;
  offsetX: number;
  offsetY: number;
  partScale: number;
}

export async function generateUnifiedImageBuffer(
  baseImageUrl: string,
  parts: PartOverlay[]
): Promise<Buffer> {
  const CANVAS_WIDTH = 1200;
  const CANVAS_HEIGHT = 800;

  // 1. Fetch base image
  const baseRes = await fetch(baseImageUrl);
  if (!baseRes.ok) throw new Error(`Failed to fetch base image: ${baseRes.statusText}`);
  const baseBuffer = await baseRes.arrayBuffer();

  const resizedBase = await sharp(Buffer.from(baseBuffer))
    .resize(CANVAS_WIDTH, CANVAS_HEIGHT, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .toBuffer();

  const composites: OverlayOptions[] = [];

  // 3. Prepare each part overlay
  for (const part of parts) {
    const partRes = await fetch(part.imageUrl);
    if (!partRes.ok) throw new Error(`Failed to fetch part image: ${partRes.statusText}`);
    const partBuffer = Buffer.from(await partRes.arrayBuffer());

    const W = 100 * part.slotScale;
    const H = 100 * part.slotScale;
    const S = part.partScale;
    
    // In CSS, object-contain is applied within the WxH slot, then transformed
    // We will resize the part to fit inside W*S x H*S
    const finalW = Math.round(W * S);
    const finalH = Math.round(H * S);
    
    if (finalW <= 0 || finalH <= 0) continue;

    // CSS transform logic:
    // translate(tx, ty) scale(S)
    // Center remains the same.
    const left = Math.round(part.slotX + part.offsetX + (W - finalW) / 2);
    const top = Math.round(part.slotY + part.offsetY + (H - finalH) / 2);

    // To avoid sharp's "Image to composite must have same dimensions or smaller" error,
    // we must pre-crop the overlay so it strictly fits within the 1200x800 canvas.
    let cropLeft = 0;
    let cropTop = 0;
    let cropW = finalW;
    let cropH = finalH;
    let drawLeft = left;
    let drawTop = top;

    if (drawLeft < 0) {
      cropLeft = -drawLeft;
      cropW -= cropLeft;
      drawLeft = 0;
    }
    if (drawTop < 0) {
      cropTop = -drawTop;
      cropH -= cropTop;
      drawTop = 0;
    }
    if (drawLeft + cropW > CANVAS_WIDTH) {
      cropW = CANVAS_WIDTH - drawLeft;
    }
    if (drawTop + cropH > CANVAS_HEIGHT) {
      cropH = CANVAS_HEIGHT - drawTop;
    }

    if (cropW <= 0 || cropH <= 0) continue;

    const croppedPart = await sharp(partBuffer)
      .resize(finalW, finalH, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .extract({ left: cropLeft, top: cropTop, width: cropW, height: cropH })
      .toBuffer();

    composites.push({
      input: croppedPart,
      left: drawLeft,
      top: drawTop
    });
  }

  // 4. Composite all
  const finalBuffer = await sharp(resizedBase)
    .ensureAlpha()
    .composite(composites)
    .webp({ quality: 90 })
    .toBuffer();

  return finalBuffer;
}
