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


# Database Tables & RLS Permissions
모든 데이터베이스 테이블에는 강력한 RLS(Row Level Security)가 적용되어 있습니다. 권한은 `accounts` 테이블의 `permission` 값(0: Admin, 1: User)을 기준으로 동작합니다.

- **`supported_languages` (지원 언어)**: 언어 정의. `lang_code`를 기반으로 구동되며, `lang_name`은 언어를 나타내는 항목입니다. 텍스트 항목에서는 `{"ko": "기본 얼굴", "en": "Base Face"}`와 같은 방식으로 다국어를 저장합니다.
- **`base_images` (기본 이미지 마스터)**: 게임에 사용되는 원본(Base) 이미지. `level` (INT, 1~9 제한) 컬럼을 통해 난이도 레벨을 지정합니다. (중복 레벨 허용)
  - **`questions_count` (INT)**: 유저에게 요구할 다른 그림의 개수. 반드시 연결된 `image_slots`의 개수 이하이어야 하며, DB 트리거(`validate_base_image_questions_count`)를 통해 유효성이 검증됩니다.
- **`unified_images` (통합 렌더링 이미지 캐시)**: `base_images`와 덧씌워진 `parts` 조합의 결과물을 저장하는 테이블. `image_slots` 컬럼(JSONB)에 `{"카테고리ID": "파츠ID"}` 형태로 조합을 저장하며, 트리거를 통해 파츠의 존재 여부 및 카테고리 일치 여부를 DB 차원에서 강력하게 검증합니다. `ID` 의 경우 파츠 이미지가 갱신되거나 이미지 값을 수정하더라도 그대로 유지됩니다. (이미지 삭제시 초기화) (Admin: ALL, Everyone: SELECT)
  - **Lazy Loading (온디맨드) 정책:** `/api/generate-unified` API는 요청된 조합이 `unified_images`에 존재하면 즉시 반환하고, 없을 경우에만 1장을 실시간으로 합성(JIT)하여 DB와 스토리지에 저장한 뒤 반환합니다. 관리자가 편집 내용을 저장할 때, 기존의 캐시(`unified_images`)는 모두 삭제되며 프리뷰를 위한 1장의 이미지(파츠 ID가 가장 작은 조합)만 동기적으로 재생성됩니다.
- **`branches` (지점 마스터)**: 지점 정의. 지점 구분을 `branch_id`(UUID)를 기반으로 구별하며, `branch_name`이 지점명 (다국어 지원 있음)입니다. (Admin: ALL, Everyone: SELECT)
- **`tracks` (접속 링크 마스터)**: 트랙(track) 쿼리문을 정의하는 부분. 지점 ID(`branch_id`)와 공유 여부(`is_shared`)로 구분됩니다. (Admin: ALL, Everyone: SELECT)
- **`track_logs` (접속 로그)**: 트랙 로그를 기반으로 유저 접속 및 행동 기록을 저장합니다. `game_start_count` (INT)는 재도전율 집계 및 게임 참여 판별을 위한 시작 횟수 누적 카운터이며, `share_clicked` (BOOLEAN)는 공유하기 클릭 여부를 직관적으로 기록합니다. (Admin: 전체 SELECT, User: 본인 지점 SELECT, Anon: INSERT)
- **`get_track_kpi_dashboard` (KPI 통계 RPC)**: 9대 지표(방문자수, 시작/완주/재도전율, 공유 참여/유입, 설문/쿠폰)를 시간 조건에 맞춰 동적으로 필터링하여 집계해주는 강력한 함수입니다.
  - **파라미터 (Parameters):**
    - `start_date` (TIMESTAMPTZ, 선택): 조회 시작 일시. 생략 시 과거 무한대(`-infinity`)가 적용되어 처음부터 조회합니다.
    - `end_date` (TIMESTAMPTZ, 선택): 조회 종료 일시. 생략 시 미래 무한대(`infinity`)가 적용되어 현재까지 조회합니다.
  - 파라미터 생략 시 전체 기간을 조회하며 `await supabase.rpc('get_track_kpi_dashboard', { start_date: '2026-07-01T00:00:00Z', end_date: '2026-07-31T23:59:59Z' })` 처럼 기간 조회가 가능합니다. 
  - **자동 지점 필터링 (보안):** 내부 로직에 `auth.uid()` 보안 필터가 하드코딩되어 있습니다. 최고 관리자(Admin)가 호출할 경우 전체 지점의 데이터가 반환되지만, 일반 가맹점 관리자(User)가 호출할 경우 외부 파라미터와 무관하게 무조건 본인의 `assigned_branch_id`와 일치하는 트랙만 자동 필터링되어 안전하게 반환됩니다.
  - 리턴 데이터는 `track_id`별 2개의 행(일반 트랙 / 공유 트랙)으로 나뉘어 반환되므로, 지점 단위의 합계 통계는 프론트엔드에서 두 데이터를 더하여 처리(Formatting)하는 것을 권장합니다.
- **`participants` (게임 참여자)**: 유저 기본 정보 저장. (점수는 `game_score_logs`에 저장됨). 랭킹 조회를 위해서는 본 테이블이 아닌 `ranking_view` 뷰(View)를 이용해야 합니다. `nickname_first_id`, `nickname_last_id` 컬럼으로 무작위 할당된 닉네임 조합 정보를 외래키(FK) 형태로 유지합니다. (Admin: ALL, Anon: INSERT, UPDATE. *조회는 RPC 함수 필수*)
- **`nickname_presets` (닉네임 프리셋)**: 닉네임 조합에 사용될 앞글자(first_word)와 뒷글자(last_word) 데이터를 정의합니다. `type`으로 구분하며 다국어(`text` JSONB)를 지원합니다. (Admin: ALL, Everyone: SELECT)
- **`nickname_exclusions` (닉네임 제외 조합)**: 특정 앞글자와 뒷글자의 결합을 금지하는 블랙리스트입니다. `assign_random_nickname` RPC 및 할당 로직에서 무작위 추출 시 해당 테이블에 정의된 쌍은 결과에서 배제됩니다. (Admin: ALL, Everyone: SELECT)
- **`game_score_logs` (게임 점수 로그)**: 매 게임 플레이마다 획득한 점수를 누적해서 저장하는 테이블 (1:N 구조). (Admin: ALL, Anon: INSERT. *조회는 RPC 함수 필수*)
- **`gatcha_cases` (가챠 구간 설정)**: 0점부터 1953점까지의 점수 구간(`min_score`, `max_score`)을 정의합니다. DB 테이블 레벨에 `CHECK (min_score >= 0)`, `CHECK (max_score <= 1953)`, `CHECK (min_score <= max_score)` 제약 조건이 설정되어 있어 유효하지 않은 점수 범위는 원천 차단됩니다. 구간 사이의 빈틈이나 겹침 여부는 프론트엔드 저장 로직에서 검증합니다. (Admin: ALL, Everyone: SELECT)
- **`gatcha_settings` (가챠 글로벌 설정)**: 단일 row(id=1)를 유지하며 룰렛 쿨타임(`cooldown_hours`, `cooldown_minutes`) 및 최고 점수 집계 제한 시간(`aggregation_hours`, `aggregation_minutes`)을 설정합니다. (Admin: ALL, Everyone: SELECT)
- **`coupon_effects` (쿠폰 혜택)**: 발급 가능한 쿠폰을 정의합니다. 혜택 텍스트는 다국어 처리(JSON)를 지원합니다. `probability` (JSONB) 컬럼을 통해 `{"case_id": 0.5}` 형태로 각 가챠 구간(Case)별 당첨 확률(0~1)을 유연하게 매핑하여 저장합니다. (각 Case별 총합 100% 초과 여부는 프론트엔드 편집기에서 검증합니다.) (Admin: ALL, Everyone: SELECT)
- **`issued_coupons` (발급된 쿠폰)**: 유저가 획득한 쿠폰. `participant_id`와 연동되며, 본인의 쿠폰 조회가 가능합니다. 데이터를 불러오기 위해선 반드시 RPC 함수 사용이 필수입니다. (Admin: ALL, User: UPDATE/SELECT, Anon: INSERT. *조회는 RPC 함수 필수*)
- **`survey_questions` (설문 문항)**: 질문 정의. 관리자(Admin)는 전부 수정 가능하며, 지점(User)은 본인 지점 한정으로 수정 가능합니다. `survey_phase`(int)로 내용이 정의됩니다 (0: 힌트 질문, 1: 쿠폰 받기 전 질문, 2: 지점 특화 질문). `question_type=0`은 질문 여러개 중 한개를 선택하는 문제, `question_type=1`은 질문 여러개 중 여러개를 선택하는 문제이며, 주관식(단답형, `question_type=2`)의 경우 다언어 부가설명/Placeholder 텍스트를 `options[0]` 배열에 저장합니다. (Admin: ALL, User: 본인 지점 ALL, Everyone: SELECT)
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
   - `ranking_view`는 보안상 민감한 데이터를 제외하고 최고 점수 기록인 `nickname_first`, `nickname_last`(다국어 JSONB), `best_score`, `gookbap_score`, `joined_time`만 제공합니다. (동점자 발생 시 `joined_time`이 빠른 순으로 순위가 결정되며, 전체 데이터는 `best_score` 기준 내림차순 정렬되어 반환됩니다.)
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

# Unified Image Generation API Guide
게임 클라이언트에서 퍼즐(다른그림찾기) 이미지를 요청할 때 사용하는 온디맨드 렌더링 API 명세입니다.
이 API는 CORS가 허용되어 있어 외부 게임 클라이언트에서도 안전하게 호출할 수 있습니다. 
내부적으로 캐싱을 수행하며 캐시가 없을 경우에만 합성합니다 (Lazy Loading).

- **Endpoint**: `POST /api/generate-unified`
- **Headers**: `Content-Type: application/json`
- **Request Body (JSON)**:
  ```json
  {
    "baseImageId": 1,
    "imageSlots": {
      "1": 2, // "카테고리ID": "요청할 파츠ID"
      "2": 5,
      "3": 12
    }
  }
  ```
- **Response (Success - 200 OK)**:
  ```json
  {
    "success": true,
    "url": "https://[SUPABASE_PROJECT].supabase.co/storage/v1/object/public/game_assets/unified_cache/base1_uuid.webp"
  }
  ```
- **Response (Error - 400/404/500)**:
  ```json
  {
    "error": "오류 메세지"
  }
  ```

# Nickname Assignment API Guide
외부 게임 클라이언트 등에서 익명 유저에게 무작위 닉네임을 할당할 때 사용하는 API 명세입니다.

- **Endpoint**: `POST /api/nickname/assign`
- **Headers**: `Content-Type: application/json`
- **Request Body (JSON)**:
  ```json
  {
    "participant_id": "유저의 UUID 문자열"
  }
  ```
- **Response (Success - 200 OK)**:
  ```json
  {
    "success": true,
    "nickname": "든든한 국밥"
  }
  ```
- **Response (Error - 400/500)**:
  ```json
  {
    "error": "오류 메세지"
  }
  ```

# Gatcha Draw API Guide
게임 클라이언트에서 룰렛(가챠)을 실행할 때 호출하는 온디맨드 API 명세입니다.
요청 시, `gatcha_settings` 테이블에 설정된 '최고 점수 집계 기준 시간' 이내의 해당 유저 플레이 기록(`game_score_logs`)만을 조회하여 가장 높은 점수를 찾고, 그에 해당하는 `gatcha_cases` 구간의 확률 풀을 기준으로 서버사이드 JIT 렌더링 방식의 가중치 랜덤(가챠)을 수행합니다. 룰렛 쿨타임 제한도 이 안에서 검증됩니다. 발급된 쿠폰은 자동으로 `issued_coupons`에 INSERT 됩니다.

- **Endpoint**: `POST /api/gatcha/draw`
- **Headers**: `Content-Type: application/json`
- **Request Body (JSON)**:
  ```json
  {
    "participant_id": "유저의 UUID 문자열"
  }
  ```
- **Response (Success - 200 OK)**:
  ```json
  {
    "success": true,
    "coupon_type": "{\"ko\":\"국밥 1그릇 무료 뚝딱 쿠폰\",\"en\":\"Free Gookbap\"}"
  }
  ```
- **Response (Error - 400/500/Cooldown/NoScore)**:
  ```json
  {
    "error": "아직 룰렛을 돌릴 수 없습니다. / 최근 플레이 기록이 없습니다."
  }
  ```

# KPI Data Collection & Event Tracking Guide
프론트엔드 및 게임 클라이언트에서 9대 핵심 KPI를 대시보드에 정확히 집계하기 위해, 유저 행동 단계별로 수행해야 할 DB 연동 가이드입니다.

### 1단계: 유저 접속 (방문자 수 / 공유 유입 수)
유저가 최초로 페이지에 들어오면, 익명 UUID(`participant_id`)를 발급하고 `track_logs`에 접속 로그를 남깁니다.
- **DB 작업 (INSERT)**: `track_logs` 테이블에 `track_id`, `participant_id`, `game_start_count: 0`, `share_clicked: false`로 기록.
- **KPI 연결**: 이를 통해 **방문자 수**가 카운트됩니다. 접속한 `track_id`가 `is_shared=true`인 트랙이라면 자동으로 **공유 유입 수**로 분류됩니다.

### 2단계: 게임 시작 및 재도전 (게임 시작률 / 재도전율)
유저가 게임을 시작할 때마다 카운터를 증가시킵니다.
- **DB 작업 (UPDATE)**: `track_logs`에서 현재 `track_id`와 `participant_id` 조건으로 `game_start_count`를 1씩 증가.
- **KPI 연결**: 값이 1 이상이면 **게임 시작자**, 2 이상이면 **재도전 유저**로 자동 집계됩니다.

### 3단계: 게임 완료 (게임 완주율)
게임이 끝난 후 점수를 획득하면 기록합니다.
- **DB 작업 (INSERT)**: `game_score_logs`에 점수 데이터 추가.
- **KPI 연결**: 기록이 1개라도 존재하는 유저는 **게임 완주자**로 자동 집계됩니다.

### 4단계: 공유하기 버튼 클릭 (공유 참여율)
유저가 공유하기를 누른 시점에 클릭 여부를 갱신합니다.
- **DB 작업 (UPDATE)**: `track_logs`에서 해당 유저의 `share_clicked`를 `true`로 갱신.
- **KPI 연결**: 이 값이 `true`가 된 유저 수를 합산하여 **공유 참여율**을 도출합니다.

### 5단계: 공유 링크 생성 (바이럴 확산 준비)
유저가 누군가에게 공유할 링크(URL)를 만들 때는 새로운 트랙을 생성하는 것이 아닙니다. 
- **프론트엔드 로직**: 현재 할당된 지점(`branch_id`)에 속한 트랙 중, 이미 데이터베이스에 설정되어 있는 **`is_shared = true`인 `track_id`를 불러와 URL 파라미터로 삽입**하여 공유 링크를 만듭니다.
- **KPI 연결**: 이렇게 만들어진 링크를 타고 들어온 새로운 유저들은 1단계 접속 처리 시 자동으로 **공유 유입 수** 통계에 묶이게 됩니다.

### 6단계: 설문 제출 (설문 완료율)
- **DB 작업 (INSERT)**: `survey_responses`에 답변 기록.
- **KPI 연결**: 제출된 응답 중, `survey_questions` 테이블의 **`question_type = 1`인 문항(주요 설문)에 답변한 이력이 있는 유저**만을 추려내어 **설문 완료율**로 자동 집계합니다.

### 7단계: 쿠폰 발급 및 사용 (쿠폰 사용률)
- **DB 작업 (발급 시 INSERT)**: 쿠폰 획득 시 `issued_coupons`에 기록 (**총 발급 수** 집계).
- **DB 작업 (사용 시 UPDATE)**: 오프라인 매장 등에서 사용 처리 시 `issued_coupons`의 `is_used`를 `true`로 갱신.
- **KPI 연결**: `is_used = true`인 쿠폰 수를 집계하여 발급 수 대비 **쿠폰 사용률**을 자동 도출합니다.
