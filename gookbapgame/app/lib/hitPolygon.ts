import { convexHull, type Point } from "./convexHull.ts";

export type { Point };

const ALPHA_THRESHOLD = 16;

/**
 * **불투명 픽셀을 전부 모으지 않는다 — 열마다 맨 위·맨 아래 두 점만 후보로 쓴다**
 * (2026-08-19). 결과는 근사가 아니라 **완전히 동일하다.**
 *
 * 근거: 어떤 점이 자기 열에서 위도 아래도 아니면 같은 열의 위·아래 점을 잇는 선분
 * 위에 있고, 선분 위의 점은 두 끝점의 볼록 껍질 **내부**다. 껍질 내부의 점은 꼭짓점이
 * 될 수 없으므로 후보에 넣을 이유가 없다. 모양이 오목하든(초승달) 구멍이 뚫렸든
 * (도넛) 조각이 흩어져 있든 이 논리는 열 하나만 보고 끝난다.
 *
 * 왜 고쳤나: 예전에는 후보점이 **면적에 비례**했다. 도마 파트(1824x756)에서 약 100만
 * 개의 점 객체를 만들어 정렬했고, 실측 **293ms**가 걸렸다(할당 + 정렬 콜백 2천만 회).
 * 열 극점이면 후보가 폭에 비례해 3,482개로 줄어 **4.1ms**다 — 71배이며 hull은 양쪽
 * 모두 정확히 69점이었다. 실제 파트 70장과 합성 도형 6종(초승달·ㄱ자·도넛·흩어진
 * 3덩어리·톱니·1픽셀 십자)에서 껍질이 한 점도 어긋나지 않는 것을 확인했다.
 *
 * **모든 픽셀을 모으는 방식으로 되돌리지 말 것.** 얻는 정보가 없고, 파트가 클수록
 * 손해가 커진다(로딩 체감의 주범으로 지목돼 있던 자리다).
 *
 * 행 극점은 필요 없다 — 위 근거가 열 하나로 완결되므로 후보만 늘고 결과는 같다.
 */
/**
 * 마스크(`isSet`)의 볼록 껍질을 열 극점만으로 만든다. 근거와 실측은 위 주석에.
 * 3점 미만으로 축약되면(빈 마스크·직선) null이다 — 호출부의 폴백 신호다.
 */
export function hullFromColumnExtremes(
  width: number,
  height: number,
  isSet: (x: number, y: number) => boolean
): Point[] | null {
  const points: Point[] = [];
  for (let x = 0; x < width; x++) {
    let top = -1;
    let bottom = -1;
    for (let y = 0; y < height; y++) {
      if (isSet(x, y)) {
        if (top < 0) top = y;
        bottom = y;
      }
    }
    if (top < 0) continue;
    points.push({ x, y: top });
    if (bottom !== top) points.push({ x, y: bottom });
  }

  if (points.length < 3) return null;
  const hull = convexHull(points);
  return hull.length < 3 ? null : hull;
}

export function extractSilhouetteFromRaw(
  width: number,
  height: number,
  data: Uint8Array | Buffer
): Point[] | null {
  const hull = hullFromColumnExtremes(
    width,
    height,
    (x, y) => data[(y * width + x) * 4 + 3] >= ALPHA_THRESHOLD
  );
  if (!hull) return null;
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
      /*
       * **`sharp`를 최상위에서 import하지 말 것**(2026-08-19 장애). 예전에는 이 파일이
       * 모듈 최상위에서 `import sharp from "sharp"`를 했는데, `actions.ts`가 이 파일을
       * import하므로 sharp 로드가 실패하면 **서버 액션이 통째로 죽었다** — 닉네임 배정·
       * 랭킹·쿠폰 뽑기·가챠 한도까지 전부 500이 되고, 화면에는 "게임 데이터를 불러오는데
       * 실패했습니다"만 떴다(시작 화면 닉네임이 빈칸이던 것도 같은 원인).
       *
       * 실제로 Vercel 함수에 `@img/sharp-libvips-linux-x64`의 `libvips-cpp.so`가 빠져
       * `ERR_DLOPEN_FAILED`가 났다. 이미지 라이브러리 하나가 게임 전체를 멈추는 것은
       * 폭발 반경이 하는 일에 비해 터무니없다.
       *
       * 여기서 받으면 실패가 아래 catch에 걸려 `null`이 되고, 그 판은 실루엣 대신
       * **정사각형 히트박스**로 떨어진다(`pickPolygonSource`가 이미 그 경로를 갖고 있다).
       * 히트 영역이 헐거워질 뿐 게임은 돌아간다.
       */
      const { default: sharp } = await import("sharp");
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
 * 차이 슬롯의 히트 폴리곤. **양쪽 파트의 실루엣을 합쳐 하나로 만든다** — 왼쪽 면과
 * 오른쪽 면이 같은 폴리곤을 쓴다(2026-08-19, 이란토).
 *
 * 차이는 "그 자리에 물체가 있느냐 없느냐"라서, 정답 자리는 **물체가 있는 쪽 실루엣**과
 * **없어진 자리** 둘 다다. 한 면의 실루엣만 쓰면 없는 쪽에서 빈자리를 눌렀을 때
 * 실루엣 바깥이 되어 곧장 오답이 된다.
 *
 * 예전 `pickPolygonSource`는 자기 실루엣이 **완전히 null일 때만** 반대쪽을 빌려왔다.
 * 그래서 파트 한 장에 물체가 둘 있고 그중 하나만 사라지는 경우(주방 `솥밥_2_1` 284x110
 * 전체 vs `솥밥_2_2` x156~269만 불투명)를 놓쳤다 — hull이 null이 아니라 "일부"라
 * 빌려오지 않았고, 사라진 물체 자리가 오답 판정이었다.
 *
 * 합치는 시점은 **슬롯 좌표로 옮긴 뒤**다. 같은 슬롯이라도 파트마다 offset/scale이
 * 다를 수 있어서, 정규화 좌표에서 합치면 서로 다른 기준끼리 섞인다.
 *
 * 결과는 두 점집합의 convex hull이다. 원래 각 실루엣도 hull이었으므로 새로 생기는
 * 면적은 두 물체 사이의 빈틈뿐인데, 같은 슬롯 안이라 애초에 붙어 있다.
 *
 * **부수 효과: 물체가 있는 쪽에서도 "반대쪽의 빈자리"가 정답이 된다.** 양쪽 면이
 * 같은 폴리곤을 쓰는 대가이고 의도한 것이다. 두 물체가 캔버스 안에서 멀리 떨어진
 * 파트라면 정답 영역이 눈에 보이는 물체보다 넓어진다 — "엉뚱한 데 눌렀는데 정답"
 * 제보가 오면 여기가 원인이다.
 *
 * 양쪽 다 null이면 null이다 — 실루엣 추출이 실제로 실패한 경우이며, 그때는
 * `resolveHitTargetBox`의 사각형 폴백이 맞다.
 */
export function unionSlotPolygon(
  left: { hull: Point[] | null; placement: SlotPlacement },
  right: { hull: Point[] | null; placement: SlotPlacement }
): Point[] | null {
  const points = [
    ...(left.hull ? mapSilhouetteToSlot(left.hull, left.placement) : []),
    ...(right.hull ? mapSilhouetteToSlot(right.hull, right.placement) : []),
  ];
  if (points.length < 3) return null;

  const hull = convexHull(points);
  return hull.length >= 3 ? hull : null;
}

export function mapSilhouetteToSlot(hull: Point[], placement: SlotPlacement): Point[] {
  const boxSize = 100 * placement.slotScale;
  const scale = placement.partScale;

  return hull.map((p) => ({
    x: clamp01(placement.offsetX / boxSize + (1 - scale) / 2 + p.x * scale),
    y: clamp01(placement.offsetY / boxSize + (1 - scale) / 2 + p.y * scale),
  }));
}
