# /api/scene → /api/generate-unified 전환 설계

## 배경 / 문제

`gookbapgame`은 다른그림찾기 좌/우 씬 이미지를 자체 Route Handler(`app/api/scene/route.ts`)에서 매 요청마다 sharp로 온디맨드 합성해 응답한다(2026-07-20 스펙에서 확정된 방식). 이 방식은 영속 캐시가 없어 동일한 base/파츠 조합이라도 매번 다시 합성하며, HTTP `Cache-Control` 헤더에만 의존한다.

그런데 같은 저장소의 관리자 대시보드 `gookbapanalyze`에는 이미 동일 목적의 API가 완성돼 있다: `gookbapanalyze/app/api/generate-unified/route.ts`. 이 API는 `unified_images` 테이블 + `game_assets` Storage 버킷을 이용한 영속 캐시(Lazy Loading/JIT 합성)를 갖추고 있고, CORS도 열려 있어 외부 클라이언트가 호출할 수 있도록 설계되어 있다(`gookbapanalyze/AGENTS.md`의 "Unified Image Generation API Guide"가 이 API의 공개 명세다).

즉 문제는 "캐싱 API가 없다"가 아니라, **이미 백엔드(DB+gookbapanalyze)에 구현된 캐싱 API를 gookbapgame이 쓰지 않고 자체적으로 중복 구현하고 있다**는 것이다. gookbapgame은 이 API를 소비하는 쪽으로 전환하고, 자체 합성 경로는 제거한다.

## 해결 방향

`fetchGameData`(`app/actions.ts`)가 좌/우 각각에 대해 `gookbapanalyze`의 `/api/generate-unified`를 HTTP POST로 병렬 호출하고, 응답받은 캐시 이미지 URL을 그대로 `leftSceneUrl`/`rightSceneUrl`로 사용한다. `app/api/scene/route.ts`와 그 전용 유틸(`composeScene.ts`, `fetchImageBuffer.ts`)은 삭제한다.

### 왜 이 방향인가 (대안 비교)

- **generate-unified의 JIT 캐싱 로직을 gookbapgame에도 포팅**: 기각. 두 앱에 동일 로직이 중복되는 것 자체가 지금 없애려는 문제이고, 캐시 미스 시 필요한 Storage 업로드 + `unified_images` INSERT는 RLS 우회(SERVICE_ROLE_KEY)가 필요하다. gookbapgame은 `app/lib/db.ts`에 명시된 대로 ANON_KEY만 쓰는 것이 확립된 보안 정책이며, `gookbapanalyze/AGENTS.md`도 게임 클라이언트 환경에서 SERVICE_ROLE_KEY로 RLS를 우회하는 것을 명시적으로 금지한다. `unified_images`는 anon에게 SELECT만 열려 있어(Admin: ALL, Everyone: SELECT) 이 안은 캐시 미스 처리 자체가 불가능하다.
- **현행 유지(`/api/scene` 그대로 둠)**: 기각. 캐시 없이 매번 재합성하는 중복 경로를 그대로 남기는 것이며, 이미 검증된 캐시 인프라를 활용하지 않는다.
- **채택안(외부 API 호출)**: 캐싱/합성 책임을 원래 있어야 할 백엔드(DB+gookbapanalyze)에 위임하고, gookbapgame은 소비자 역할만 한다. RLS 우회 없이 ANON_KEY 정책을 그대로 유지할 수 있다.

## 데이터 흐름

1. `fetchGameData`의 base_image 선택 / 유효 슬롯 판별 / 좌우 파츠 랜덤 결정 로직(`app/actions.ts` 1~117행)은 변경하지 않는다.
2. 슬롯별로 결정된 좌/우 파츠를 `slotId:partId` 문자열 페어 대신 `{ [slot.category_id]: part.id }` 형태의 객체 2개(좌/우)로 구성한다. `image_slots`는 `base_image_id`당 `category_id`가 1:1이므로(확인 완료) 키 충돌 우려는 없다.
3. 두 객체를 각각 `POST {GENERATE_UNIFIED_API_URL}`로 `Promise.all`을 통해 병렬 호출한다. Body: `{ baseImageId, imageSlots }`, Header: `Content-Type: application/json`.
4. 응답이 `{ success: true, url }`이면 그 `url`을 `leftSceneUrl`/`rightSceneUrl`로 사용한다.
5. 둘 중 하나라도 실패(HTTP 4xx/5xx의 `{ error }` 응답, 네트워크 실패, 타임아웃 등)하면 기존 컨벤션대로 에러를 로그하고 `fetchGameData`는 `null`을 반환한다(부분 성공 상태로 게임을 시작시키지 않는다).
6. `GameScreen.tsx`는 변경하지 않는다 — 이미 완성 이미지 1장을 `<img src>`로 렌더링하는 구조(2026-07-20 스펙 6번)이며, URL의 출처가 내부 라우트에서 외부 Storage로 바뀔 뿐 렌더링 로직은 동일하다.
7. 삭제: `app/api/scene/route.ts`, `app/lib/composeScene.ts`, `app/lib/fetchImageBuffer.ts`. 이 경로 전용이던 `sharp` 의존성도 다른 사용처가 없다면 `package.json`에서 제거한다.

## 환경 변수

신규 서버 전용 env var `GENERATE_UNIFIED_API_URL`(gookbapanalyze 배포 도메인, 예: `https://<domain>/api/generate-unified`)을 추가한다. 값은 이란토가 Vercel/로컬 `.env.local`에 직접 채워 넣으며, 레포에는 키 이름과 용도만 문서화한다(`db.properties`/`.env.local` fallback 패턴은 Supabase 전용이므로 그대로 두고, 이 값은 `process.env.GENERATE_UNIFIED_API_URL`로 직접 읽는다).

## 에러 처리

- generate-unified가 JSON `{ error }`와 4xx/5xx를 반환하면 그 메시지를 그대로 로그한다.
- `fetch` 자체가 실패(네트워크 오류, env var 미설정 등)하는 경우도 동일하게 catch해서 로그 후 `null` 반환.
- 캐시 미스로 인한 최초 합성 지연(대략 1~2초, 좌우 병렬이므로 총 지연은 더 느린 쪽 기준)은 기존 `StartScreen`의 `isLoading` 상태로 흡수한다. 로딩 화면 UX 자체의 개선은 별도 스펙(`2026-07-27-preload-loading-screen-design.md`) 범위이므로 이번 스펙에서 다루지 않는다.

## 테스트

- `fetchGameData` 단위 테스트: `fetch`를 모킹해 성공(좌/우 모두 `success:true`), 부분 실패(한쪽만 에러), 완전 실패(네트워크 예외) 케이스에서 각각 올바른 `GameSession`/`null` 반환을 확인.
- 수동 검증: 실제 배포된 `GENERATE_UNIFIED_API_URL`로 로컬에서 한 번 게임을 실행해 좌/우 이미지가 정상적으로 뜨는지, 캐시 히트 시 즉시·캐시 미스 시 지연 후 응답하는지 확인.
- 회귀 확인: `app/api/scene` 삭제 후 그 경로를 참조하는 곳이 남아있지 않은지 전체 검색으로 확인.

## 다음 범위가 아닌 것 (명시적 제외)

- `gookbapanalyze`(관리자 대시보드) 쪽 코드/DB 스키마 변경 — 이미 완성되어 있으며 이번 작업은 소비자 측(gookbapgame)에 한정한다.
- 로딩 화면 UX 개선 — `2026-07-27-preload-loading-screen-design.md` 범위.
- 비주얼 디자인 — 이번 스펙과 무관.
