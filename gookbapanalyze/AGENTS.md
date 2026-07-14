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
