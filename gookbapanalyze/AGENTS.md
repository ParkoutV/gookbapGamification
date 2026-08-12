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

# Database Schema & Tables

모든 데이터베이스 테이블에는 강력한 RLS(Row Level Security)가 적용되어 있습니다. 기본 권한은 `accounts` 테이블의 `permission` 값(0: Admin, 1: User)을 기준으로 동작합니다.

### 1. `accounts` (사용자 계정 및 권한)
Supabase의 `auth.users`와 1:1로 매칭되는 시스템 전반의 계정 및 권한 관리 테이블입니다.

**[RLS Policies]**
- `SELECT` (공개): `최고 관리자(Admin) 전용` *(Policy: Admin can view all accounts)*
- `SELECT` (공개): `본인 계정만 허용` *(Policy: Users can view their own account)*
* **`user_id`** (`uuid`, Primary Key): 사용자 고유 식별자입니다. 시스템 전반의 연계 키(Central Key)로 사용됩니다.
  * *제약조건:* `auth.users(id)`와 외래키 관계로 연결되어 있으며, 유저 삭제 시 연쇄 삭제(`ON DELETE CASCADE`)됩니다.
* **`account_id`** (`text`): 관리자가 로그인할 때 사용하는 아이디(문자열)입니다.
  * *제약조건:* 고유값(`UNIQUE`)을 가져야 하며 `NOT NULL`입니다.
* **`permission`** (`integer`): 계정의 권한 등급을 나타냅니다.
  * *제약조건:* `NOT NULL`이며, 반드시 `0`(최고 관리자) 또는 `1`(일반/지점 관리자)만 들어갈 수 있도록 `CHECK (permission IN (0, 1))` 제약이 걸려 있습니다.
* **`created_at`** (`timestamp with time zone`): 계정 생성 일시입니다. (기본값: `now()`)
* **`is_setup_completed`** (`boolean`): 계정의 초기 세팅 완료 여부입니다. (기본값: `false`)
* **`assigned_branch_id`** (`uuid`, Nullable): 해당 관리자가 소속된 지점의 ID입니다. 최고 관리자(`permission: 0`)의 경우 null일 수 있습니다.
  * *제약조건:* `branches(branch_id)`와 외래키 관계이며, 지점 삭제 시 `ON DELETE SET NULL` 처리됩니다.

### 2. `base_images` (기본 게임 이미지)
게임(다른그림찾기)의 배경이 되는 원본 이미지를 정의합니다.

**[RLS Policies]**
- `ALL` (공개): `최고 관리자(Admin) 전용` *(Policy: Admin ALL on base_images)*
- `SELECT` (공개): `모두 허용` *(Policy: Enable read access for all users)*
- `SELECT` (공개): `모두 허용` *(Policy: Everyone SELECT base_images)*
* **`id`** (`bigint`, Primary Key): 이미지 고유 번호.
* **`title`** (`jsonb`): 이미지의 다국어 제목. (예: `{"ko": "기본", "en": "Base"}`)
* **`image_url`** (`text`): 원본 이미지의 스토리지 저장 경로(URL).
* **`created_at`** (`timestamp with time zone`): 생성 일시. (기본값: `now()`)
* **`level`** (`integer`): 이미지의 난이도 레벨(1~9)입니다.
  * *제약조건:* `CHECK (level >= 1 AND level <= 9)`로 값이 보호됩니다.
* **`questions_count`** (`integer`): 이 이미지에서 찾도록 요구할 다른 그림의 개수입니다. (기본값: 3)
  * *제약조건:* DB 트리거(`validate_base_image_questions_count`)를 통해 연결된 `image_slots`의 개수 이하인지 무결성이 항상 검증됩니다.

### 3. `image_slots` (이미지 파츠 조합 슬롯)
`base_images` 위에 파츠(다른 그림 요소)가 올라갈 좌표 위치를 정의합니다.

**[RLS Policies]**
- `ALL` (공개): `최고 관리자(Admin) 전용` *(Policy: Admin ALL on image_slots)*
- `SELECT` (공개): `모두 허용` *(Policy: Enable read access for all users)*
* **`id`** (`bigint`, Primary Key): 슬롯 고유 번호.
* **`base_image_id`** (`bigint`): 어느 기본 이미지에 종속된 슬롯인지 식별합니다. (`base_images(id)` 외래키, `CASCADE`)
* **`category_id`** (`bigint`): 이 위치에 들어갈 수 있는 파츠의 카테고리입니다. (`part_categories(id)` 외래키, `CASCADE`)
* **`x_coordinate`** (`integer`, NOT NULL): 파츠가 합성될 X 좌표.
* **`y_coordinate`** (`integer`, NOT NULL): 파츠가 합성될 Y 좌표.
* **`z_index`** (`integer`): 레이어 겹침 순서(Z-index). (기본값: 1)
* **`scale`** (`real`): 이미지 확대/축소 배율. (기본값: 1.0)

### 4. `unified_images` (통합 렌더링 이미지 캐시)
기본 이미지 위에 여러 파츠를 합성한 완성본 렌더링 결과(JIT 렌더링 캐시)를 저장합니다.

**[RLS Policies]**
- `ALL` (공개): `최고 관리자(Admin) 전용` *(Policy: Admin ALL on unified_images)*
- `SELECT` (공개): `모두 허용` *(Policy: Everyone SELECT on unified_images)*
- `SELECT` (공개): `모두 허용` *(Policy: Everyone SELECT unified_images)*
* **`id`** (`uuid`, Primary Key): 캐시 고유 번호 (기본값: `gen_random_uuid()`).
* **`base_image_id`** (`bigint`): 사용된 기본 이미지. (`base_images(id)` 외래키, `CASCADE`)
* **`image_slots`** (`jsonb`): 어떠한 파츠들의 조합으로 만들어졌는지 저장합니다. (예: `{"카테고리ID": "파츠ID"}`)
  * *제약조건:* DB 차원의 트리거를 통해 파츠의 존재 여부와 카테고리 일치 여부가 강제로 검증됩니다.
* **`unified_image_url`** (`text`): 합성 완료된 이미지의 스토리지 URL.
* **`created_at`** (`timestamp with time zone`): 캐시 생성 일시. (기본값: `now()`)
* **Lazy Loading 정책:** `/api/generate-unified` 호출 시 기존에 조합이 존재하면 즉시 반환, 없을 경우 1장을 합성하여 캐싱합니다. 편집 저장 시 캐시는 전부 초기화됩니다. (Admin: ALL, Everyone: SELECT)

### 5. `part_categories` & `parts` (이미지 파츠 정의)
**[`part_categories`]**

**[RLS Policies]**
- `ALL` (공개): `최고 관리자(Admin) 전용` *(Policy: Admin ALL on part_categories)*
- `SELECT` (공개): `모두 허용` *(Policy: Enable read access for all users)*
* **`id`** (`bigint`, Primary Key): 카테고리 고유 번호.
* **`name`** (`jsonb`): 카테고리 다국어 이름.

**[`parts`]**

**[RLS Policies]**
- `ALL` (공개): `최고 관리자(Admin) 전용` *(Policy: Admin ALL on parts)*
- `SELECT` (공개): `모두 허용` *(Policy: Enable read access for all users)*
* **`id`** (`bigint`, Primary Key): 파츠 고유 번호.
* **`category_id`** (`bigint`): 소속 카테고리. (`part_categories(id)` 외래키, `CASCADE`)
* **`name`** (`jsonb`): 파츠의 다국어 이름.
* **`image_url`** (`text`): 파츠 이미지 스토리지 URL.
* **`offset_x` / `offset_y`** (`integer`): 슬롯 기준 세부 오프셋. (기본값: 0)
* **`scale`** (`real`): 파츠 자체의 크기 배율. (기본값: 1.0)

### 6. `branches` & `tracks` & `track_logs` (지점, 링크, 접속 통계) [RPC: `get_track_kpi_dashboard`, `update_track_log_action`]
**[`branches` - 지점 마스터] (Admin: ALL, Everyone: SELECT)**

**[RLS Policies]**
- `ALL` (공개): `최고 관리자(Admin) 전용` *(Policy: Admin ALL branches)*
- `SELECT` (공개): `모두 허용` *(Policy: Everyone SELECT branches)*
* **`branch_id`** (`uuid`, Primary Key): 지점 식별자.
* **`branch_name`** (`text`): 지점의 다국어 이름 (문자열 직렬화(JSON.stringify)로 저장).
  * *제약조건:* 유일해야 합니다. (`UNIQUE`)
* **`created_at`** (`timestamp with time zone`): 생성 일시.

**[`tracks` - 접속 링크(트랙) 마스터] (Admin: ALL, Everyone: SELECT)**

**[RLS Policies]**
- `ALL` (공개): `최고 관리자(Admin) 전용` *(Policy: Admin ALL tracks)*
- `SELECT` (공개): `모두 허용` *(Policy: Everyone SELECT tracks)*
* **`track_id`** (`varchar`, Primary Key): 링크 URL에 삽입될 트랙 고유 문자열.
* **`is_shared`** (`boolean`): 다른 유저가 공유하기를 통해 배포한 링크인지 여부. (공유 유입 KPI 계산용)
* **`created_at`** (`timestamp with time zone`): 생성 일시.
* **`branch_id`** (`uuid`): 해당 트랙이 소속된 지점. (`branches(branch_id)` 외래키, `CASCADE`)

**[`track_logs` - KPI 측정을 위한 유저 행동 로그] (Admin: 전체 SELECT, User: 본인 지점 SELECT, Anon: 권한 없음, RPC 필수)**

**[RLS Policies]**
- `SELECT` (공개): `최고 관리자(Admin) 전용` *(Policy: Admin SELECT track_logs)*
- `SELECT` (공개): `해당 지점 관리자 전용` *(Policy: User SELECT track_logs)*
*익명 유저의 INSERT 권한이 삭제되었으며, 프론트엔드는 반드시 `add_track_log` RPC를 통해서만 세션 기반으로 로그를 생성해야 합니다.*
* **`log_id`** (`uuid`, Primary Key): 로그 식별자.
* **`participant_id`** (`uuid`): 방문 유저 식별자. (`participants` 외래키, `CASCADE`)
* **`track_id`** (`varchar`, Nullable): 접속한 트랙 문자열.
  * *제약조건:* 존재하지 않는 URL(트랙)로 접속한 경우나 지정하지 않았을 때 앱 차원에서 Null 처리되거나 기본 트랙으로 맵핑됩니다. 세션이 유지되는 동안에는 트랙 ID가 변경되어도 덮어쓰지 않습니다.
* **`access_time`** (`timestamp with time zone`): 접속/방문 시간. (방문자 수 KPI 연결)
* **`game_start_count`** (`integer`): 해당 유저가 게임을 재시도/시작한 누적 횟수. (게임 시작자, 재도전 유저 KPI 연결)
* **`share_clicked`** (`boolean`): 이 유저가 게임 종료 후 '공유하기' 버튼을 눌렀는지 여부. (공유 참여율 KPI 연결)

**[`participant_sessions` - 내부 세션 관리 테이블] (Internal Use Only, No RLS)**
* 프론트엔드에 노출되지 않으며, 중복 접속 추적을 방지하기 위해 RPC 함수 내부적으로만 사용되는 테이블입니다.
* **`participant_id`** (`uuid`, Primary Key): 세션 주체. (`participants` 외래키, `CASCADE`)
* **`current_log_id`** (`uuid`): 현재 활성화된 추적 로그. (`track_logs` 외래키, `CASCADE`)
* **`last_requested_at`** (`timestamp with time zone`): 마지막 활동 시간. (기본 30분 타임아웃 검증용)

**[`get_track_kpi_dashboard` (KPI 통계 RPC)]** 
9대 지표(방문자수, 시작/완주/재도전율, 공유 참여/유입, 설문/쿠폰)를 시간 조건에 맞춰 동적으로 필터링하여 집계해주는 강력한 함수입니다.
* **파라미터 (Parameters):**
  * `start_date` (TIMESTAMPTZ, 선택): 조회 시작 일시. 생략 시 `-infinity`
  * `end_date` (TIMESTAMPTZ, 선택): 조회 종료 일시. 생략 시 `infinity`
* **자동 지점 필터링 (보안):** 내부 로직에 `auth.uid()` 보안 필터가 하드코딩되어 일반 가맹점 관리자(User)는 본인 지점 트랙만 자동 조회됩니다.

### 7. `participants` (유저 및 익명 정보) (Admin: ALL, Anon: INSERT, *조회는 RPC 함수 필수*) [RPC: `get_participant`, `assign_random_nickname`, `reassign_invalid_nicknames`]

**[RLS Policies]**
- `ALL` (공개): `최고 관리자(Admin) 전용` *(Policy: Admin ALL on participants)*
- `INSERT` (익명): (조건 없음) *(Policy: Anon INSERT participants)*
* **`participant_id`** (`uuid`, Primary Key): 게임에 참가한 익명 유저의 기기(LocalStorage) 식별자입니다.
* **`roulette_joined`** (`timestamp with time zone`, Nullable): 가장 마지막에 가챠(룰렛)를 돌린 시간입니다. (룰렛 쿨타임 제한 검증용)
* **`last_participated_at`** (`timestamp with time zone`): 마지막 방문 일시.
* **`created_at`** (`timestamp with time zone`): 최초 방문 일시.
* **`nickname_first_id` / `nickname_last_id`** (`uuid`, Nullable): 닉네임 구성을 위해 할당받은 단어 ID입니다.
  * *제약조건:* 중복 방지 및 정규화를 위해 텍스트 자체가 아닌 `nickname_presets(id)` 외래키(`ON DELETE SET NULL`)로 구성됩니다.
* **`nickname_number`** (`varchar`, Nullable): 닉네임 뒤에 붙는 무작위 숫자 (예: '0023').
  * *제약조건:* `UNIQUE (nickname_first_id, nickname_last_id, nickname_number)` 제약으로 동일한 닉네임 단어 조합과 숫자를 가진 유저가 중복으로 존재하지 못하도록 강제합니다.

### 8. `nickname_presets` & `nickname_exclusions` (닉네임 관리) (Admin: ALL, Everyone: SELECT)
**[`nickname_presets`]**

**[RLS Policies]**
- `ALL` (관리자 로그인): `최고 관리자(Admin) 전용` *(Policy: Admins can do everything on nickname_presets)*
- `SELECT` (공개): `모두 허용` *(Policy: Anyone can select nickname_presets)*
- `SELECT` (공개): `모두 허용` *(Policy: Everyone SELECT nickname_presets)*
* **`id`** (`uuid`, Primary Key): 단어 프리셋 식별자.
* **`type`** (`varchar`): 'first_word'(앞글자) 또는 'last_word'(뒷글자) 인지를 구분합니다.
  * *제약조건:* `CHECK (type IN ('first_word', 'last_word'))`
* **`text`** (`jsonb`): 단어의 다국어 데이터.
* **`is_active`** (`boolean`): 할당 풀(Pool) 활성화 여부.
* **`created_at`** (`timestamp with time zone`): 생성 일시.

**[`nickname_exclusions`]**

**[RLS Policies]**
- `ALL` (관리자 로그인): `최고 관리자(Admin) 전용` *(Policy: Admins can do everything on nickname_exclusions)*
- `SELECT` (공개): `모두 허용` *(Policy: Anyone can select nickname_exclusions)*
- `SELECT` (공개): `모두 허용` *(Policy: Everyone SELECT nickname_exclusions)*
* **`id`** (`uuid`, Primary Key): 제외 규칙 식별자.
* **`first_word_id` & `last_word_id`** (`uuid`): 서로 결합할 수 없는 앞/뒷 단어 쌍. (`nickname_presets` 외래키)
  * *제약조건:* `UNIQUE (first_word_id, last_word_id)`로 동일 규칙 중복 등록 방지.

**[`nickname_settings` - 닉네임 설정] (Admin: ALL, Everyone: SELECT)**
* **`id`** (`integer`, Primary Key): 설정 로우 식별자. (`CHECK (id = 1)`)
* **`digit_length`** (`integer`): 닉네임에 부여될 숫자의 자릿수. (예: 4 -> '0023', 3 -> '015'). 해당 값이 변경(증가/감소)되면 `update_nickname_digit_length` RPC를 통해 기존 유저들의 숫자도 자동으로 재생성 및 패딩됩니다.

### 9. `game_score_logs` (게임 점수 기록) (Admin: ALL, Anon: INSERT, *조회는 RPC 함수 필수*) [RPC: `get_my_score_logs`]

**[RLS Policies]**
- `ALL` (공개): `최고 관리자(Admin) 전용` *(Policy: Admin ALL on game_score_logs)*
- `INSERT` (익명): (조건 없음) *(Policy: Anon INSERT game_score_logs)*
* **`log_id`** (`uuid`, Primary Key): 점수 기록 식별자.
* **`participant_id`** (`uuid`): 플레이한 참가자. (`participants` 외래키, `CASCADE`)
* **`best_score`** (`integer`): 해당 게임에서 획득한 최고 점수.
* **`gookbap_score`** (`integer`): 획득한 국밥(재화) 점수.
* **`joined_time`** (`timestamp with time zone`): 게임 플레이 일시. (이 시간이 랭킹 계산 시 동점자 우위(먼저 플레이한 순) 정렬의 기준이 됩니다.)

### 10. `gatcha_cases`, `gatcha_settings`, `gatcha_logs` (가챠/룰렛 설정 및 이력) (Admin: ALL, Everyone: SELECT)
**[`gatcha_cases` - 가챠 점수 구간]**

**[RLS Policies]**
- `ALL` (공개): `최고 관리자(Admin) 전용` *(Policy: Admin ALL gatcha_cases)*
- `SELECT` (공개): `모두 허용` *(Policy: Enable read access for all users)*
- `SELECT` (공개): `모두 허용` *(Policy: Everyone SELECT gatcha_cases)*
* **`gatcha_case_id`** (`uuid`, Primary Key): 점수 구간 식별자.
* **`gatcha_case_name`** (`jsonb`): "브론즈", "골드" 등 점수 구간의 다국어 이름 (JSON 파싱).
* **`min_score` / `max_score`** (`integer`): 구간의 최소/최대 점수.
  * *제약조건:* `CHECK (min_score >= 0)`, `CHECK (max_score <= 1953)`, `CHECK (min_score <= max_score)` 로 DB 레벨에서 구간 무결성이 강제됩니다. 1953점을 초과하는 구간 설정은 원천 차단됩니다.

**[`gatcha_settings` - 가챠 글로벌 횟수 제한 설정]**

**[RLS Policies]**
- `ALL` (공개): `최고 관리자(Admin) 전용` *(Policy: Admin ALL gatcha_settings)*
- `SELECT` (공개): `모두 허용` *(Policy: Enable read access for all users)*
- `SELECT` (공개): `모두 허용` *(Policy: Everyone SELECT gatcha_settings)*
* **`id`** (`integer`, Primary Key): 글로벌 세팅.
  * *제약조건:* `CHECK (id = 1)`로 단 한 줄의 Row만 유지하도록 강제됩니다.
* **`limit_type`** (`varchar`): 횟수 제한 기준 ('days' 또는 'hours').
* **`limit_n` / `limit_m`** (`integer`): N일(또는 N시간) 이내에 최대 M회 참여 가능.
* **`exhaustion_behavior`** (`varchar`): 최대 발급 갯수에 도달한 소진 품목의 확률 처리 방식입니다. ('turn_to_blank' 또는 'normalize_probability')
* **`aggregation_hours` / `aggregation_minutes`** (`integer`): 이 시간 이내의 플레이 기록(`game_score_logs`)만을 집계하여 최고 점수를 기반으로 가챠 구간에 배치합니다.

**[`gatcha_logs` - 가챠 참여 이력] (Admin: ALL, Anon: INSERT)**

**[RLS Policies]**
- `ALL` (공개): `최고 관리자(Admin) 전용` *(Policy: Admin ALL gatcha_logs)*
- `INSERT` (공개): (조건 없음) *(Policy: Anon INSERT gatcha_logs)*
* **`log_id`** (`uuid`, Primary Key): 로그 식별자.
* **`participant_id`** (`uuid`): 참가자. (`participants` 외래키, `CASCADE`)
* **`joined_at`** (`timestamp with time zone`): 가챠 시도 일시. (이 이력을 바탕으로 `gatcha_settings`의 글로벌 횟수 제한 초과 여부를 검증합니다.)

### 11. `coupon_effects` & `issued_coupons` (쿠폰 마스터 및 발급 정보) [RPC: `get_my_coupons`, `get_coupon_info_for_scan`, `undo_coupon`, `use_coupon`]
**[`coupon_effects` - 혜택 정의] (Admin: ALL, Everyone: SELECT)**

**[RLS Policies]**
- `ALL` (공개): `최고 관리자(Admin) 전용` *(Policy: Admin ALL coupon_effects)*
- `SELECT` (공개): `모두 허용` *(Policy: Everyone SELECT coupon_effects)*
* **`coupon_effect_id`** (`uuid`, Primary Key): 쿠폰 식별자.
* **`coupon_type`** (`text`): 다국어 혜택명 (JSON 파싱).
* **`description`** (`text`): 부가 설명.
* **`probability`** (`jsonb`): 가챠 구간별 당첨 확률이 저장된 맵입니다. `{"case_id": 0.5}` 형태.
* **`valid_start_type`** (`text`): 쿠폰 유효 시작 조건 ('today' 또는 'tomorrow'). (기본값: 'today')
* **`expire_type`** (`text`): 만료 조건 지정 방식 ('days' 또는 'date'). (기본값: 'days')
* **`expire_days`** (`integer`, Nullable): `expire_type`이 'days'일 때 발급 후 만료 기한(일수).
* **`expire_date`** (`timestamp with time zone`, Nullable): `expire_type`이 'date'일 때 일괄 만료일.
* **`max_issuance`** (`integer`, Nullable): 이 쿠폰의 최대 발급 가능 갯수입니다. 누적 발급 갯수가 이 수치에 도달하면 소진 처리됩니다. Null일 경우 무제한입니다.
* **`is_online_coupon`** (`boolean`): 웹 전용 쿠폰 여부. true일 경우 스캐너 조회/KPI 수집에서 제외되며 `web_coupons` 할당을 트리거합니다. (기본값: false)

**[`issued_coupons` - 유저에게 발급된 쿠폰] (Admin: ALL, User: UPDATE/SELECT. *조회 및 발급은 API/RPC 필수*)**

**[RLS Policies]**
- `ALL` (공개): `최고 관리자(Admin) 전용` *(Policy: Admin ALL issued_coupons)*
- `SELECT` (공개): `지점 관리자(User) 전용` *(Policy: User SELECT issued_coupons)*
- `UPDATE` (공개): `지점 관리자(User) 전용` *(Policy: User UPDATE issued_coupons)*
* **`coupon_id`** (`uuid`, Primary Key): 발급 식별자.
* **`participant_id`** (`uuid`): 소유자. (`participants` 외래키, `CASCADE`)
* **`coupon_effect_id`** (`uuid`): 혜택 원본. (`coupon_effects` 외래키)
* **`is_used`** (`boolean`): 쿠폰 사용(매장 스캔) 완료 여부.
* **`valid_from`** (`timestamp with time zone`, Nullable): 쿠폰이 실제 유효해지는 시작 시간.
* **`issued_at` / `used_at` / `expired_at`** (`timestamp with time zone`): 각각 발급/사용/만료 일시. 만료 일시는 쿠폰 정보 획득 및 무효 판별에 활용됩니다.
  * *참고 1:* 10분 이내 사용 취소는 `undo_coupon` RPC를 통해 수행합니다.
  * *참고 2:* 발급된 쿠폰이 웹 전용 쿠폰(`is_online_coupon`)일 경우, `expired_at`은 연산되지 않고 영구적으로 null 값을 가집니다.

### 12. `web_coupons` & `web_coupon_settings` (웹 전용 이벤트 쿠폰) (Admin: ALL) [RPC: `get_my_web_coupons`, `assign_web_coupon`]
**[`web_coupons`] (*조회 및 할당은 익명 유저가 RPC 함수를 통해 수행*)**

**[RLS Policies]**
- `ALL` (공개): `최고 관리자(Admin) 전용` *(Policy: Admin ALL web_coupons)*
* **`id`** (`uuid`, Primary Key): 쿠폰 로우 식별자.
* **`coupon_code`** (`text`, UNIQUE): 사전 생성된 웹 쿠폰 번호 문자열 (예: 'A1B2C3D4').
* **`participant_id`** (`uuid`, Nullable): 이 쿠폰 번호를 가져간 유저 ID. (Null일 경우 아직 배정되지 않은 잔여 쿠폰입니다.) 가챠 시스템 특성상 중복 당첨이 가능하도록 UNIQUE 제약이 해제되었습니다.
* **`assigned_at` / `created_at`** (`timestamp with time zone`): 배정/생성 일시.

**[`web_coupon_settings`] (Everyone: SELECT)**

**[RLS Policies]**
- `ALL` (공개): `최고 관리자(Admin) 전용` *(Policy: Admin ALL web_coupon_settings)*
- `SELECT` (공개): `모두 허용` *(Policy: Everyone SELECT web_coupon_settings)*
* **`id`** (`integer`, Primary Key): 단일 Row를 식별합니다.
* **`title` / `description`** (`jsonb`): 게임 클라이언트에서 웹 쿠폰을 보여줄 때 사용할 다국어 팝업 제목 및 설명 템플릿입니다.

### 13. `survey_questions` & `survey_responses` (설문조사 기능) [RPC: `check_pending_survey`, `record_optional_survey_shown`]
**[`survey_questions`] (Admin: ALL, User: 본인 지점 ALL, Everyone: SELECT)**

**[RLS Policies]**
- `ALL` (공개): `최고 관리자(Admin) 전용` *(Policy: Admins have full access to survey_questions)*
- `ALL` (공개): `해당 지점 관리자 전용` *(Policy: Branch users have full access to their branch's survey_question)*
- `SELECT` (공개): `모두 허용` *(Policy: Everyone SELECT survey_questions)*
- `SELECT` (공개): `모두 허용` *(Policy: Everyone can read survey questions)*
* **`question_id`** (`uuid`, Primary Key): 문항 식별자.
* **`survey_phase`** (`integer`): 0(힌트), 1(주요 질문), 2(지점 특화 질문) 등 설문 시점을 나타냅니다. 
* **`question_text`** (`text`): 다국어 질문 내용 (문자열 직렬화).
* **`question_type`** (`integer`): 0(단일 선택), 1(다중 선택), 2(주관식/단답형).
* **`options`** (`jsonb`): 질문의 객관식 선택지. 주관식(`type=2`)인 경우 `options[0]`에 Placeholder 텍스트를 저장합니다.
* **`image_url`** (`text`, Nullable): 첨부 이미지.
* **`is_required`** (`boolean`): 응답 필수 여부.
* **`order_index`** (`integer`): 표시 정렬 순서.
* **`is_active`** (`boolean`): 설문 표시 여부.
* **`branch_id`** (`uuid`, Nullable): `survey_phase=2`일 경우 특정 지점에만 표시하기 위한 지점 지정용 아이디입니다. (`branches` 외래키, `CASCADE`)

**[`survey_responses`] (Admin: ALL, User: 본인 지점 ALL, Everyone: INSERT)**

**[RLS Policies]**
- `ALL` (공개): `최고 관리자(Admin) 전용` *(Policy: Admins have full access to survey_responses)*
- `ALL` (공개): `해당 지점 관리자 전용` *(Policy: Branch users have full access to their branch's survey_response)*
- `INSERT` (공개): (조건 없음) *(Policy: Everyone can insert survey responses)*
* **`response_id`** (`uuid`, Primary Key): 응답 식별자.
* **`question_id`** (`uuid`): 문항. (`survey_questions` 외래키, `CASCADE`)
* **`participant_id`** (`uuid`): 답변자. (`participants` 외래키, `CASCADE`)
* **`answer_data`** (`jsonb`): 사용자가 제출한 결과 데이터.
* **`created_at`** (`timestamp with time zone`): 제출 일시.
  * *제약조건:* `UNIQUE (question_id, participant_id)`를 통해 사용자가 동일한 설문에 두 번 답변하는 것을 원천 차단합니다.

**[`optional_survey_records`] (Admin: ALL, Everyone: SELECT)**

**[RLS Policies]**
- `ALL` (공개): `최고 관리자(Admin) 전용` *(Policy: optional_survey_records_admin_all)*
- `SELECT` (공개): `모두 허용` *(Policy: optional_survey_records_select_everyone)*
* **`participant_id`** (`uuid`, Primary Key): 응답자 식별자 (`participants` 외래키, `CASCADE`)
* **`record`** (`jsonb`): 이미 노출된 선택 질문(`is_required = FALSE`)의 `question_id` 배열을 저장합니다. (기본값: '[]'::jsonb)

**[`survey_settings`] (Admin: UPDATE, Everyone: SELECT)**

**[RLS Policies]**
- `UPDATE` (공개): `최고 관리자(Admin) 전용` *(Policy: survey_settings_admin_update)*
- `SELECT` (공개): `모두 허용` *(Policy: survey_settings_select_everyone)*
* **`id`** (`integer`, Primary Key): 단일 Row 제한 (`CHECK (id = 1)`)
* **`optional_survey_once`** (`boolean`): 선택 질문 1회 노출 기능의 전역 설정. `모두 허용`면 `optional_survey_records`를 참조하여 한 번 노출된 질문은 스킵하고, `false`면 선택 질문을 매번 노출합니다. (기본값: true)

### 14. `supported_languages` (다국어 설정)

**[RLS Policies]**
- `ALL` (공개): `최고 관리자(Admin) 전용` *(Policy: Admin can manage languages)*
- `ALL` (관리자 로그인): `최고 관리자(Admin) 전용` *(Policy: Admins can do everything on supported_languages)*
- `SELECT` (공개): `모두 허용` *(Policy: Anyone can read languages)*
- `SELECT` (공개): `모두 허용` *(Policy: Anyone can select supported_languages)*
- `SELECT` (공개): `모두 허용` *(Policy: Everyone SELECT supported_languages)*
* **`lang_code`** (`varchar`, Primary Key): 'ko', 'en' 등의 언어 식별 코드.
* **`lang_name`** (`varchar`, NOT NULL): '한국어', 'English' 등의 화면 표기 언어명.
* **`is_active`** (`boolean`): 대시보드 편집기 등에 표시하고 실제 시스템에서 지원할지 여부.
* **`order_index`** (`integer`): 표기 순서.
* **`created_at`** (`timestamp with time zone`): 생성 일시.
* **`coupon_use_text`** (`jsonb`): 앱 상에서 쿠폰을 사용하거나 오류가 발생했을 때 보여지는 `{{expired_date}}` 등 템플릿 변수가 포함된 각종 다국어 알림/에러 텍스트가 저장됩니다.

### 15. `ranking_view` (데이터 조회를 위한 전용 View)
직접적인 테이블이 아니며, `participants` 조회 차단 정책을 보완하여 유저 랭킹보드 표시 목적으로 가공된 가상의 뷰(View)입니다.
* **`participant_id`** (`uuid`): 게임 기록의 주인 유저 식별자. 프론트엔드에서 주간/월간 등 유저별로 그룹핑(필터링)할 때 사용됩니다.
* **`nickname_first` / `nickname_last`** (`jsonb`): 조인되어 가져온 닉네임의 각 단어 다국어 정보.
* **`best_score` / `gookbap_score`** (`integer`): 유저가 해당 게임에서 획득한 점수.
* **`joined_time`** (`timestamp with time zone`): 동점자 발생 시 랭킹을 판가름하기 위해 정렬 시 참조되는 시간입니다. 1명의 유저가 여러 번 플레이한 경우, 필터링 없이 **모든 기록(중복 포함)이 그대로 노출**됩니다.

# Frontend RPC Guidelines & Anonymous Users
일반 유저(게임 참가자)는 Supabase Auth 로그인을 사용하지 않고 LocalStorage의 `participant_id` (UUID)를 사용해 익명(Anon)으로 동작합니다. 
데이터베이스 전체 탈취(Table Dump)를 방지하기 위해 익명 유저의 테이블 직접 조회(`SELECT`) 권한은 RLS로 막혀 있습니다. 따라서 본인의 데이터를 조회할 때는 반드시 아래의 **RPC 함수**를 호출해야 합니다.

1. **내 참여 정보 조회 (`participants`)**
   - ❌ `supabase.from('participants').select('*').eq('participant_id', id)`
   - ✅ `supabase.rpc('get_participant', { p_id: id })`
   - **반환 예시:**
     ```json
     [
       {
         "participant_id": "uuid...",
         "created_at": "2026-08-05...",
         "nickname_first_id": "uuid...",
         "nickname_last_id": "uuid...",
         "nickname_number": "0023",
         "nickname_first": { "ko": "든든한", "en": "Hearty" },
         "nickname_last": { "ko": "국밥", "en": "Gookbap" }
       }
     ]
     ```

2. **내 쿠폰 목록 조회 (`issued_coupons`)**
   - ❌ `supabase.from('issued_coupons').select('*').eq('participant_id', id)`
   - ✅ `supabase.rpc('get_my_coupons', { p_id: id })`
   - **반환 예시:**
     ```json
     [
       {
         "coupon_id": "uuid...",
         "participant_id": "uuid...",
         "coupon_effect_id": "uuid...",
         "is_used": false,
         "issued_at": "2026-08-05...",
         "expired_at": "2026-08-12..."
       }
     ]
     ```

3. **설문 잔여 항목 조회 (`survey_questions` 필터링)**
   - 익명 유저가 답변해야 할 질문이 남았는지 확인합니다.
   - ✅ `supabase.rpc('check_pending_survey', { p_survey_phase: phase, p_participant_id: id, p_track_id: track_id })`
   - 입력 배열에 `p_servey_phase`에는 설문조사 페이즈를 입력해야 합니다. 이는 특정 페이즈에서 어느 설문을 보여줘야 하는지 직관적으로 알기 쉽도록 하기 위함입니다.
   - 반환 배열에 `question_id` 목록이 돌아옵니다. (`survey_responses`에 이미 답변한 항목 및 `survey_settings.optional_survey_once = true`일 때 `optional_survey_records`에 기록된 선택 질문은 제외됩니다.)
   - **주의 (Phase 2)**: `survey_phase = 2`인 경우 `track_id`를 통해 지점을 파악합니다. 만약 `track_id`가 없거나 유효하지 않은 트랙인 경우, 오류를 반환하지 않고 **단순히 빈 배열(설문거리 없음)**을 반환합니다.
   - **반환 예시 (질문이 남은 경우):**
     ```json
     [
       { "question_id": "uuid-1..." },
       { "question_id": "uuid-2..." }
     ]
     ```
   - **반환 예시 (남은 질문이 없는 경우):**
     ```json
     []
     ```

4. **선택 질문 노출 기록 처리 (`optional_survey_records`)**
   - 클라이언트에서 선택 질문이 포함된 화면을 띄웠을 때, 해당 질문들이 이후 다시 나타나지 않도록 기록합니다.
   - ✅ `supabase.rpc('record_optional_survey_shown', { p_participant_id: id, p_question_ids: ['uuid-1', 'uuid-2'] })`
   - **반환 예시:** 반환값 없음 (void)

5. **내 웹 쿠폰 목록 조회 (`web_coupons`)**
   - ❌ `supabase.from('web_coupons').select('*').eq('participant_id', id)`
   - ✅ `supabase.rpc('get_my_web_coupons', { p_id: id })`
   - **반환 예시:**
     ```json
     [
       {
         "id": 1,
         "participant_id": "uuid...",
         "code": "A1B2C3D4",
         "assigned_at": "2026-08-05..."
       }
     ]
     ```
   - **주의**: 프론트엔드(게임 클라이언트)에서는 기존 가챠 쿠폰(`get_my_coupons`)과 별개로 이 함수를 함께 호출하여, 두 결과를 화면에 병합해서 보여주어야 합니다.

4. **내 게임 점수 기록 조회 (`game_score_logs`)**
   - ❌ `supabase.from('game_score_logs').select('*').eq('participant_id', id)`
   - ✅ `supabase.rpc('get_my_score_logs', { p_id: id })`
   - **반환 예시:**
     ```json
     [
       {
         "log_id": "uuid...",
         "participant_id": "uuid...",
         "best_score": 1500,
         "gookbap_score": 1500,
         "joined_time": "2026-08-05..."
       }
     ]
     ```

*(주의: 익명 유저의 최초 생성 시 `INSERT` 로직은 기존처럼 테이블을 직접 호출해도 정상 작동합니다. 단, 보안을 위해 직접적인 `UPDATE`는 전면 차단되었습니다.)*

5. **쿠폰 정보 스캔 및 사용 취소 (`issued_coupons` 관리자용)**
   - 스캐너에서 쿠폰 정보를 불러올 때: `supabase.rpc('get_coupon_info_for_scan', { p_coupon_id: id })` (만료일인 `expired_at` 등의 종합 정보 반환)
   - 쿠폰 사용 취소 (사용일시로부터 10분 이내): `supabase.rpc('undo_coupon', { p_coupon_id: id })`

6. **전체 랭킹 조회 (`ranking_view`)**
   - 랭킹 데이터는 `participants` 테이블 직접 조회가 차단되어 있으므로, 반드시 전용 뷰(View)인 `ranking_view`를 통해 조회해야 합니다.
   - `ranking_view`는 보안상 민감한 데이터를 제외하고 `participant_id`, 최고 점수 기록인 `nickname_first`, `nickname_last`(다국어 JSONB), `nickname_number`, `best_score`, `gookbap_score`, `joined_time`을 제공합니다. (사전 필터링 없이 1명의 유저가 낸 **모든 기록이 중복을 포함하여 반환**되므로 프론트엔드 구현단에서 주간/월간 랭킹 등 용도에 맞게 필터링해야 합니다.)
   - ✅ `supabase.from('ranking_view').select('*')`
   - **반환 예시:**
     ```json
     [
       {
         "participant_id": "uuid...",
         "nickname_first": { "ko": "든든한", "en": "Hearty" },
         "nickname_last": { "ko": "국밥", "en": "Gookbap" },
         "nickname_number": "0023",
         "best_score": 1953,
         "gookbap_score": 1953,
         "joined_time": "2026-08-05..."
       }
     ]
     ```

7. **방문 로그 생성 및 세션 유지 (`track_logs` - 익명 유저 접속 시)**
   - 익명 유저는 `track_logs` 테이블에 대한 직접적인 `INSERT` 권한이 없으므로, 접속 시 반드시 아래의 RPC 함수를 호출해야 합니다.
   - 이 RPC 함수는 프론트엔드에서 로컬 스토리지 필터링을 거친 후, 세션이 만료되었거나 신규일 때만 호출하는 것을 권장합니다.
   - ✅ `supabase.rpc('add_track_log', { p_participant_id: '유저의 UUID', p_track_id: '접속한 track_id (없으면 null)' })`
   - **반환값:** 유효한 현재 세션의 `log_id` (UUID)

8. **방문 로그 액션 업데이트 (`track_logs` - 익명 유저용)**
   - 익명 유저는 `track_logs` 테이블에 대한 직접적인 `UPDATE` 권한이 없습니다. 
   - 따라서 익명 유저의 액션(게임 시작, 공유하기)을 업데이트하려면 RLS를 우회하도록 `SECURITY DEFINER`로 생성된 아래의 RPC 함수를 호출해야 합니다.
   - **게임 시작/재도전 카운트 +1 증가:** ✅ `supabase.rpc('update_track_log_action', { p_participant_id: '유저의 UUID', p_action: 'game_start' })`
   - **공유하기 클릭 상태 갱신:** ✅ `supabase.rpc('update_track_log_action', { p_participant_id: '유저의 UUID', p_action: 'share_click' })`



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
    "first_nickname": {
      "ko": "든든한",
      "en": "Hearty",
      "ja": "頼もしい"
    },
    "last_nickname": {
      "ko": "국밥",
      "en": "Gookbap",
      "ja": "クッパ"
    },
    "first_id": "uuid-first",
    "last_id": "uuid-last",
    "number": "0023"
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
    "coupon_type": "{\"ko\": \"국밥 1그릇 무료 뚝딱 쿠폰\", \"en\": \"Free Gookbap\"}",
    "score_used": 1500,
    "coupon_id": "uuid-string-here",
    "web_coupon_code": "A1B2C3D4", // 웹 전용 쿠폰 당첨 시에만 반환 (없으면 null)
    "valid_from": "2026-08-05T00:00:00.000Z",
    "expired_at": "2026-08-12T23:59:59.000Z"
  }
  ```
- **Response (No Win / 꽝 - 200 OK)**:
  (해당 점수 구간의 확률 총합이 100% 미만이라 어느 쿠폰에도 당첨되지 않았을 경우)
  ```json
  {
    "success": true,
    "message": "꽝",
    "coupon_type": null,
    "score_used": 1500
  }
  ```
- **Response (Error - 400/500/Cooldown/NoScore)**:
  ```json
  {
    "error": "제한 횟수 초과 (N일/시간 이내 최대 M번 참여 가능)",
    "code": "LIMIT_EXCEEDED"
  }
  ```
- **Response (Error - Survey Required - 403 Forbidden)**:
  (가챠를 돌리기 전, 설문조사 Phase 1의 필수 항목 완료 여부를 검증합니다)
  ```json
  {
    "error": "설문조사를 먼저 완료해주세요.",
    "code": "SURVEY_REQUIRED"
  }
  ```

# Web Coupon API Guide
웹게임 클라이언트에서 유저에게 100% 확정 웹 쿠폰을 발급할 때 사용하는 API입니다.
내부적으로 `assign_web_coupon` RPC(SECURITY DEFINER)를 호출하므로, 익명 유저가 안전하게 미배정 쿠폰을 가져갈 수 있습니다.

- **설문 검증**: API 호출 시 유저가 `survey_phase = 1`인 설문(주요 설문)에 답변했는지(`survey_responses`) 검증하며, 답변 이력이 없을 경우 발급이 거부됩니다 (`survey_required: true`).
- **동시성 제어**: `FOR UPDATE SKIP LOCKED` 쿼리를 사용하여 트래픽이 몰리더라도 단 하나의 쿠폰도 중복 발급되지 않고 완벽하게 원자적(Atomic)으로 배정됩니다.

- **Endpoint**: `POST /api/web-coupons/assign`
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
    "data": {
      "success": true,
      "code": "A1B2C3D4"
    }
  }
  ```
- **Response (Survey Required - 403 Forbidden)**:
  (설문을 진행하지 않은 유저가 발급을 요청할 경우 403 상태 코드와 함께 오류 반환)
  ```json
  {
    "error": "설문조사(Phase 1)의 필수 항목을 모두 완료해야 쿠폰을 발급받을 수 있습니다.",
    "survey_required": true
  }
  ```


# KPI Data Collection & Event Tracking Guide
프론트엔드 및 게임 클라이언트에서 9대 핵심 KPI를 대시보드에 정확히 집계하기 위해, 유저 행동 단계별로 수행해야 할 DB 연동 가이드입니다.

### 1단계: 유저 접속 (방문자 수 / 공유 유입 수)
유저가 최초로 페이지에 들어오면, 익명 UUID(`participant_id`)를 발급하고 `add_track_log` RPC를 호출하여 세션 기반 접속 로그를 남깁니다.
- **DB 작업 (RPC 호출)**: `supabase.rpc('add_track_log', { p_participant_id: participant_id, p_track_id: track_id })` 호출. (직접 INSERT 금지)
- **KPI 연결**: 이를 통해 **방문자 수**가 카운트됩니다. 접속한 `track_id`가 `is_shared=true`인 트랙이라면 자동으로 **공유 유입 수**로 분류됩니다.

### 2단계: 게임 시작 및 재도전 (게임 시작률 / 재도전율)
유저가 게임을 시작할 때마다 카운터를 증가시킵니다.
- **DB 작업 (RPC 호출)**: 익명 유저는 `UPDATE` 권한이 없으므로 `supabase.rpc('update_track_log_action', { p_participant_id: participant_id, p_action: 'game_start' })`를 호출하여 현재 세션의 카운트를 1 증가시킵니다.
- **KPI 연결**: 값이 1 이상이면 **게임 시작자**, 2 이상이면 **재도전 유저**로 자동 집계됩니다.

### 3단계: 게임 완료 (게임 완주율)
게임이 끝난 후 점수를 획득하면 기록합니다.
- **DB 작업 (INSERT)**: `game_score_logs`에 점수 데이터 추가.
- **KPI 연결**: 기록이 1개라도 존재하는 유저는 **게임 완주자**로 자동 집계됩니다.

### 4단계: 공유하기 버튼 클릭 (공유 참여율)
유저가 공유하기를 누른 시점에 클릭 여부를 갱신합니다.
- **DB 작업 (RPC 호출)**: 익명 유저는 `UPDATE` 권한이 없으므로 `supabase.rpc('update_track_log_action', { p_participant_id: participant_id, p_action: 'share_click' })`를 호출하여 `share_clicked`를 `true`로 갱신합니다.
- **KPI 연결**: 이 값이 `true`가 된 유저 수를 합산하여 **공유 참여율**을 도출합니다.

### 5단계: 공유 링크 생성 (바이럴 확산 준비)
유저가 누군가에게 공유할 링크(URL)를 만들 때는 새로운 트랙을 생성하는 것이 아닙니다. 
- **프론트엔드 로직**: 현재 할당된 지점(`branch_id`)에 속한 트랙 중, 이미 데이터베이스에 설정되어 있는 **`is_shared = true`인 `track_id`를 불러와 URL 파라미터로 삽입**하여 공유 링크를 만듭니다.
- **KPI 연결**: 이렇게 만들어진 링크를 타고 들어온 새로운 유저들은 1단계 접속 처리 시 자동으로 **공유 유입 수** 통계에 묶이게 됩니다.

### 6단계: 설문 제출 (설문 완료율)
- **DB 작업 (INSERT)**: `survey_responses`에 답변 기록.
- **KPI 연결**: 제출된 응답 중, `survey_questions` 테이블의 **`survey_phase = 1`인 문항(주요 설문)에 답변한 이력이 있는 유저**만을 추려내어 **설문 완료율**로 자동 집계합니다.

### 7단계: 쿠폰 발급 및 사용 (쿠폰 사용률)
- **DB 작업 (발급 시 INSERT)**: 쿠폰 획득 시 `issued_coupons`에 기록 (**총 발급 수** 집계).
- **DB 작업 (사용 시 UPDATE)**: 오프라인 매장 등에서 사용 처리 시 `issued_coupons`의 `is_used`를 `모두 허용`로 갱신.
- **KPI 연결**: `is_used = true`인 쿠폰 수를 집계하여 발급 수 대비 **쿠폰 사용률**을 자동 도출합니다.

# QR Scanner Implementation Guidelines
`/coupon` 페이지의 QR 스캐너(`html5-qrcode` 기반) 구현 시 다음의 엄격한 규칙들을 반드시 준수해야 합니다.

1. **Scanner Paused 화면 차단 (핵심):**
   - `html5-qrcode` 라이브러리는 탭 이동이나 브라우저 포커스 변경 시 모바일 환경에서 종종 카메라를 강제로 일시정지하고 검은색 "Scanner paused" 오버레이를 덮어씌우는 고질적인 문제가 있습니다.
   - 이를 원천 차단하기 위해 생성된 `Html5Qrcode` 인스턴스의 `pause` 메서드를 강제로 오버라이딩(`scanner.pause = () => {}`)하여 무력화해야 합니다.
   - 또한, 만약의 경우를 대비해 전역 CSS(`globals.css`)에서 `div[style*="rgba(9, 9, 9, 0.46)"]` 선택자를 통해 오버레이 자체를 `display: none !important`로 가려버려야 합니다.

2. **실시간 설정 프리뷰 (Real-time Preview):**
   - 설정 모달창(`isSettingsOpen`)이 열려 있을 때 카메라 렌더링을 완전히 멈추지(`stopScanner`) 않습니다. 반투명한 설정창 뒤로 스캐너를 계속 가동시켜, 사용자가 디스플레이 옵션(폭 맞춤 등)을 바꿀 때 즉각적인 화면 변화(피드백)를 볼 수 있도록 해야 합니다.
   - **주의:** 스캐너가 뒤에서 계속 가동되므로, 모달창이 켜져 있을 때 발생하는 큐알코드 인식 이벤트는 반드시 무시(`if (isSettingsOpen) return`) 처리해야 합니다.

3. **비디오 강제 변형 (Force Distortion for 'Fill' Mode):**
   - "전체 늘리기(Fill)" 옵션을 선택할 경우, 이미지가 찌그러지더라도 빈 공간이나 픽셀 잘림 없이 화면(컨테이너)을 가득 채워야 합니다.
   - 그러나 iOS WebKit 등 일부 모바일 환경에서는 WebRTC `<video>` 요소에 `object-fit: fill` CSS를 주입해도 OS 단에서 비율 유지를 강제하여 명령을 무시합니다.
   - 따라서 'Fill' 모드일 경우에는 반드시 JavaScript `setInterval` 루프를 이용해 비디오 원본의 가로/세로 길이(`videoWidth`, `videoHeight`) 대비 뷰포트 컨테이너의 가로/세로 길이를 계산한 후, CSS `transform: scale(X, Y)`를 주입하여 렌더링을 강제로 잡아 늘려야 합니다.

# Session Management (세션 관리 정책)
유저의 단순 페이지 새로고침 등으로 인해 `track_logs`의 통계(예: 방문자 수, 게임 시작 수)가 비정상적으로 뻥튀기되는 현상을 방지하기 위해 세션 기반 추적 시스템을 사용합니다.

## 세션의 정의 및 타임아웃
* **세션 테이블**: `participant_sessions` 테이블이 각 참가자(`participant_id`)의 현재 활성화된 세션(`current_log_id`)과 마지막 활동 시간(`last_requested_at`)을 내부적으로 관리합니다. 이 테이블은 프론트엔드에 노출되지 않으며 RLS가 적용되지 않은 순수 내부 상태 저장소입니다.
* **타임아웃(Timeout)**: 마지막 요청(`last_requested_at`)으로부터 **30분** 동안 아무런 액션이 없으면 해당 세션은 만료된 것으로 간주됩니다.

## 세션의 생성 및 유지 (`add_track_log` RPC)
* 프론트엔드에서 사용자가 접속했을 때 직접 `track_logs`에 INSERT하는 것은 금지되어 있습니다. (Anon INSERT 권한 삭제됨)
* 접속 시 반드시 `add_track_log(participant_id, track_id)` RPC를 호출해야 합니다.
  * **세션 유지**: 기존 세션이 30분 이내에 존재할 경우, 새로운 `track_logs` 항목을 생성하지 않고 기존의 `log_id`를 반환하며 `last_requested_at` 시간만 갱신합니다. (이때 `track_id`가 변경되더라도 무시합니다.)
  * **세션 생성**: 세션이 만료되었거나 신규 접속인 경우에만 새로운 `track_logs` 한 줄을 생성하고, 세션 정보를 갱신합니다.

## 세션 활동 기록 (`update_track_log_action` RPC)
* 유저가 게임 시작('game_start') 또는 공유하기('share_click') 액션을 취했을 때 호출합니다.
* 기존에는 `log_id`를 직접 넘겼으나, 이제는 `update_track_log_action(participant_id, action_string)` 형태로 `participant_id`만 전달합니다.
* 내부 로직에서 자동으로 현재 활성 세션의 `log_id`를 찾아 액션을 업데이트하며, 만약 활성 세션이 없거나 만료된 경우에는 **강제로 새로운 세션(새 log_id)을 생성한 뒤** 해당 액션을 기록합니다.

## 프론트엔드 연동 가이드 (브라우저 세션 최적화)
서버에 이미 강력한 2중 방어(30분 내 중복 생성 방지) 로직이 구현되어 있지만, 프론트엔드에서 불필요한 RPC 네트워크 요청(새로고침 연타 시 등)을 줄이기 위해 브라우저 단에서 1차 필터링하는 것이 권장됩니다.

### 1. 접속(페이지 로드) 시 세션 초기화 및 만료 탐지
페이지에 접속했을 때, 로컬 스토리지(`localStorage`)를 확인하여 세션 만료 여부를 자체적으로 탐지한 뒤 RPC를 호출합니다.

```javascript
const lastActive = localStorage.getItem('track_last_active');
const now = new Date().getTime();

// 안전한 세션 유지를 위해 서버 타임아웃(30분)보다 짧은 20분(1200000ms)을 기준으로 잡는 것을 권장합니다.
// 20분이 지났거나 기록이 아예 없는 경우(세션 만료 임박 또는 신규)에만 RPC 호출
if (!lastActive || (now - parseInt(lastActive)) > 1200000) {
    // 세션이 만료되었거나 처음이므로 새 세션 생성 (또는 기존 세션 갱신) 요청
    await supabase.rpc('add_track_log', { 
        p_participant_id: id, 
        p_track_id: trackId 
    });
}

// 접속/새로고침 했으므로 마지막 활동 시간을 현재로 갱신 (세션 연장)
localStorage.setItem('track_last_active', now.toString());
```

### 2. 특정 행동(액션) 발생 시 세션 연장
게임 시작('game_start') 등의 특정 행동이 발생할 때마다, 이 역시 세션을 활동을 의미하므로 로컬 스토리지 시간을 함께 갱신해줍니다. 

```javascript
const now = new Date().getTime();

// 액션을 서버로 보냄 (DB 단에서 알아서 현재 세션을 찾아 갱신하거나, 만료되었으면 새 세션을 자동 생성해줌)
await supabase.rpc('update_track_log_action', { 
    p_participant_id: id, 
    p_action: 'game_start' 
});

// 행동이 발생했으므로 세션 활동 시간 갱신 (세션 연장)
localStorage.setItem('track_last_active', now.toString());
```

