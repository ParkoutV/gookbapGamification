import { hullFromColumnExtremes, type Point, type SlotPlacement } from "./hitPolygon.ts";

/**
 * 차이 슬롯의 정답 영역을 **두 파트 그림이 실제로 달라진 자리**에서 뽑는다.
 *
 * 왜 필요한가(2026-08-19 실기): 정답 영역이 파트 실루엣이라, 7단계 반찬상처럼 큰
 * 파트에서는 **상 전체가 정답**이었다. 실제로 바뀐 것은 상 위 반찬 하나인데 판정은
 * 판의 4분의 1을 덮었다. 실루엣은 "물체가 어디 있나"를 말할 뿐 "무엇이 달라졌나"를
 * 말하지 않는다.
 *
 * 두 그림을 **슬롯 좌표로 옮긴 뒤** 뺀다. 같은 슬롯이라도 파트마다 offset/scale이
 * 다를 수 있어 원본끼리 빼면 어긋난 채로 빠진다.
 *
 * 검출하지 못하면 `null`을 돌려주고, 호출부는 지금까지의 합집합 실루엣으로 떨어진다.
 * **diff를 합집합에 더하지 말 것** — 영역이 커져서 정확도가 되레 떨어진다. 대신
 * 쓰거나, 못 찾으면 폴백하거나 둘 중 하나다.
 */

/** 슬롯을 정사각 픽셀 격자로 볼 때의 한 변. 원본 해상도와 무관하게 고정한다. */
export const DIFF_CANVAS_PX = 256;

/**
 * 색 차이 임계(0~255). 알파를 곱한 뒤 채널별 최대 차이와 알파 차이 중 큰 값을 본다.
 *
 * **실측으로 고른 값이다**(2026-08-19, 주방 파트). 진짜 차이는 진폭이 커서 16~64 어디를
 * 잡아도 결과가 같은 평탄 구간에 있고, 문제는 "눈에 같은데 다른" 쌍이다:
 * 3% 리샘플 + webp 재인코딩은 픽셀의 1.5%를 흔들고, 그 노이즈가 **윤곽선 전체에
 * 흩뿌려져** bbox로는 76%까지 부푼다. 임계값만으로는 못 거른다 — 아래 침식과
 * 최소 덩어리가 함께 있어야 한다.
 */
export const DIFF_THRESHOLD = 32;

/**
 * 살아남을 덩어리의 최소 크기(캔버스 면적 대비 %).
 *
 * 실측 마진(256x256 기준): 진짜 차이의 덩어리는 3,000~6,000px, 2픽셀 밀린 그림의
 * 가짜 덩어리는 186px에서 끊긴다. 196px(0.3%)이면 **16배 여유**다.
 *
 * **절대 하한(화면 px)은 일부러 걸지 않았다**(2026-08-19, 이란토). 이 값은 슬롯 면적
 * 대비 비율이라 슬롯이 작으면 문턱도 작아진다 — 화면 238px 슬롯에서는 약 13px이지만
 * 66px 슬롯에서는 3.6px이라, 눈에 거의 안 보이는 차이도 통과한다. 그때도 못 누르지는
 * 않는다(`MIN_TOUCH_TARGET_PX`가 표적을 66px로 키운다). "못 찾겠다"가 될 뿐이다.
 *
 * 걸려면 `slotScale`로 장면 좌표를, 화면 배율로 화면 px를 환산해 이 비율과 **둘 중
 * 큰 쪽**을 쓰면 된다. 이번 판에 장치가 여러 개 한꺼번에 들어가서, 무엇이 효과를 냈고
 * 무엇이 과했는지 구분할 수 없기 때문에 미뤘다. 3·4·6단계(작은 슬롯)에서 "뭐가 다른지
 * 모르겠다"는 제보가 오면 그때 숫자를 정할 것.
 */
export const DIFF_MIN_BLOB_PCT = 0.3;

/**
 * 다른 픽셀의 마스크. 알파를 곱하는 이유는 투명한 자리의 RGB가 쓰레기값이라,
 * 그대로 빼면 보이지도 않는 색 차이가 잡히기 때문이다.
 */
function diffMask(a: Uint8Array | Buffer, b: Uint8Array | Buffer, size: number): Uint8Array {
  const mask = new Uint8Array(size * size);
  for (let i = 0, p = 0; i < size * size; i++, p += 4) {
    const aAlpha = a[p + 3];
    const bAlpha = b[p + 3];
    let d = Math.abs(aAlpha - bAlpha);
    for (let c = 0; c < 3; c++) {
      d = Math.max(d, Math.abs((a[p + c] * aAlpha) / 255 - (b[p + c] * bAlpha) / 255));
    }
    if (d >= DIFF_THRESHOLD) mask[i] = 1;
  }
  return mask;
}

/**
 * 3x3 침식. 이웃 9칸 중 7칸 이상이 diff일 때만 남긴다.
 *
 * **이게 있어야 "1~2픽셀 밀린 그림"이 걸러진다.** 밀린 그림의 diff는 윤곽을 따라
 * 폭 1~2픽셀의 리본으로 생기는데, 길이가 길어 덩어리 크기로는 진짜 차이와 구분되지
 * 않는다(실측 269px). 침식은 그 리본을 지우고 두툼한 덩어리만 남긴다 — 같은 조건에서
 * 21px로 떨어졌다. 최소 덩어리만으로도, 침식만으로도 부족하고 **둘 다** 필요하다.
 */
function erode(mask: Uint8Array, size: number): Uint8Array {
  const out = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (!mask[i]) continue;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          if (mask[ny * size + nx]) n++;
        }
      }
      if (n >= 7) out[i] = 1;
    }
  }
  return out;
}

/**
 * 연결 덩어리 중 **충분히 큰 것만** 남긴다. 흩어진 노이즈는 조각이 많고 작다 —
 * 실측에서 진짜 차이는 덩어리 1~4개에 diff의 99.9%가 몰렸고, 노이즈는 60개로
 * 흩어졌다. 스택 기반 flood fill이라 재귀 깊이 문제가 없다.
 */
function keepLargeBlobs(mask: Uint8Array, size: number): Uint8Array | null {
  const floor = Math.max(1, Math.round((size * size * DIFF_MIN_BLOB_PCT) / 100));
  const label = new Int32Array(size * size);
  const stack = new Int32Array(size * size);
  const out = new Uint8Array(size * size);
  let kept = false;

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || label[start]) continue;
    let sp = 0;
    let count = 0;
    const members: number[] = [];
    stack[sp++] = start;
    label[start] = 1;
    while (sp > 0) {
      const cur = stack[--sp];
      members.push(cur);
      count++;
      const cx = cur % size;
      const cy = (cur / size) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          const ni = ny * size + nx;
          if (mask[ni] && !label[ni]) {
            label[ni] = 1;
            stack[sp++] = ni;
          }
        }
      }
    }
    if (count >= floor) {
      kept = true;
      for (const m of members) out[m] = 1;
    }
  }

  return kept ? out : null;
}

/**
 * 슬롯 좌표계(정사각 `size`)로 이미 옮겨진 두 RGBA 버퍼에서 차이 폴리곤을 만든다.
 * 결과는 0~1 정규화 좌표라 `mapSilhouetteToSlot`을 거치지 않는다 — 이미 슬롯 좌표다.
 */
export function extractDiffSilhouetteFromRaw(
  size: number,
  a: Uint8Array | Buffer,
  b: Uint8Array | Buffer
): Point[] | null {
  const blobs = keepLargeBlobs(erode(diffMask(a, b, size), size), size);
  if (!blobs) return null;

  const hull = hullFromColumnExtremes(size, size, (x, y) => blobs[y * size + x] === 1);
  return hull ? hull.map((p) => ({ x: p.x / size, y: p.y / size })) : null;
}

export type DiffPart = { imageUrl: string; placement: SlotPlacement };

const diffCache = new Map<string, Point[] | null>();

/**
 * 파트 한 장을 **슬롯 정사각 캔버스**에 합성기와 같은 규칙으로 얹는다.
 *
 * 규칙은 `gookbapanalyze`의 `utils/imageProcessor.ts`와 맞춰야 한다: 파트를 한 변
 * `slot * partScale`인 **정사각형에 letterbox(`fit: contain`)로 넣고**, 슬롯 원점에서
 * `offset + (슬롯 - 안쪽 정사각)/2`만큼 이동한다. 어긋나면 diff가 통째로 헛돈다.
 */
async function renderToSlotCanvas(
  sharpLib: import("sharp").SharpConstructor,
  buffer: Buffer,
  placement: SlotPlacement,
  size: number
): Promise<Buffer> {
  const inner = Math.max(1, Math.round(size * placement.partScale));
  const boxSize = 100 * placement.slotScale;
  const part = await sharpLib(buffer)
    .ensureAlpha()
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  const left = Math.round((placement.offsetX / boxSize) * size + (size - inner) / 2);
  const top = Math.round((placement.offsetY / boxSize) * size + (size - inner) / 2);

  return sharpLib({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: part, left, top }])
    .raw()
    .toBuffer();
}

/**
 * 차이 슬롯의 정답 폴리곤. 못 만들면 `null`이고 호출부가 합집합 실루엣으로 떨어진다.
 *
 * **`sharp`를 최상위에서 import하지 말 것** — 이유는 `getPartSilhouette`의 주석에
 * 길게 적어뒀다(모듈 로드 실패가 서버 액션 전체를 죽인다). 여기서도 실패는 전부
 * 삼키고 `null`로 떨어뜨린다: 판정이 예전만큼 헐거워질 뿐 게임은 돌아간다.
 */
export async function getDiffSilhouette(
  left: DiffPart,
  right: DiffPart,
  fetchImpl: typeof fetch = fetch,
  size: number = DIFF_CANVAS_PX
): Promise<Point[] | null> {
  const key = [left, right]
    .map((p) => `${p.imageUrl}|${p.placement.offsetX},${p.placement.offsetY},${p.placement.partScale},${p.placement.slotScale}`)
    .join("::");
  if (diffCache.has(key)) return diffCache.get(key) ?? null;

  let result: Point[] | null = null;
  try {
    const buffers = await Promise.all(
      [left, right].map(async (p) => {
        const res = await fetchImpl(p.imageUrl);
        if (!res.ok) throw new Error(`fetch 실패 (status=${res.status}): ${p.imageUrl}`);
        return Buffer.from(await res.arrayBuffer());
      })
    );
    const { default: sharp } = await import("sharp");
    const [a, b] = await Promise.all([
      renderToSlotCanvas(sharp, buffers[0], left.placement, size),
      renderToSlotCanvas(sharp, buffers[1], right.placement, size),
    ]);
    result = extractDiffSilhouetteFromRaw(size, a, b);
  } catch (error) {
    console.warn(`[getDiffSilhouette] ${error instanceof Error ? error.message : error}`);
  }

  diffCache.set(key, result);
  return result;
}
