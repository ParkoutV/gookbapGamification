import sharp from 'sharp';

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

  // 2. Prepare the base canvas with object-contain of the base image
  let canvas = sharp({
    create: {
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  });

  const resizedBase = await sharp(Buffer.from(baseBuffer))
    .resize(CANVAS_WIDTH, CANVAS_HEIGHT, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .toBuffer();

  const composites: sharp.OverlayOptions[] = [
    { input: resizedBase, left: 0, top: 0 }
  ];

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

    const resizedPart = await sharp(partBuffer)
      .resize(finalW, finalH, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .toBuffer();

    // CSS transform logic:
    // translate(tx, ty) scale(S)
    // Center remains the same.
    const left = Math.round(part.slotX + part.offsetX + (W - finalW) / 2);
    const top = Math.round(part.slotY + part.offsetY + (H - finalH) / 2);

    composites.push({
      input: resizedPart,
      left: left,
      top: top
    });
  }

  // 4. Composite all
  const finalBuffer = await canvas
    .composite(composites)
    .webp({ quality: 90 })
    .toBuffer();

  return finalBuffer;
}
