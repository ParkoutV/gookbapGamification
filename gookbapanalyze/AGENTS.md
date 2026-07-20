<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Agent Documentation Rule (CRITICAL)
- **자동 문서화 의무:** 만약 데이터베이스 스키마(테이블 생성/수정), RLS 권한, 보안 규칙, 또는 시스템 핵심 로직을 수정하거나 새로 생성하는 경우, **반드시 사용자의 명시적인 요청이 없더라도 이 `AGENTS.md` 파일도 함께 최신화**해야 합니다.

# Security & Key Usage Rule (CRITICAL)
- **SERVICE_ROLE_KEY 우회 금지:** 프론트엔드(게임 클라이언트 등) 환경에서 권한 부족 오류가 발생했을 때, 이를 해결하기 위해 `SERVICE_ROLE_KEY`를 사용하여 RLS를 강제로 우회하는 것은 **명시적으로 금지**됩니다.
- 권한 문제가 발생할 경우, 단순히 RLS 설정 변경이나 RPC 함수 추가로 해결할 수 있는 문제인지 먼저 파악하고, **반드시 사용자에게 RLS 정책/함수 수정을 권장**한 뒤 프론트엔드에서는 오직 `ANON_KEY`만 사용하여 접근하도록 코드를 작성해야 합니다.


# Dashboard Roles & Permissions
이 프로젝트는 웹게임과 동일한 데이터베이스(동일한 anon key)를 사용하는 대시보드입니다. 접속자는 두 가지 역할로 나뉩니다:
1. **user 계정 (일반 관리자)**
   - QR 코드 인식 쿠폰 데이터베이스 조회 및 수정 권한
   - 게임 결과 및 설문 결과 조회 대시보드 제공
2. **admin 계정 (최고 관리자)**
   - user 권한을 모두 포함
   - 다른그림찾기 수정 권한
   - 설문 수정 권한
   - user 계정 생성 및 삭제 권한 (비밀번호 설정 제외)

# Database Schema & Accounts
Supabase의 내장 `auth.users`를 기반으로 인증을 처리하며, 추가 정보를 위해 커스텀 `accounts` 테이블을 사용합니다.
- **`accounts` 테이블**: `auth.users`와 1:1 매칭 (PK: `user_id` uuid). 시스템 전반의 계정 연계 키(Central Key)로 이 `user_id` (UUID)를 사용합니다.
- **`permission`**: `0` = Admin(본사), `1` = User(가맹점).
- **Admin 초기 계정**: `auth.users`에 BCrypt로 `0821` 비밀번호가 설정되어 있으며, `accounts`에 `permission = 0`으로 연동됩니다.

# Database Tables & RLS Permissions
모든 데이터베이스 테이블에는 강력한 RLS(Row Level Security)가 적용되어 있습니다. 권한은 `accounts` 테이블의 `permission` 값(0: Admin, 1: User)을 기준으로 동작합니다.

- **`supported_languages` (지원 언어)**: 언어 정의. `lang_code`를 기반으로 구동되며, `lang_name`은 언어를 나타내는 항목입니다. 텍스트 항목에서는 `{"ko": "기본 얼굴", "en": "Base Face"}`와 같은 방식으로 다국어를 저장합니다.
- **`base_images` (기본 이미지 마스터)**: 게임에 사용되는 원본(Base) 이미지. `level` (INT, 1~9 제한) 컬럼을 통해 난이도 레벨을 지정합니다. (중복 레벨 허용)
- **`branches` (지점 마스터)**: 지점 정의. 지점 구분을 `branch_id`(UUID)를 기반으로 구별하며, `branch_name`이 지점명 (다국어 지원 있음)입니다. (Admin: ALL, Everyone: SELECT)
- **`tracks` (접속 링크 마스터)**: 트랙(track) 쿼리문을 정의하는 부분. 지점 ID(`branch_id`)와 공유 여부(`is_shared`)로 구분됩니다. (Admin: ALL, Everyone: SELECT)
- **`track_logs` (접속 로그)**: 트랙 로그를 기반으로 유저 접속 기록을 표시합니다. 이 데이터를 기반으로 유저가 어느 지점에서 왔는지 조회 가능합니다. (Admin: 전체 SELECT, User: 본인 지점 SELECT, Anon: INSERT)
- **`participants` (게임 참여자)**: 유저 기본 정보 저장. (점수는 `game_score_logs`에 저장됨). 랭킹 조회를 위해서는 본 테이블이 아닌 `ranking_view` 뷰(View)를 이용해야 합니다. (Admin: ALL, Anon: INSERT, UPDATE. *조회는 RPC 함수 필수*)
- **`game_score_logs` (게임 점수 로그)**: 매 게임 플레이마다 획득한 점수를 누적해서 저장하는 테이블 (1:N 구조). (Admin: ALL, Anon: INSERT. *조회는 RPC 함수 필수*)
- **`coupon_effects` (쿠폰 혜택)**: 쿠폰 정의. 쿠폰 설명은 텍스트로만 구성됩니다. (Admin: ALL, Everyone: SELECT)
- **`issued_coupons` (발급된 쿠폰)**: 유저가 획득한 쿠폰. `participant_id`와 연동되며, 본인의 쿠폰 조회가 가능합니다. 데이터를 불러오기 위해선 반드시 RPC 함수 사용이 필수입니다. (Admin: ALL, User: UPDATE/SELECT, Anon: INSERT. *조회는 RPC 함수 필수*)
- **`survey_questions` (설문 문항)**: 질문 정의. 관리자(Admin)는 전부 수정 가능하며, 지점(User)은 본인 지점 한정으로 수정 가능합니다. `survey_phase`(int)로 내용이 정의됩니다 (0: 힌트 질문, 1: 쿠폰 받기 전 질문, 2: 지점 특화 질문). 주관식(단답형, `question_type=2`)의 경우 다언어 부가설명/Placeholder 텍스트를 `options[0]` 배열에 저장합니다. (Admin: ALL, User: 본인 지점 ALL, Everyone: SELECT)
- **`survey_responses` (설문 응답)**: 질문 결과를 저장하는 곳. `participant_id`로 유저 인식이 가능합니다. (Admin: ALL, User: 본인 지점 ALL, Everyone: INSERT)

# Frontend RPC Guidelines & Anonymous Users
일반 유저(게임 참가자)는 Supabase Auth 로그인을 사용하지 않고 LocalStorage의 `participant_id` (UUID)를 사용해 익명(Anon)으로 동작합니다. 
데이터베이스 전체 탈취(Table Dump)를 방지하기 위해 익명 유저의 테이블 직접 조회(`SELECT`) 권한은 RLS로 막혀 있습니다. 따라서 본인의 데이터를 조회할 때는 반드시 아래의 **RPC 함수**를 호출해야 합니다.

1. **내 참여 정보 조회 (`participants`)**
   - ❌ `supabase.from('participants').select('*').eq('participant_id', id)`
   - ✅ `supabase.rpc('get_participant', { p_id: id })`

2. **내 쿠폰 목록 조회 (`issued_coupons`)**
   - ❌ `supabase.from('issued_coupons').select('*').eq('participant_id', id)`
   - ✅ `supabase.rpc('get_my_coupons', { p_id: id })`

3. **내 게임 점수 기록 조회 (`game_score_logs`)**
   - ❌ `supabase.from('game_score_logs').select('*').eq('participant_id', id)`
   - ✅ `supabase.rpc('get_my_score_logs', { p_id: id })`

*(주의: 익명 유저의 점수를 갱신하는 `UPDATE`나, 최초 생성 시의 `INSERT` 로직은 기존처럼 테이블을 직접 호출해도 정상 작동합니다.)*

4. **전체 랭킹 조회 (`ranking_view`)**
   - 랭킹 데이터는 `participants` 테이블 직접 조회가 차단되어 있으므로, 반드시 전용 뷰(View)인 `ranking_view`를 통해 조회해야 합니다.
   - `ranking_view`는 보안상 민감한 데이터를 제외하고 최고 점수 기록인 `nickname`, `best_score`, `gookbap_score`, `joined_time`만 제공합니다. (동점자 발생 시 `joined_time`이 빠른 순으로 순위가 결정되며, 전체 데이터는 `best_score` 기준 내림차순 정렬되어 반환됩니다.)
   - ✅ `supabase.from('ranking_view').select('*')`

# Multilingual Support Manual
본 프로젝트의 다국어 대응은 다음의 5가지 원칙을 따릅니다:

1. **언어 데이터 형식 (JSONB):** 모든 다국어 텍스트는 `{"ko": "한국어 텍스트", "en": "English Text"}` 형태의 JSONB 구조로 저장됩니다.
2. **활성화된 언어 기준:** `supported_languages` 테이블에 등록된 언어 중 `is_active = TRUE`인 언어 목록을 기준으로 대시보드 내의 텍스트 수정 및 입력 폼이 제공됩니다.
3. **기본 표시 언어:** 대시보드 내부 UI의 기본 표기 언어는 항상 **한국어(ko)**로 표시됩니다.
4. **텍스트 입력/수정 방식:** 데이터를 입력하거나 수정할 때, JSONB 형식을 준용하여 각 활성화된 언어별로 각각 텍스트 입력/수정이 가능해야 합니다.
7. **부분 업데이트 (안전장치):** 데이터를 DB에 업데이트할 때, 기존 JSONB 전체 데이터를 완전히 덮어쓰거나 날려버려서는 안 됩니다. **입력된 특정 언어 키(Key)에 해당되는 값만 수정하고, 나머지 기존 데이터는 그대로 유지(Merge/Patch)**해야 합니다. 이는 현재 `is_active = FALSE` 상태여서 화면에 보이지 않는 과거 언어 데이터가 다른 언어 수정 시 덩달아 삭제되는 것을 방지하기 위함입니다.
8. **DB 반환 타입 파싱 주의 (중요):** `jsonb` 컬럼(`options` 등)과 달리, 일반 `text` 컬럼(`branch_name`, `question_text` 등)에 다국어 JSON이 문자열 형태로 저장된 경우, DB에서 불러온 즉시 `JSON.parse`를 통해 객체화하여 사용해야 하며 저장 시에도 명시적으로 `JSON.stringify` 처리를 해 주어야 다국어 데이터가 훼손되지 않습니다.

# Script Organization
- 프로젝트 관리를 위해 작성되는 `.mjs` 및 `.js` 형태의 유틸리티/관리 스크립트(DB 스키마 확인, RLS 셋업 스크립트 등)는 루트 폴더가 아닌 **`scripts/`** 폴더에 모아서 관리합니다.
- 단, `eslint.config.mjs`, `postcss.config.mjs` 등 프레임워크 구동을 위한 필수 환경 설정 파일은 루트 폴더에 유지합니다.
