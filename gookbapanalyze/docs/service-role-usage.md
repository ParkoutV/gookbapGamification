# Service role 사용처 점검

2026-09-30 보안 수정 후 `gookbapanalyze` 소스 기준입니다. 키 값은 기록하지 않습니다.

`anon_key + 로그인 세션`은 비로그인 권한이 아닙니다. Supabase는 로그인 JWT의 사용자 권한과 RLS를 적용합니다. 아래의 "전환 가능"은 RLS를 검증한 뒤 이 방식으로 바꿀 수 있다는 뜻이며, 익명 공개 쓰기 권한을 넓히라는 뜻이 아닙니다.

## 명시적으로 서비스 키 사용을 요청받았다는 주석이 있는 곳

| 위치 | 실제 사용 | 판단 |
| --- | --- | --- |
| `app/main/accounts/actions.ts`의 `deleteAllGameData` | 게임 점수·뽑기·선택 설문 기록·세션·설문 응답·방문 기록·배정 웹 쿠폰·매장 쿠폰·참가자 삭제 | `Explicitly requested to use service_role_key (adminClient) to prevent anon_key compromise issues` 주석이 있습니다. 로그인과 최고 관리자 확인 후 실행합니다. 이번에는 변경하지 않았습니다. |

이와 달리 `app/api/generate-unified/route.ts`의 "RLS 우회와 Storage 업로드", `app/main/spot-difference/actions.ts`의 "backend caching and cleanup", `app/main/layout.tsx`의 "RLS 우회" 주석은 사용 목적을 설명할 뿐, 사용자가 명시적으로 요청했다는 기록은 아닙니다.

## 서버 전용 권한을 유지해야 하는 작업

서비스 키를 제거하기 위해 anon의 직접 쓰기·전체 조회 권한을 여는 것은 더 위험합니다. 제한된 RPC나 적절한 관리자 RLS로 대체할 수는 있으므로, 아래는 서비스 키 자체가 유일한 해법이라는 뜻은 아닙니다.

| 위치 | 실제 사용 | 유지 근거와 현재 조건 |
| --- | --- | --- |
| `utils/supabase/admin.ts` | 서비스 키 클라이언트 생성 | 아래 기능들이 공유하는 서버용 팩토리입니다. 이것만으로 호출자 인증이 되는 것은 아닙니다. |
| `app/main/accounts/actions.ts`의 `createAccount`, `getAccountsList`, `deleteAccount` | Supabase Auth 사용자 생성·목록 조회·삭제와 accounts 쓰기 | Auth Admin API는 서버 전용 권한이 필요합니다. 각각 최고 관리자 검사 후 실행합니다. |
| 같은 파일의 `updatePermission` | accounts의 역할·지점 변경 | 현재 accounts의 공개 정책은 읽기뿐입니다. 관리자 검증 뒤 권한을 변경하는 구조를 유지해야 합니다. |
| `app/login/actions.ts` | 아이디로 accounts와 Auth 사용자를 조회해 이메일 확인 | `auth.admin.getUserById`를 사용합니다. 키를 빼기 위해 사용자 이메일 목록을 공개하면 안 됩니다. 로그인 방식은 요청에 따라 유지했습니다. |
| `app/setup/actions.ts` | 초기 설정 계정의 Auth 조회 및 비밀번호 설정 | `auth.admin.getUserById`, `updateUserById` 사용. 초기 링크 본인 확인 개선은 이번 범위에서 제외했습니다. |
| `app/api/gatcha/draw/route.ts` | 참가자·설문·점수·횟수·발급량 조회, 추첨 로그·쿠폰 기록 | 익명 클라이언트에 직접 발급 권한을 주면 안 됩니다. 현재 횟수/재고 검사 및 발급 로직은 사용자 요청으로 변경하지 않았습니다. |
| `app/api/generate-unified/route.ts` | 합성 캐시 조회·저장, Storage 업로드 | 게임 클라이언트에 캐시 쓰기 권한을 주는 대신 서버가 수행합니다. 전달된 masterData 및 기존 조합·캐시 구조는 유지했고 이미지 fetch만 제한했습니다. |
| `app/api/cleanup-storage/route.ts` | game_assets 파일 삭제 | 이번에 최고 관리자 검사를 추가했습니다. 삭제 권한을 익명으로 열지 않습니다. 기존 백그라운드 배치·재호출 흐름은 유지합니다. |

## 로그인 세션과 RLS로 대체를 검토할 수 있는 곳

| 위치 | 실제 사용 | 구분 |
| --- | --- | --- |
| `app/main/accounts/actions.ts`의 `getBranches` | 지점 목록 조회 | 공개 SELECT가 있는 지점 테이블이므로 서비스 키가 필수인 조회는 아닙니다. |
| `app/main/layout.tsx`, `app/main/page.tsx`, `app/main/coupons/layout.tsx`, `app/coupon/page.tsx` | 로그인한 본인의 accounts 권한 조회 | accounts에는 본인 SELECT 정책이 있으므로 로그인 세션으로 조회할 수 있습니다. 이번에는 요청 범위 밖이라 유지했습니다. |
| `app/main/surveys/page.tsx` | 본인 권한, 지점 목록, 설문 설정 조회 | 본인/공개 읽기 RLS로 처리 가능한 조회입니다. 변경된 설정 저장 액션과 별개로 페이지에는 서비스 키가 남아 있습니다. |
| `app/main/survey-results/page.tsx` | 본인 권한과 지점 목록 조회 | 페이지 조회에는 남아 있습니다. 설문 응답을 전달하는 `actions.ts`에서는 서비스 키를 제거했습니다. |
| `app/main/spot-difference/actions.ts`의 `saveGameData` 후반 | 기존 합성 캐시 조회·삭제, 프리뷰 생성·저장 | 일반 저장은 로그인 세션을 쓰고 후반 캐시 처리만 서비스 키입니다. 서비스 키 제거보다 먼저 이 함수의 명시적 최고 관리자 검사와 Storage/RLS 정책을 점검하는 것이 좋습니다. 이번에는 합성 이미지 fetch 보호만 공통 적용했습니다. |
| `app/main/game-management/actions.ts`의 `getTemplateUrl`, `uploadTemplate` | 비공개 admin_assets 템플릿 서명 URL 생성·업로드 | 최고 관리자 확인 후 사용합니다. 버킷을 공개하지 않고 관리자 Storage 정책으로 대체할 수 있는지 검토할 수 있습니다. |
| `app/api/export-excel/route.ts` | 비공개 admin_assets의 엑셀 템플릿 다운로드 | 데이터 조회 자체는 로그인 세션입니다. 템플릿 읽기만 서비스 키이며 최고 관리자 검사가 있습니다. |
| `app/main/game-management/archiveActions.ts` | 전체 데이터 스냅샷 생성, 비공개 아카이브 저장·목록·삭제·서명 URL | `getAdminClient`에서 최고 관리자 확인 후 실행합니다. 각 원본 테이블 및 Storage의 관리자 RLS가 완비되면 세션 클라이언트로 대체할 수 있습니다. |
| `app/main/game-management/archive/[fileName]/page.tsx` | 본인 권한 확인, 비공개 아카이브 다운로드 | 최고 관리자 검사 후 파일을 읽습니다. 권한 조회는 본인 RLS로, 파일은 관리자 Storage RLS로 대체를 검토할 수 있습니다. |
| `app/api/export-archive/route.ts` | 비공개 아카이브·엑셀 템플릿 다운로드 | 최고 관리자 검사 후 사용합니다. 같은 Storage 정책 검토 대상입니다. |
| `app/api/nickname/assign/route.ts` | `assign_random_nickname` RPC 호출 | 함수 내부 권한 및 anon EXECUTE를 확인한 뒤 키 전환 여부를 결정해야 합니다. 이번에는 변경하지 않았습니다. |
| `app/api/translate/route.ts` | `increment_translation_usage` RPC 호출 | 이번에 로그인 및 accounts 역할(0/1) 확인을 추가하고, 검사가 끝난 후에만 서비스 클라이언트를 만듭니다. 사용량 RPC 호출의 기존 권한은 유지했습니다. |

## 이번에 제거한 사용처와 단순 import

- `app/main/surveys/actions.ts`: `toggleOptionalSurveyOnce`는 anon key와 로그인 세션을 사용하며 최고 관리자 검사 + DB RLS + 업데이트 결과 확인을 모두 거칩니다.
- `app/main/survey-results/actions.ts`: anon key와 로그인 세션으로 변경했습니다. 일반 관리자는 자기 지점 Phase 2 질문과 그 질문에 속한 응답만 서버에서 조회합니다. 지점 미지정 계정은 빈 결과를 받습니다.
- `app/main/profile/page.tsx`: `createAdminClient` import는 있지만 실제로 호출하지 않습니다. 실제 서비스 키 사용처에 포함하지 않습니다.
- `app/api/web-coupons/assign/route.ts`: 서비스 키를 언급하는 주석은 있지만 실제 클라이언트는 anon key를 사용합니다.

## 변경 범위와 검증

- 운영 DB에 `20260930000000_restrict_optional_survey_records.sql`을 적용했습니다. 익명 전체 조회를 차단하되 ID 기반 RPC 호출을 유지했습니다. ID만으로 처리하는 기존 계약은 본인 인증을 새로 추가한 것이 아닙니다.
- 게임에서 전달한 이미지 데이터셋·좌표·합성 알고리즘·캐시 키는 유지했습니다. 현재 Supabase 프로젝트의 HTTPS `game_assets` 공개 이미지 경로만 fetch 가능하며 리다이렉트, 다른 호스트/버킷, 인코딩된 경로 우회, SVG/비이미지 응답을 차단합니다. 이미지당 20MiB 및 15초 제한이 있습니다.
- `node --test tests/security.test.mjs`: 변경된 인증/범위 제한/이미지 fetch 보호 테스트 14개 통과.
- 변경 TypeScript 파일과 테스트 파일 ESLint 통과. 타입 검사 통과. 기존 합성 본체 및 전체 앱 빌드는 이번 변경의 회귀 검사 범위에서 제외했습니다.
- 쿠키 기반 로그인, 뽑기 횟수·재고 처리, 초기 비밀번호 설정, 기존 ID 기반 쿠폰 조회 계약은 요청에 따라 변경하지 않았습니다.
