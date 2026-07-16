<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

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
- **`branches` (지점 마스터)**: 지점 정의. 지점 구분을 `branch_id`(UUID)를 기반으로 구별하며, `branch_name`이 지점명 (다국어 지원 있음)입니다. (Admin: ALL, Everyone: SELECT)
- **`tracks` (접속 링크 마스터)**: 트랙(track) 쿼리문을 정의하는 부분. 지점 ID(`branch_id`)와 공유 여부(`is_shared`)로 구분됩니다. (Admin: ALL, Everyone: SELECT)
- **`track_logs` (접속 로그)**: 트랙 로그를 기반으로 유저 접속 기록을 표시합니다. 이 데이터를 기반으로 유저가 어느 지점에서 왔는지 조회 가능합니다. (Admin: 전체 SELECT, User: 본인 지점 SELECT, Anon: INSERT)
- **`participants` (게임 참여자)**: 유저를 정의하는 키. 사용자가 이 데이터를 불러오기 위해서는 반드시 RPC 함수 사용이 필수입니다. 랭킹 조회를 위해서는 본 테이블이 아닌 `ranking_view` 뷰(View)를 이용해야 합니다. (Admin: ALL, Anon: INSERT, UPDATE. *조회는 RPC 함수 필수*)
- **`coupon_effects` (쿠폰 혜택)**: 쿠폰 정의. 쿠폰 설명은 텍스트로만 구성됩니다. (Admin: ALL, Everyone: SELECT)
- **`issued_coupons` (발급된 쿠폰)**: 유저가 획득한 쿠폰. `participant_id`와 연동되며, 본인의 쿠폰 조회가 가능합니다. 데이터를 불러오기 위해선 반드시 RPC 함수 사용이 필수입니다. (Admin: ALL, User: UPDATE/SELECT, Anon: INSERT. *조회는 RPC 함수 필수*)
- **`survey_questions` (설문 문항)**: 질문 정의. 관리자(Admin)는 전부 수정 가능하며, 지점(User)은 본인 지점 한정으로 수정 가능합니다. `survey_phase`(int)로 내용이 정의됩니다 (0: 힌트 질문, 1: 쿠폰 받기 전 질문, 2: 지점 특화 질문). (Admin: ALL, User: 본인 지점 ALL, Everyone: SELECT)
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

*(주의: 익명 유저의 점수를 갱신하는 `UPDATE`나, 최초 생성 시의 `INSERT` 로직은 기존처럼 테이블을 직접 호출해도 정상 작동합니다.)*

3. **전체 랭킹 조회 (`ranking_view`)**
   - 랭킹 데이터는 `participants` 테이블 직접 조회가 차단되어 있으므로, 반드시 전용 뷰(View)인 `ranking_view`를 통해 조회해야 합니다.
   - `ranking_view`는 보안상 민감한 데이터를 제외하고 오직 `nickname`, `best_score`, `gookbap_score`만 제공하며, 자동으로 최고 점수순(내림차순)으로 정렬되어 반환됩니다.
   - ✅ `supabase.from('ranking_view').select('*')`
