# 로컬 테스트 환경 셋업

게임을 **실제로 플레이해서** 눈으로 확인해야 할 때(UI 변경, 애셋 배치, 오버레이 등)
필요한 절차다. 단위 테스트만 돌릴 거면 `npm test`로 충분하고 이 문서는 필요 없다.

최초 작성: 2026-07-31 (힌트 클립보드 작업 중, 여기 적힌 함정을 전부 한 번씩 밟고 나서)

## 왜 서버가 두 개인가

`gookbapgame`은 좌/우 장면 이미지를 스스로 합성하지 않는다. `fetchGameData`가
`GENERATE_UNIFIED_API_URL`로 POST해서 합성된 이미지 URL을 받아온다. 그 엔드포인트는
**`gookbapanalyze`의 `/api/generate-unified`** 다.

즉 게임 화면까지 가려면 세 가지가 동시에 떠 있어야 한다:

| 구성요소 | 역할 |
|---|---|
| 로컬 Supabase 스택 | DB + Storage (`supabase_*_gookbapgame` 컨테이너) |
| `gookbapanalyze` | 이미지 합성 API 제공 |
| `gookbapgame` | 게임 본체 |

이 중 하나라도 빠지면 시작 화면에서 **"N단계 게임 데이터를 불러올 수 없습니다"** 가 뜬다.
이 메시지는 원인을 구분해주지 않으므로, 반드시 **양쪽 서버의 콘솔 로그**를 봐야 한다.

## 절차

### 1. Supabase 로컬 스택

```bash
docker ps --format '{{.Names}}' | grep supabase_db_gookbapgame
```

안 떠 있으면 `supabase start`(gookbapgame 디렉터리에서). 떠 있으면 그대로 쓴다.

### 2. 스키마와 시드

```bash
docker exec -i supabase_db_gookbapgame psql -U postgres < docs/test-db/schema.sql
docker exec -i supabase_db_gookbapgame psql -U postgres < docs/test-db/seed.sql
```

둘 다 멱등하다. 이미 만들어진 스택에 다시 돌려도 되고, 예전 버전으로 만들어진 스택을
현재 형태로 고치는 용도로도 쓴다.

`docs/test-db/`에 두는 이유가 있다. 원래 이 스크립트들은 `scripts/`에 있었는데
그 디렉터리는 통째로 gitignore 대상(`.gitignore:48`)이라 클린 체크아웃하면 사라진다.
그렇다고 `supabase/migrations/`에 넣으면 `supabase db push`로 **프로덕션에 실수로
적용될** 수 있다 — 이 스크립트는 `grant all ... to service_role` 같은 걸 포함하므로
프로덕션에 닿으면 안 된다. 그래서 추적은 되지만 어떤 도구도 자동 적용하지 않는
위치에 둔다. 실행은 항상 위 명령으로 수동으로 한다.

`docs/test-db/accounts.sql`은 `gookbapanalyze` 관리자 계정용으로, 게임만 볼 거면 필요 없다.

`supabase/migrations/`의 `participants` / `track_logs` / `tracks` 는 별도로 적용해야 한다.

### 3. `gookbapanalyze/.env.local`

이 파일은 gitignore 대상이라 리포에 없다. 세 값이 필요하다:

```
NEXT_PUBLIC_SUPABASE_URL=<gookbapgame/.env.local의 SUPABASE_URL과 동일>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<gookbapgame/.env.local의 SUPABASE_ANON_KEY와 동일>
SUPABASE_SERVICE_ROLE_KEY=<아래 참조>
```

`/api/generate-unified`는 RLS 우회와 Storage 업로드 때문에 **service role 키**를 요구한다.
로컬 스택의 키는 컨테이너 환경변수에서 꺼낼 수 있다(로컬 전용 더미 키다):

```bash
docker inspect supabase_storage_gookbapgame \
  --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^SERVICE_KEY='
```

### 4. 서버 기동

```bash
# gookbapanalyze
cd gookbapanalyze && npm run dev -- --port 3002

# gookbapgame
cd gookbapgame && npm run dev
```

`gookbapgame/.env.local`에 다음을 추가한다:

```
GENERATE_UNIFIED_API_URL=http://localhost:3002/api/generate-unified
```

Next.js dev는 `.env.local` 변경을 감지해 `Reload env: .env.local`을 찍고 자동 반영한다.
서버를 죽였다 살릴 필요는 없다.

`NICKNAME_ASSIGN_API_URL`은 없어도 된다. 미설정이면 로컬 폴백 닉네임을 쓰고
`[assignNicknameOrFallback] ... 로컬 폴백 사용` 로그만 남는다 — 정상 동작이다.

### 5. 확인

게임을 시작하기 전에 합성 API부터 찔러본다:

```bash
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"baseImageId":1,"imageSlots":{"1":"1"}}' \
  http://localhost:3002/api/generate-unified
```

`{"success":true,"url":"...webp"}` 가 나와야 한다.

## 증상별 원인

| 증상 | 원인 |
|---|---|
| `Missing GENERATE_UNIFIED_API_URL environment variable.` | 4번 누락 |
| `PGRST205 Could not find the table 'public.unified_images'` | 스키마가 구버전. 2번 재실행 |
| `42501 permission denied for table unified_images` | `service_role` GRANT 누락. 2번 재실행 |
| `Failed to upload generated image` | `game_assets` 버킷 없음. 2번 재실행 |
| `Base image not found` (합성 API) | `service_role`이 `base_images`를 못 읽음. 2번 재실행 |
| 다국어 문자열이 전부 `—` 로 표시됨 | `name`/`title`이 아직 text. 2번 재실행 |
| 포트가 3001로 밀림 | 3000을 다른 게 쓰는 중. 로그의 실제 포트를 볼 것 |

## 프로덕션과의 차이 — 반드시 알아둘 것

**이란토는 프로덕션 Supabase에 접근 권한이 없다.** 로컬 스택은 ER 다이어그램과 산문
설명으로 재구성한 것이라, 프로덕션에서 실제로 어떤지 확인된 바 없는 부분이 있다.

특히 **RLS 정책**은 로컬에서 통과했다고 프로덕션에서도 통과한다는 보장이 없다.
`AGENTS.md`가 `participants`/`track_logs`에 대해 같은 경고를 하고 있고,
`part_categories`도 마찬가지다 — 힌트 기능이 게임 최초로 이 테이블을 읽으므로,
배포 전에 anon SELECT 권한을 구자건에게 확인해야 한다.
(`fetchGameData`는 이 조회가 조용히 0행을 반환하는 경우도 경고 로그를 남긴다.)

**로컬 스택에 `db push` 하지 말 것.**

## Flatpak 샌드박스 주의

VS Code를 Flatpak으로 쓰는 환경에서는 샌드박스 안에 `node`/`npm`/`npx`/`docker`가
없다. 전부 `host-spawn --no-pty`를 앞에 붙여야 호스트에서 실행된다:

```bash
host-spawn --no-pty npm run dev
host-spawn --no-pty docker exec supabase_db_gookbapgame psql -U postgres -c '...'
```

호스트 셸에서 직접 작업할 때는 필요 없다.
