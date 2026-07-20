# 서버 측 이미지 합성 설계

## 배경 / 문제

다른그림찾기 게임은 배경 이미지 위에 슬롯별 파츠 이미지를 겹쳐 좌/우 화면을 구성한다. 현재 `GameScreen.tsx`는 배경 1장 + 슬롯 N개 × 2(좌우)의 개별 `<img>` 태그를 렌더링한다. 각 이미지가 개별 네트워크 요청으로 순차 로딩되면서, 유저가 파츠들이 하나씩 나타나는 "조립 과정"을 그대로 보게 된다. 이는 마케팅 목적의 불특정 다수 대상 게임에서 UX를 해치고 정답 유추의 단서가 될 수 있다.

DB 스키마(`base_images` / `part_categories` / `parts` / `image_slots`)는 파츠 단위로 정규화되어 있으며, 이는 관리자 대시보드(`gookbapanalyze`)의 편집 기능과 향후 파츠 확장성을 위해 유지되어야 한다. 즉 문제는 스키마가 아니라 **클라이언트에 전달되는 시점의 표현 방식**에 있다.

## 해결 방향

서버(Route Handler)에서 배경+파츠를 픽셀 단위로 합성한 완성 이미지 1장을 만들어 그 바이트를 직접 응답한다. 합성은 요청이 있을 때마다 수행하는 온디맨드 방식이며, HTTP `Cache-Control` 헤더로 브라우저/CDN 캐시에 맡긴다. 영속 캐시(예: Supabase Storage에 결과를 저장해두고 재사용)는 이번 범위에서 제외한다.

### 왜 이 방향인가 (대안 비교)

- **클라이언트 Canvas 합성**: 서버 부하는 없지만, 파츠 이미지 자체를 클라이언트로 내려보내야 하므로 "정답 유추 가능한 원본 데이터가 클라이언트에 존재"하는 근본 문제가 남는다. 채택하지 않음.
- **사전 전량 합성 (관리자 저장 시점 또는 cron)**: 슬롯 수 M, 슬롯당 파츠 후보 수 K라 하면 조합 수는 대략 `C(M,d) × (다른 슬롯: K×(K-1) 순서쌍) × (같은 슬롯: K)` 규모로, 슬롯·파츠가 몇 개만 늘어도 수천 장 단위로 커진다. 또한 저장 시점 훅은 `gookbapanalyze`(대시보드) 영역이라 이 프로젝트(`gookbapgame`)의 담당 범위 밖이다. 채택하지 않음.
- **영속 캐시(Storage) 포함**: 성능 최적화로는 유효하지만, (a) anon 역할의 Storage 업로드 권한이 미확인 상태이고 (b) 로컬에 Supabase 접속 환경(`.env`/`db.properties`)이 아직 없어 검증이 막힐 수 있다. "조립 과정 노출"이라는 핵심 문제는 온디맨드 합성만으로 이미 해결되므로, 영속 캐시는 이번 범위에서 제외하고 필요 시 나중에 얹는다(응답 전에 Storage 조회를 추가하는 것은 기존 함수를 감싸는 작업이라 재설계가 아니다).
- **채택안(온디맨드 합성 + HTTP 캐싱)**: 클라이언트는 완성 이미지 URL만 받음(정답 유추 불가). Storage 업로드 권한 문제와 로컬 env 미설정 리스크를 피해 지금 바로 구현·검증 가능하다.

## 좌표 파이프라인 — CSS 렌더링과 동일하게 재현

`gookbapanalyze`의 대시보드 편집 화면(`app/main/spot-difference/edit/[id]/page.tsx`)은 관리자가 슬롯/파츠 좌표를 맞출 때 `GameScreen.tsx`와 동일한 CSS 파이프라인으로 미리보기를 그린다:

1. 슬롯 박스는 `(x, y)` 위치에 `100 * slotScale` 크기의 정사각형 (base 1200×800 좌표계 기준)
2. 박스 안의 파츠 이미지는 `object-contain`으로 비율 유지하며 박스에 맞춰짐
3. 그 위에 `transform: translate(offsetX, offsetY) scale(partScale)` 적용 — **scale은 박스 중심 기준**
4. 슬롯 박스에 `overflow: hidden` — 확대된 파츠가 박스 밖으로 나가면 잘림

즉 저장된 좌표값(`x, y, slotScale, offsetX, offsetY, partScale`)은 "이 CSS 계산을 거치면 정확하다"는 전제로 관리자가 맞춘 값이다. sharp 합성은 이 파이프라인을 그대로 재현해야 한다. 1200×800 고정 해상도에서 파츠의 intrinsic 크기(`pw, ph`, sharp `metadata()`로 획득)를 이용해 다음 순서로 계산한다:

```
B = 100 * slotScale
fit = min(B / pw, B / ph)                    // object-contain 비율
w = pw * fit * partScale
h = ph * fit * partScale
left = x + (B - w) / 2 + offsetX
top  = y + (B - h) / 2 + offsetY
```

파츠 이미지를 `(w, h)`로 리사이즈 → `(left, top)`에 배경 위에 composite → 슬롯 박스 `[x, y, B, B]`로 클립(박스 밖으로 나간 부분 제거). 슬롯이 여러 개 겹칠 경우 `z_index` 순서로 레이어링한다.

이 계산이 맞는지는 코드 리딩만으로 확정하지 않는다 — 구현 계획에 "현재 브라우저 렌더링(정답) vs sharp 출력의 픽셀 비교" 검증 단계를 포함한다.

## 아키텍처

### 데이터 흐름

1. `fetchGameData` (서버 액션)가 기존 로직대로 base_image + 유효 슬롯 + 파츠 후보를 조회하고, 슬롯별로 좌/우에 어떤 `part`를 쓸지 무작위로 결정한다 (현재 로직 유지).
2. 결정된 조합(슬롯별 선택된 파츠 ID)을 Route Handler URL의 쿼리 파라미터로 인코딩한다 (예: `/api/scene?base=1&side=left&parts=<slotId>:<partId>,...`).
3. 클라이언트는 이 URL을 좌/우 각각의 `<img src>`로 사용한다.
4. Route Handler(`app/api/scene/route.ts`)는 쿼리로 받은 조합에 대해 sharp로 배경+파츠를 합성하고, WebP 바이트를 `Cache-Control: public, max-age=...` 헤더와 함께 응답한다.
5. `fetchGameData`는 이제 파츠 개별 이미지 URL 대신, 합성 이미지를 가리키는 위 쿼리 URL과 정답 판정에 필요한 슬롯 메타데이터(`slotId`, `x`, `y`, `slotScale`, `isDifference`)만 클라이언트로 반환한다.
6. 클라이언트(`GameScreen.tsx`)는 좌/우 `<img>` 2장만 렌더링하고, 그 위에 슬롯 좌표 기준 투명 클릭 오버레이(현재의 `handlePartClick` 판정 영역)만 얹는다. 반응형 스케일링(`updateScale`/`scale` state)은 이 클릭 오버레이 좌표 변환에 계속 필요하므로 유지한다.

### 캐시 미스 시 UX

기존 `StartScreen`의 `isLoading` 상태를 그대로 사용한다. 이미지 자체는 `<img src>`가 Route Handler를 직접 가리키므로, 브라우저의 일반적인 이미지 로딩 흐름을 탄다 — `fetchGameData`가 반환하는 시점에는 이미 URL만 결정되어 있고, 합성은 이미지 요청 시 이루어진다. 게임 화면 진입 후 이미지 자체가 로드되는 짧은 지연은 허용한다 (현재도 이미지 로딩 자체는 존재했음 — 달라지는 것은 "파츠별로 쪼개져 보이던 것"이 "완성본 로딩"으로 바뀌는 것).

### 변경 범위

- **생성**: `app/api/scene/route.ts` (합성 Route Handler), 합성 로직을 담은 서버 전용 유틸 모듈
- **변경**: `app/actions.ts` (파츠 개별 URL 대신 합성 이미지 쿼리 URL 반환하도록 타입/로직 축소), `app/components/GameScreen.tsx` (파츠별 오버레이 렌더링 제거 → 완성 이미지 2장 + 투명 클릭 영역)
- **불변**: Supabase 테이블 스키마, RLS 정책, `gookbapanalyze` 대시보드, `StartScreen.tsx`, `Modal.tsx`, `page.tsx`의 상태머신

## UI 톤앤매너

팀 회의에서 확정된 디자인 방향은 없음. "캐주얼한 콘솔 게임" 느낌이라는 방향성만 있고, 세부 비주얼은 구현 단계에서 별도로 디벨롭한다. 이 스펙은 이미지 합성 아키텍처에 한정하며, 비주얼 디자인은 범위에서 제외한다.

## 테스트

- **좌표 계산 함수**: 슬롯/파츠 값 입력 → `{w, h, left, top}` 기대값 비교 단위 테스트 (여러 slotScale/partScale/offset 조합).
- **파이프라인 실측 검증**: 로컬에서 현재 `GameScreen.tsx` 렌더링을 스크린샷(정답지)으로 캡처하고, 동일 입력으로 만든 sharp 합성 결과와 픽셀 비교해 허용 오차 내에 들어오는지 확인. 이 프로젝트에 로컬 Supabase 연결이 없다면 더미 base/part 이미지로 대체해 파이프라인만 검증한다.
- **Route Handler**: 존재하지 않는 `base`/`parts` 조합 요청 시 4xx 응답, 정상 조합 요청 시 `Content-Type: image/webp` + `Cache-Control` 헤더 확인.

## 다음 범위가 아닌 것 (명시적 제외)

- Supabase Storage에 합성 결과를 영속 저장하는 캐시 레이어 — 필요 시 이후 별도 스펙으로 다룬다.
- 관리자 저장 시점 사전 합성/cron 배치 — `gookbapanalyze` 담당 범위.
- 비주얼 디자인(톤앤매너, 레이아웃 리디자인) — 별도 진행.
