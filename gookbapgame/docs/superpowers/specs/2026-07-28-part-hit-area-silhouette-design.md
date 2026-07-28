# 파츠 터치 히트 영역 실루엣화 설계

## 배경 / 문제

`GameScreen.tsx`의 `renderClickOverlays()`(82-102줄)는 슬롯마다 `x/y/slotScale`로 정사각형 `absolute` div를 만들고 `clipPath: "circle(50%)"`을 적용해 시각적으로 원형 클릭 영역처럼 보이게 한다. clip-path는 (border-radius와 달리) 클리핑된 바깥 영역을 실제로 히트테스트에서 제외하므로 이 자체는 올바른 접근이었지만, 파츠 이미지의 실제 실루엣이 슬롯 박스보다 훨씬 작은 대각선/막대 형태(투명 배경 PNG)라서 `circle(50%)`이 실제 그림보다 훨씬 넓은 영역을 차지한다. 슬롯 좌표가 근접하면 나중에 렌더된(DOM 순서상 위) 슬롯의 원형 히트 영역이 실제로 겹쳐서, 아래 슬롯을 클릭해도 위 슬롯이 가로채 터치가 씹히는 문제가 발생한다.

파츠 실루엣에 맞춘 정밀한 clip-path polygon으로 바꾸면 이 오탐 겹침을 원천적으로 줄일 수 있다. 단, Supabase 스키마(마이그레이션) 변경은 이번 스펙에서 배제한다 — 서버(Next.js, Vercel 서버리스) 애플리케이션 레이어에서 기존 `parts.image_url`을 읽어 그때그때 계산하고, 계산 결과는 인메모리로만 캐싱한다.

## 범위

### 이번 스펙에서 실구현

- 파츠 원본 PNG의 알파 채널을 분석해 실루엣 convex hull을 구하는 순수 함수 모듈
- 슬롯 배치 수식(offsetX/offsetY/partScale/slotScale)을 반영해 hull을 실제 렌더링 위치에 맞게 변환하는 순수 함수
- `fetchGameData`(`app/actions.ts`)에서 좌/우 파츠 각각의 hit polygon을 계산해 `GameSlot`에 포함
- `GameScreen.tsx`의 `renderClickOverlays()`를 좌/우 각각 다른 폴리곤을 쓰도록 수정, side 인자 추가
- 계산 실패/누락 시 기존 `circle(50%)` 폴백 유지
- 인메모리(모듈 스코프 `Map`) 캐시: `image_url` 키, 서버리스 워밍 인스턴스 생존 기간 동안만 유효

### 이번 스펙에서 배제 (다음 과제로 이관)

- Supabase `parts`/`image_slots` 테이블 스키마 변경 (컬럼 추가 등) — 하지 않음
- 오목한(concave) 파츠 모양에 대한 정밀 대응(alpha shape/contour 기반) — convex hull로 충분하지 않은 파츠가 실제로 발견되면 별도 스펙
- 파츠 회전 기능 — 대시보드에 회전 기능 자체가 없으므로 범위 밖 확정
- 디스크/DB 기반 영속 캐시 — 배포 환경이 Vercel 서버리스라 인스턴스 간 파일시스템 공유가 안 되므로 채택하지 않음. 인메모리 캐시만으로 충분하다고 판단(콜드스타트마다 재계산되는 비용은 허용)

## 아키텍처

### 좌표계: 왜 2단계로 나누는가

`gookbapanalyze/utils/imageProcessor.ts`의 실제 합성 수식:

```
W = H = 100 * slotScale               // 오버레이 박스 크기 (정사각)
finalW = finalH = W * partScale       // 파츠가 들어갈 정사각 영역
left = slotX + offsetX + (W - finalW) / 2
top  = slotY + offsetY + (H - finalH) / 2
```

파츠 원본 이미지는 `finalW × finalH` 정사각 영역에 **contain-fit**(원본 종횡비 유지, 레터박스)으로 들어간다. 여기서 중요한 함정: `offsetX`/`offsetY`는 **절대 픽셀값**이라 `slotScale`에 비례하지 않는다. 즉 같은 파츠가 다른 `slotScale`을 가진 슬롯에 배치되면, 박스 대비 상대 위치(비율)가 슬롯마다 달라진다 — 폴리곤 정규화 결과가 `slotScale`에 의존한다는 뜻이다.

반면 파츠 자체의 실루엣 모양(원본 종횡비에 따른 contain-fit 레터박스 비율)은 **오직 이미지 자체(`image_url`)에만 의존**하고 `slotScale`/`offsetX`/`offsetY`/`partScale`과 무관하다(`finalW === finalH`가 항상 정사각이므로).

그래서 계산을 2단계로 분리한다:

1. **`getPartSilhouette(imageUrl): Promise<Point[] | null>`** (비용이 큼, `image_url` 키로 캐싱)
   - `fetch(imageUrl)` → `sharp(buffer).raw()`로 픽셀+알파 추출
   - 알파값이 임계치(예: 16/255) 이상인 픽셀만 모아 convex hull 계산(Graham scan / monotone chain)
   - 원본 이미지의 종횡비를 기준으로 "1×1 정사각 안에 contain-fit했을 때"의 좌표로 정규화 (0~1)
   - 이 결과는 `image_url`에만 의존하므로 캐시 키로 안전

2. **`mapSilhouetteToSlot(hull, {offsetX, offsetY, partScale, slotScale}): Point[]`** (순수 산술, 캐싱 불필요, 매 슬롯 인스턴스마다 즉석 계산)
   ```
   W = 100 * slotScale
   S = partScale
   xFrac = offsetX / W + (1 - S) / 2 + hull.x * S
   yFrac = offsetY / W + (1 - S) / 2 + hull.y * S   // W === H
   ```
   결과를 `[0, 1]`로 clamp 후 반환 (오프셋이 박스를 벗어나는 극단적 케이스 방어).

두 함수 모두 `app/lib/hitPolygon.ts`(신규, React 비의존 순수 함수 — `gameSelection.ts`/`preloadGame.ts`와 동일 패턴)에 둔다.

### 좌/우 파츠가 다를 수 있다는 점 반영

`fetchGameData`(`app/actions.ts:96-124`)는 `isDifference`일 때 `leftPart`와 `rightPart`가 서로 다른 파츠일 수 있다. 지금 `GameScreen.tsx`는 `renderClickOverlays()`를 좌/우 컨테이너에 동일하게 재사용하는데(121-145줄), 폴리곤은 파츠별로 다르므로 이 재사용 방식을 유지한 채 side별 폴리곤만 분기해야 한다.

**`GameSlot` 타입 확장** (`app/actions.ts`):
```ts
export type GameSlot = {
  slotId: number;
  x: number;
  y: number;
  slotScale: number;
  isDifference: boolean;
  leftHitPolygon: { x: number; y: number }[] | null;
  rightHitPolygon: { x: number; y: number }[] | null;
};
```

`fetchGameData` 루프(96-124줄)에서 `leftPart`/`rightPart`가 이미 `offset_x, offset_y, scale, image_url`을 포함한 전체 row이므로(55줄 `select("*")`), 추가 쿼리 없이 바로 `getPartSilhouette` + `mapSilhouetteToSlot`을 호출할 수 있다. 세션당 필요한 모든 폴리곤 계산은 `Promise.all`로 병렬 처리한다.

**`GameScreen.tsx` 변경**: `renderClickOverlays(side: "left" | "right")`로 side 인자를 받아, `slot.leftHitPolygon` / `slot.rightHitPolygon` 중 해당하는 걸 사용해 `clip-path: polygon(${x*100}% ${y*100}%, ...)`을 생성. 값이 `null`이면 기존 `circle(50%)` 유지.

### 인메모리 캐시

```ts
const silhouetteCache = new Map<string, Point[] | null>();
```
모듈 스코프에 두어 같은 서버리스 워밍 인스턴스 내 재사용. 콜드스타트 시 첫 요청에서만 재계산 비용 발생(파츠당 fetch+alpha 분석, 수십ms 수준) — 어차피 이 계산은 `fetchGameData` 안에서 일어나고, 최근 도입된 프리로드 화면(`2026-07-27-preload-loading-screen-design.md`) 뒤에 가려지므로 플레이 중 체감 지연은 없다.

## 에러 처리

| 실패 지점 | 동작 |
|---|---|
| `getPartSilhouette`의 `fetch` 실패/이미지 디코드 실패 | catch 후 `null` 반환 → 캐시에도 `null` 저장(같은 실패를 반복 재시도하지 않음) → 해당 slot/side는 `circle(50%)` 폴백 |
| `finalW`/`finalH`가 0 이하 (`partScale` 0 등 극단값) | hull 매핑 건너뛰고 `null` 반환 → 폴백 |
| hull 계산 결과가 점 3개 미만(퇴화 도형) | `null` 반환 → 폴백 |

기존 동작(모든 슬롯이 `circle(50%)`)이 항상 폴백 경로로 보존되므로, 이 기능이 부분적으로 실패해도 게임 자체가 깨지지 않는다.

## 테스트

- `hitPolygon.test.ts`:
  - `mapSilhouetteToSlot`: 알려진 hull/offsetX/offsetY/partScale/slotScale 조합에 대해 손계산한 기대값과 일치하는지 (이미지 fixture 불필요, 순수 산술이라 빠르고 안정적)
  - `getPartSilhouette`: 합성한 작은 알파 마스크(예: 대각선 막대 모양의 raw 픽셀 버퍼)를 목으로 넣어 convex hull이 실제 대각선 형태를 감싸는지, 완전 투명 이미지는 `null`을 반환하는지
- 수동 확인: 슬롯 좌표가 근접하도록 로컬 테스트 데이터 배치 → 겹치는 두 슬롯의 경계 부근을 클릭해 실제로 의도한 슬롯만 반응하는지, `isDifference` 슬롯에서 좌/우 각각 다른 모양으로 클릭 영역이 잡히는지 확인
