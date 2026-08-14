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

  // 1 & 2. Fetch base image and ALL parts concurrently
  const [baseBuffer, ...partBuffers] = await Promise.all([
    fetch(baseImageUrl).then(async res => {
      if (!res.ok) throw new Error(`Failed to fetch base image: ${res.statusText}`);
      return Buffer.from(await res.arrayBuffer());
    }),
    ...parts.map(part => fetch(part.imageUrl).then(async res => {
      if (!res.ok) throw new Error(`Failed to fetch part image: ${res.statusText}`);
      return Buffer.from(await res.arrayBuffer());
    }))
  ]);

  const resizedBasePromise = sharp(baseBuffer)
    .resize(CANVAS_WIDTH, CANVAS_HEIGHT, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .toBuffer();

  // 3. Prepare each part overlay concurrently
  const overlayPromises = parts.map(async (part, index) => {
    const partBuffer = partBuffers[index];

    const W = 100 * part.slotScale;
    const H = 100 * part.slotScale;
    const S = part.partScale;
    
    const finalW = Math.round(W * S);
    const finalH = Math.round(H * S);
    
    if (finalW <= 0 || finalH <= 0) return null;

    // CSS transform logic
    const left = Math.round(part.slotX + part.offsetX + (W - finalW) / 2);
    const top = Math.round(part.slotY + part.offsetY + (H - finalH) / 2);

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

    if (cropW <= 0 || cropH <= 0) return null;

    const croppedPart = await sharp(partBuffer)
      .resize(finalW, finalH, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .extract({ left: cropLeft, top: cropTop, width: cropW, height: cropH })
      .toBuffer();

    return {
      input: croppedPart,
      left: drawLeft,
      top: drawTop
    } as OverlayOptions;
  });

  const [resizedBase, ...compositesRaw] = await Promise.all([
    resizedBasePromise,
    ...overlayPromises
  ]);

  const composites = compositesRaw.filter(Boolean) as OverlayOptions[];

  // 4. Composite all
  // 4. Composite all and export as PNG to ensure 100% correct RGBA alpha rasterization
  const pngBuffer = await sharp(resizedBase)
    .composite(composites)
    .png()
    .toBuffer();

  // 5. Convert the pristine PNG buffer into a WebP. This forces libwebp to see a true RGBA image, bypassing any VP8/VP8X header bugs on Vercel's linux environment.
  const finalBuffer = await sharp(pngBuffer)
    .webp({ quality: 90 })
    .toBuffer();

  return finalBuffer;
}
