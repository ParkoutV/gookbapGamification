# 참여자 식별(Player Identity) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `gookbapgame`의 24×24 하드코딩 로컬 닉네임을 httpOnly 쿠키+SHA-256 해시 기반 participant_id와 `gookbapanalyze`의 `/api/nickname/assign` API로 대체하고, 최초 접속을 `track_logs`에 기록한다.

**Architecture:** 서버 액션(`app/actions.ts`)이 쿠키 토큰 발급/해시 → `participants`/`track_logs` upsert/insert → 닉네임 API 호출까지 한 번에 처리한다. 클라이언트(`useGameProgress`)는 마운트 시 이 서버 액션을 한 번 호출해 결과를 React state로만 들고 있고, 로컬에 아무것도 영속화하지 않는다. 닉네임 API 실패 시 기존 24×24 로컬 생성기로 폴백하며, 게임 진행 자체는 절대 막지 않는다.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Supabase (`@supabase/supabase-js`), Node `crypto`(`node:crypto`), `node --test`(node --experimental-strip-types) 테스트 러너.

## Global Constraints

- 설계 문서: `docs/superpowers/specs/2026-07-30-player-identity-design.md` — 이 계획은 그 문서의 "범위 밖" 항목(점수 제출, 공유/설문 트래킹, 가챠 연동)을 다루지 않는다.
- 스키마 출처: 이란토가 공유한 실제 Supabase ER 다이어그램(2026-07-30) — `participants.nickname`은 varchar 단일 컬럼(FK 아님), `tracks.track_id`/`track_logs.track_id`는 varchar(uuid 아님).
- 쿠키는 반드시 httpOnly로 설정한다 (부정 참여 방지 방향, `~/.agents/memory/project_gookbapgame_anticheat_direction.md` 참고 — 클라이언트 JS가 토큰을 직접 조작하지 못해야 함).
- 어떤 실패(participants/track_logs/닉네임 API)도 게임 플레이를 막아서는 안 된다 — 항상 로컬 폴백으로 진행 가능해야 한다.
- 새 테스트 파일은 `package.json`의 `test` 스크립트에 파일 경로를 직접 추가해야 실행된다 (glob 아님, 파일별 명시 나열 방식).

---

### Task 1: 로컬 Supabase 스키마 동기화

**Files:**
- Create: `supabase/migrations/20260730000000_player_identity_tables.sql`

**Interfaces:**
- Produces: 로컬 Supabase(`127.0.0.1:54321`/DB `127.0.0.1:54322`)에 `public.tracks`, `public.participants`, `public.track_logs` 테이블 + `anon` 권한/RLS 정책. 이후 태스크들이 이 테이블에 실제로 insert/upsert할 수 있어야 함.

- [ ] **Step 1: 마이그레이션 SQL 작성**

```sql
-- supabase/migrations/20260730000000_player_identity_tables.sql
create extension if not exists pgcrypto;

create table if not exists public.tracks (
  track_id varchar primary key,
  branch_id uuid,
  is_shared boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.participants (
  participant_id uuid primary key,
  nickname varchar,
  roulette_joined boolean,
  last_participated_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.track_logs (
  log_id uuid primary key default gen_random_uuid(),
  participant_id uuid references public.participants(participant_id),
  track_id varchar references public.tracks(track_id),
  access_time timestamptz not null default now(),
  game_start_count int4 not null default 0,
  share_clicked boolean not null default false
);

insert into public.tracks (track_id, is_shared)
values ('local-dev-track', false)
on conflict (track_id) do nothing;

alter table public.tracks enable row level security;
alter table public.participants enable row level security;
alter table public.track_logs enable row level security;

grant select on public.tracks to anon;
grant insert, update on public.participants to anon;
grant insert on public.track_logs to anon;

create policy "anon select tracks" on public.tracks
  for select to anon using (true);

create policy "anon insert participants" on public.participants
  for insert to anon with check (true);

create policy "anon update participants" on public.participants
  for update to anon using (true) with check (true);

create policy "anon insert track_logs" on public.track_logs
  for insert to anon with check (true);
```

- [ ] **Step 2: 로컬 Supabase에 적용**

`supabase` CLI가 PATH에 있으면:

```bash
supabase db reset
```

CLI가 없으면(이 세션 환경처럼) 로컬 스택의 기본 자격증명으로 직접 psql 적용 — 로컬 전용 기본값(`postgres`/`postgres`)이라 안전함:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/migrations/20260730000000_player_identity_tables.sql
```

- [ ] **Step 3: 스키마 반영 확인**

```bash
ANON=$(grep SUPABASE_ANON_KEY .env.local | cut -d= -f2)
curl -s "http://127.0.0.1:54321/rest/v1/" -H "apikey: $ANON" -H "Authorization: Bearer $ANON" | python3 -c "import json,sys; d=json.load(sys.stdin); print(sorted(d['definitions'].keys()))"
```

Expected: 출력에 `'participants'`, `'track_logs'`, `'tracks'`가 포함됨 (기존 `base_images`/`image_slots`/`part_categories`/`parts`에 추가로).

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/20260730000000_player_identity_tables.sql
git commit -m "chore(supabase): 로컬 스키마에 tracks/participants/track_logs 추가"
```

---

### Task 2: participantToken — 쿠키 토큰 발급 + 해시

**Files:**
- Create: `app/lib/participantToken.ts`
- Test: `app/lib/participantToken.test.ts`

**Interfaces:**
- Produces: `hashToken(token: string): string` (순수함수, SHA-256 hex). `getOrIssueToken(): Promise<string>` (Next `cookies()` 기반, httpOnly 쿠키 발급/재사용).
- Consumes: Task 5(`actions.ts`)에서 두 함수 모두 사용.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// app/lib/participantToken.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { hashToken } from "./participantToken.ts";

test("hashToken은 같은 입력에 항상 같은 SHA-256 hex를 반환한다", () => {
  const result = hashToken("example-token");
  // echo -n "example-token" | sha256sum
  assert.equal(result, "44d34d1731957a997017171b025be05dc23ba57f34ba4085aa5d3ff1b30e4a9f");
});

test("hashToken은 다른 입력에 다른 값을 반환한다", () => {
  assert.notEqual(hashToken("token-a"), hashToken("token-b"));
});

test("hashToken 결과는 64자 hex 문자열이다", () => {
  const result = hashToken("아무 문자열");
  assert.equal(result.length, 64);
  assert.match(result, /^[0-9a-f]{64}$/);
});
```

- [ ] **Step 2: SHA-256 정답값 직접 계산 후 테스트 값 교정**

`hashToken`을 구현하기 전에, Step 1의 첫 테스트에 쓴 해시값이 실제로 맞는지 먼저 계산해서 테스트 코드를 정확한 값으로 고쳐놓는다(placeholder 방지):

```bash
echo -n "example-token" | sha256sum
```

출력된 hex 값을 Step 1 테스트의 `assert.equal` 두 번째 인자로 그대로 교체한다.

- [ ] **Step 3: 테스트 실행해서 실패 확인**

```bash
node --experimental-strip-types --test app/lib/participantToken.test.ts
```

Expected: FAIL — `participantToken.ts` 파일이 없어 모듈을 찾지 못함.

- [ ] **Step 4: 구현**

```ts
// app/lib/participantToken.ts
import { cookies } from "next/headers";
import { randomUUID, createHash } from "node:crypto";

const TOKEN_COOKIE_NAME = "gookbapgame_token";
const TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 * 2; // 2년

export async function getOrIssueToken(): Promise<string> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(TOKEN_COOKIE_NAME)?.value;
  if (existing) return existing;

  const issued = randomUUID();
  cookieStore.set(TOKEN_COOKIE_NAME, issued, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TOKEN_MAX_AGE_SECONDS,
  });
  return issued;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
```

- [ ] **Step 5: 테스트 실행해서 통과 확인**

```bash
node --experimental-strip-types --test app/lib/participantToken.test.ts
```

Expected: PASS (3개 테스트 모두). `getOrIssueToken`은 `next/headers`에 의존해 이 테스트 파일에서 직접 검증하지 않는다 — Task 8의 브라우저 검증에서 확인.

- [ ] **Step 6: package.json test 스크립트에 추가**

`package.json`의 `test` 스크립트 문자열에 `app/lib/participantToken.test.ts`를 추가한다(다른 파일들과 같은 방식으로 공백 구분 나열).

- [ ] **Step 7: 커밋**

```bash
git add app/lib/participantToken.ts app/lib/participantToken.test.ts package.json
git commit -m "feat(gookbapgame): httpOnly 쿠키 토큰 발급 + SHA-256 해시 유틸 추가"
```

---

### Task 3: nicknameApi — 닉네임 발급 API 호출 래퍼

**Files:**
- Create: `app/lib/nicknameApi.ts`
- Test: `app/lib/nicknameApi.test.ts`

**Interfaces:**
- Produces: `requestNicknameAssign(apiUrl: string, participantId: string): Promise<{ok:true, nickname:string} | {ok:false, error:string}>`
- Consumes: Task 5(`actions.ts`)에서 사용. `app/lib/generateUnified.ts`의 fetch 래퍼 패턴과 동일한 구조를 따른다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// app/lib/nicknameApi.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { requestNicknameAssign } from "./nicknameApi.ts";

const API_URL = "https://analyze.example.com/api/nickname/assign";

test("requestNicknameAssign: 성공 응답이면 ok:true와 nickname을 반환한다", async () => {
  const originalFetch = globalThis.fetch;
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    capturedInit = init;
    return new Response(JSON.stringify({ success: true, nickname: "든든한 국밥" }), { status: 200 });
  }) as typeof fetch;

  try {
    const result = await requestNicknameAssign(API_URL, "participant-1");
    assert.deepEqual(result, { ok: true, nickname: "든든한 국밥" });
    assert.equal(capturedInit?.method, "POST");
    assert.equal((capturedInit?.headers as Record<string, string>)["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(capturedInit?.body as string), { participant_id: "participant-1" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requestNicknameAssign: API가 {error} JSON을 반환하면 그 메시지를 그대로 담는다", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: "Missing participant_id" }), { status: 400 })) as typeof fetch;

  try {
    const result = await requestNicknameAssign(API_URL, "");
    assert.deepEqual(result, { ok: false, error: "Missing participant_id" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requestNicknameAssign: fetch 자체가 실패하면(네트워크 오류) 에러 메시지를 담는다", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("network unreachable");
  }) as typeof fetch;

  try {
    const result = await requestNicknameAssign(API_URL, "participant-1");
    assert.deepEqual(result, { ok: false, error: "network unreachable" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requestNicknameAssign: 200이지만 success/nickname이 없는 이상 응답이면 상태코드를 담은 에러를 반환한다", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({}), { status: 200 })) as typeof fetch;

  try {
    const result = await requestNicknameAssign(API_URL, "participant-1");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /200/);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

```bash
node --experimental-strip-types --test app/lib/nicknameApi.test.ts
```

Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

```ts
// app/lib/nicknameApi.ts
export type NicknameAssignResult = { ok: true; nickname: string } | { ok: false; error: string };

export async function requestNicknameAssign(
  apiUrl: string,
  participantId: string
): Promise<NicknameAssignResult> {
  let res: Response;
  try {
    res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participant_id: participantId }),
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unknown fetch error" };
  }

  let body: any;
  try {
    body = await res.json();
  } catch {
    return { ok: false, error: `Invalid JSON response (status ${res.status})` };
  }

  if (!res.ok || body?.success !== true || typeof body?.nickname !== "string") {
    const message = typeof body?.error === "string" ? body.error : `Unexpected response (status ${res.status})`;
    return { ok: false, error: message };
  }

  return { ok: true, nickname: body.nickname };
}
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

```bash
node --experimental-strip-types --test app/lib/nicknameApi.test.ts
```

Expected: PASS (4개 테스트 모두).

- [ ] **Step 5: package.json test 스크립트에 추가**

`app/lib/nicknameApi.test.ts`를 `test` 스크립트에 추가.

- [ ] **Step 6: 커밋**

```bash
git add app/lib/nicknameApi.ts app/lib/nicknameApi.test.ts package.json
git commit -m "feat(gookbapgame): 닉네임 발급 API 호출 래퍼 추가"
```

---

### Task 4: nickname.ts 정리 — localStorage 함수 제거

**Files:**
- Modify: `app/lib/nickname.ts`
- Modify: `app/lib/nickname.test.ts`

**Interfaces:**
- Produces: `generateNickname(): string` (기존과 동일, 유일하게 남는 export). `loadOrCreateNickname`/`regenerateNickname`은 제거되어 더 이상 존재하지 않음 — Task 6에서 이 두 함수의 import를 제거해야 함.

- [ ] **Step 1: `nickname.ts`에서 localStorage 관련 코드 제거**

```ts
// app/lib/nickname.ts (전체 교체)
// GDD 6.7: 형용사 100 + 명사 100 조합이 최종 목표이나, 이번 스펙은 구조 검증이
// 목적이므로 24개씩의 placeholder 목록으로 시작한다. 카피는 추후 확장.
const ADJECTIVES = [
  "든든한", "행복한", "푸짐한", "따뜻한", "시원한", "쫄깃한", "얼큰한", "담백한",
  "진한", "깊은", "정겨운", "구수한", "훈훈한", "넉넉한", "뜨끈한", "살뜰한",
  "야무진", "알찬", "정성스런", "소담한", "활기찬", "명랑한", "씩씩한", "포근한",
];

const NOUNS = [
  "솥밥", "숟가락", "뚝배기", "육수", "국밥", "김치", "부추", "수육",
  "젓가락", "뼈다귀", "순대", "깍두기", "국물", "밥공기", "장인", "한그릇",
  "뚝심", "손맛", "불맛", "국밥러", "미식가", "탐험가", "애호가", "단골",
];

export function generateNickname(): string {
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adjective} ${noun}`;
}
```

- [ ] **Step 2: `nickname.test.ts`에서 제거된 함수의 테스트 삭제**

```ts
// app/lib/nickname.test.ts (전체 교체)
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateNickname } from "./nickname.ts";

test("generateNickname은 '형용사 명사' 형태의 문자열을 반환한다", () => {
  const nickname = generateNickname();
  const parts = nickname.split(" ");
  assert.equal(parts.length, 2);
  assert.ok(parts[0].length > 0);
  assert.ok(parts[1].length > 0);
});
```

- [ ] **Step 3: 테스트 실행해서 통과 확인**

```bash
node --experimental-strip-types --test app/lib/nickname.test.ts
```

Expected: PASS (1개 테스트).

- [ ] **Step 4: 커밋**

```bash
git add app/lib/nickname.ts app/lib/nickname.test.ts
git commit -m "refactor(gookbapgame): nickname.ts에서 localStorage 기반 함수 제거"
```

---

### Task 5: actions.ts — ensureParticipant / reassignNickname 서버 액션

**Files:**
- Modify: `app/actions.ts`

**Interfaces:**
- Consumes: Task 2의 `getOrIssueToken`/`hashToken`, Task 3의 `requestNicknameAssign`, Task 4의 `generateNickname`, `app/lib/db.ts`의 `supabase` 클라이언트(기존).
- Produces: `ensureParticipant(trackId: string | null): Promise<ParticipantResult>`, `reassignNickname(): Promise<ParticipantResult>`. `ParticipantResult = { nickname: string; nicknameSynced: boolean }`. Task 6(`useGameProgress.ts`)이 이 두 함수를 직접 호출한다.

이 태스크는 Supabase(로컬 docker)와 실제로 통신하는 서버 액션이라 단위테스트 대상이 아니다(기존 `fetchGameData`와 동일한 컨벤션) — Task 8에서 브라우저로 검증한다.

- [ ] **Step 1: `app/actions.ts` 상단에 import 추가**

`app/actions.ts` 최상단 기존 import들 아래에 추가:

```ts
import { getOrIssueToken, hashToken } from "./lib/participantToken";
import { requestNicknameAssign } from "./lib/nicknameApi";
import { generateNickname } from "./lib/nickname";
```

- [ ] **Step 2: 참여자 식별 관련 함수를 파일 하단에 추가**

`app/actions.ts` 파일 끝(`fetchGameData` 함수 뒤)에 추가:

```ts
export type ParticipantResult = {
  nickname: string;
  nicknameSynced: boolean;
};

async function resolveParticipantId(): Promise<string> {
  const token = await getOrIssueToken();
  return hashToken(token);
}

async function assignNicknameOrFallback(participantId: string): Promise<ParticipantResult> {
  const apiUrl = process.env.NICKNAME_ASSIGN_API_URL;
  if (!apiUrl) {
    console.error("[assignNicknameOrFallback] NICKNAME_ASSIGN_API_URL 미설정, 로컬 폴백 사용");
    return { nickname: generateNickname(), nicknameSynced: false };
  }

  const result = await requestNicknameAssign(apiUrl, participantId);
  if (!result.ok) {
    console.error("[assignNicknameOrFallback] 닉네임 API 실패:", result.error);
    return { nickname: generateNickname(), nicknameSynced: false };
  }
  return { nickname: result.nickname, nicknameSynced: true };
}

export async function ensureParticipant(trackId: string | null): Promise<ParticipantResult> {
  const participantId = await resolveParticipantId();

  const { error: upsertError } = await supabase
    .from("participants")
    .upsert({ participant_id: participantId }, { onConflict: "participant_id", ignoreDuplicates: true });

  if (upsertError) {
    console.error("[ensureParticipant] participants upsert 실패:", upsertError);
    return { nickname: generateNickname(), nicknameSynced: false };
  }

  if (trackId) {
    const { error: trackLogError } = await supabase
      .from("track_logs")
      .insert([{ participant_id: participantId, track_id: trackId }]);
    if (trackLogError) {
      console.error("[ensureParticipant] track_logs insert 실패(무시, best-effort):", trackLogError);
    }
  }

  return assignNicknameOrFallback(participantId);
}

export async function reassignNickname(): Promise<ParticipantResult> {
  const participantId = await resolveParticipantId();
  return assignNicknameOrFallback(participantId);
}
```

- [ ] **Step 3: 타입체크**

```bash
npx tsc --noEmit
```

Expected: 새로 추가한 코드에서 에러 없음 (기존에 있던 무관한 에러가 있다면 그건 이번 변경과 무관하므로 무시).

- [ ] **Step 4: 커밋**

```bash
git add app/actions.ts
git commit -m "feat(gookbapgame): ensureParticipant/reassignNickname 서버 액션 추가"
```

---

### Task 6: useGameProgress — 닉네임 상태를 서버 액션 기반으로 전환

**Files:**
- Modify: `app/hooks/useGameProgress.ts`

**Interfaces:**
- Consumes: Task 5의 `ensureParticipant`, `reassignNickname` (from `../actions`).
- Produces: `useGameProgress(trackId: string | null)` — 기존엔 인자가 없었으나 이제 `trackId`를 받는다. 반환 객체에 `isRegenerating: boolean` 추가(기존 `nickname`/`regenerateNickname`은 이름 유지, 동작만 async로 변경). Task 7(`page.tsx`)이 `trackId`를 넘기고, `isRegenerating`을 `StartScreen`에 전달한다.

- [ ] **Step 1: import 교체**

`app/hooks/useGameProgress.ts`에서 기존:

```ts
import {
  loadOrCreateNickname,
  regenerateNickname as regenerateStoredNickname,
} from "../lib/nickname";
```

를 다음으로 교체:

```ts
import { ensureParticipant, reassignNickname as reassignNicknameAction } from "../actions";
```

- [ ] **Step 2: 함수 시그니처와 상태 변경**

`export function useGameProgress() {`를 `export function useGameProgress(trackId: string | null) {`로 변경.

`const [nickname, setNickname] = useState<string>("");` 바로 아래에 추가:

```ts
  const [isRegenerating, setIsRegenerating] = useState(false);
  const nicknameSyncedRef = useRef(true);
```

(`useRef`를 이미 import한 `useState`/`useCallback`과 같은 `"react"` import 줄에 추가할 것: `import { useCallback, useEffect, useRef, useState } from "react";`)

- [ ] **Step 3: 마운트 이펙트 교체**

기존:

```ts
  useEffect(() => {
    setNickname(loadOrCreateNickname());
  }, []);
```

를 다음으로 교체:

```ts
  useEffect(() => {
    let cancelled = false;
    void ensureParticipant(trackId).then((result) => {
      if (cancelled) return;
      setNickname(result.nickname);
      nicknameSyncedRef.current = result.nicknameSynced;
    });
    return () => {
      cancelled = true;
    };
  }, [trackId]);
```

- [ ] **Step 4: `regenerateNickname`을 async로 교체**

기존:

```ts
  const regenerateNickname = useCallback(() => {
    setNickname(regenerateStoredNickname());
  }, []);
```

를 다음으로 교체:

```ts
  const regenerateNickname = useCallback(() => {
    setIsRegenerating(true);
    void reassignNicknameAction()
      .then((result) => {
        setNickname(result.nickname);
        nicknameSyncedRef.current = result.nicknameSynced;
      })
      .finally(() => setIsRegenerating(false));
  }, []);
```

- [ ] **Step 5: `startGame`에 안전망 재시도 추가**

기존 `startGame` 콜백:

```ts
  const startGame = useCallback(() => {
    setPhase("loading");
    setStageIndex(0);
    setRemainingTimeByStage([]);
    setHadWrongTouch(false);
    setScoreBreakdown(null);
    setGukbapTier(null);
    void runPreload();
  }, [runPreload]);
```

를 다음으로 교체 (닉네임이 아직 서버와 동기화 안 됐으면 시작과 동시에 한 번 더 시도 — 실패해도 `runPreload`는 그대로 진행):

```ts
  const startGame = useCallback(() => {
    setPhase("loading");
    setStageIndex(0);
    setRemainingTimeByStage([]);
    setHadWrongTouch(false);
    setScoreBreakdown(null);
    setGukbapTier(null);

    if (!nicknameSyncedRef.current) {
      void reassignNicknameAction().then((result) => {
        setNickname(result.nickname);
        nicknameSyncedRef.current = result.nicknameSynced;
      });
    }

    void runPreload();
  }, [runPreload]);
```

- [ ] **Step 6: 반환 객체에 `isRegenerating` 추가**

`return { ... }` 블록의 `regenerateNickname,` 다음 줄에 `isRegenerating,` 추가.

- [ ] **Step 7: 타입체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음.

- [ ] **Step 8: 커밋**

```bash
git add app/hooks/useGameProgress.ts
git commit -m "feat(gookbapgame): useGameProgress를 서버 참여자 식별 기반으로 전환"
```

---

### Task 7: page.tsx / StartScreen.tsx — track_id 연결 및 재생성 버튼 로딩 상태

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/components/StartScreen.tsx`

**Interfaces:**
- Consumes: Task 6의 `useGameProgress(trackId)` 반환값 중 `isRegenerating`.
- Produces: `StartScreen`에 새 prop `isRegeneratingNickname: boolean` 추가.

- [ ] **Step 1: `page.tsx`에서 `searchParams`로 track_id 읽기**

기존:

```tsx
export default function Home() {
  const game = useGameProgress();
```

를 다음으로 교체 (Next 16 App Router의 Client Component 페이지는 `searchParams` prop을 `use()`로 읽을 수 있음 — `useSearchParams`+Suspense보다 단순함):

```tsx
"use client";

import { use } from "react";
import StartScreen from "./components/StartScreen";
```

(기존 `"use client";` 줄과 첫 import 줄 사이에 `import { use } from "react";`를 추가하는 형태로, 파일 최상단 import 블록을 위와 같이 정리)

이어서 컴포넌트 선언부를 교체:

```tsx
type PageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default function Home({ searchParams }: PageProps) {
  const resolvedSearchParams = use(searchParams);
  const rawTrackId = resolvedSearchParams.q;
  const trackId = typeof rawTrackId === "string" ? rawTrackId : null;

  const game = useGameProgress(trackId);
```

- [ ] **Step 2: `StartScreen` 호출부에 `isRegeneratingNickname` 전달**

기존:

```tsx
        <StartScreen
          nickname={game.nickname}
          onRegenerateNickname={game.regenerateNickname}
          onStart={game.startGame}
        />
```

를 다음으로 교체:

```tsx
        <StartScreen
          nickname={game.nickname}
          onRegenerateNickname={game.regenerateNickname}
          isRegeneratingNickname={game.isRegenerating}
          onStart={game.startGame}
        />
```

- [ ] **Step 3: `StartScreen.tsx` props와 버튼에 로딩 상태 반영**

기존:

```tsx
interface StartScreenProps {
  nickname: string;
  onRegenerateNickname: () => void;
  onStart: () => void;
}

export default function StartScreen({
  nickname,
  onRegenerateNickname,
  onStart,
}: StartScreenProps) {
```

를 다음으로 교체:

```tsx
interface StartScreenProps {
  nickname: string;
  onRegenerateNickname: () => void;
  isRegeneratingNickname: boolean;
  onStart: () => void;
}

export default function StartScreen({
  nickname,
  onRegenerateNickname,
  isRegeneratingNickname,
  onStart,
}: StartScreenProps) {
```

버튼 요소:

```tsx
          <button
            type="button"
            onClick={onRegenerateNickname}
            aria-label={t("start.regenerateNicknameAria")}
            className="text-xl"
          >
            🔄
          </button>
```

를 다음으로 교체:

```tsx
          <button
            type="button"
            onClick={onRegenerateNickname}
            disabled={isRegeneratingNickname}
            aria-label={t("start.regenerateNicknameAria")}
            className="text-xl disabled:opacity-40"
          >
            🔄
          </button>
```

- [ ] **Step 4: 타입체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음.

- [ ] **Step 5: 커밋**

```bash
git add app/page.tsx app/components/StartScreen.tsx
git commit -m "feat(gookbapgame): URL의 track_id 연결 및 닉네임 재생성 로딩 상태 표시"
```

---

### Task 8: 환경변수 추가 및 브라우저 골든패스 검증

**Files:**
- Modify: `.env.local`

- [ ] **Step 1: `.env.local`에 닉네임 API URL 추가**

`.env.local`에 한 줄 추가 (로컬에는 `gookbapanalyze`가 안 떠 있을 수 있으므로 값 자체는 비워둬도 되고, 값이 없으면 `assignNicknameOrFallback`이 자동으로 로컬 폴백을 탄다 — 프로덕션 값은 이란토가 Vercel에 별도 등록 예정):

```
NICKNAME_ASSIGN_API_URL=
```

- [ ] **Step 2: 전체 단위테스트 실행**

```bash
npm test
```

Expected: 모든 테스트 PASS (기존 테스트 + Task 2/3에서 추가한 `participantToken.test.ts`/`nicknameApi.test.ts` 포함).

- [ ] **Step 3: dev 서버 기동**

```bash
npm run dev
```

- [ ] **Step 4: 브라우저로 최초 접속 확인**

`http://localhost:3000/?q=local-dev-track`으로 접속. Start 화면에 형용사+명사 조합 닉네임이 표시되는지 확인 (이 시점엔 `NICKNAME_ASSIGN_API_URL`이 비어 있으므로 로컬 폴백 경로 — `generateNickname()` 결과가 보이는 게 정상).

- [ ] **Step 5: `track_logs`/`participants`에 실제로 기록됐는지 확인**

```bash
ANON=$(grep SUPABASE_ANON_KEY .env.local | cut -d= -f2)
curl -s "http://127.0.0.1:54321/rest/v1/participants?select=*" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
curl -s "http://127.0.0.1:54321/rest/v1/track_logs?select=*" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
```

Expected: `participants`에 새 row 1개(참여자당 조회 방지 RLS 때문에 anon SELECT는 막혀 있을 수 있음 — 그 경우 403/빈 배열이 정상이며, 대신 Task 1에서 만든 로컬 DB에 `psql`로 직접 조회해 확인: `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select * from participants; select * from track_logs;"`).

- [ ] **Step 6: 새로고침 시 같은 닉네임 유지 확인**

같은 브라우저 탭에서 새로고침. 직전과 같은 닉네임이 표시되는지 확인 — **주의**: 이번 설계는 `NICKNAME_ASSIGN_API_URL`이 비어있는 한 매번 `generateNickname()`으로 새로 뽑으므로 폴백 상태에선 닉네임이 바뀌는 게 정상 동작이다. "같은 닉네임 유지"는 실제 닉네임 API가 응답할 때만 보장되는 동작이므로, 이 단계에서는 대신 `participants` 테이블에 **새 row가 추가되지 않고 기존 row가 그대로**인지(`upsert` + `ignoreDuplicates`가 제대로 동작하는지)를 psql로 확인한다.

- [ ] **Step 7: `?q=` 파라미터 없이 접속 확인**

`http://localhost:3000/`(파라미터 없이)로 새 시크릿 창에서 접속. 에러 없이 Start 화면이 뜨는지, `track_logs`에 새 row가 추가되지 않는지(트랙 파라미터 없으면 insert를 스킵해야 함) 확인.

- [ ] **Step 8: 재생성 버튼 확인**

Start 화면에서 🔄 버튼 클릭. 클릭 직후 버튼이 잠깐 비활성화(반투명)되는지, 완료 후 닉네임이 바뀌는지 확인.

- [ ] **Step 9: 닉네임 API 성공 경로는 범위 밖임을 기록**

`NICKNAME_ASSIGN_API_URL`이 실제로 응답하는 성공 경로(서버가 재방문 시 기존 닉네임을 반환하는지, 재배정하는지 포함)는 `gookbapanalyze`를 로컬에서 같이 띄우거나 스테이징 URL을 가리켜야 검증 가능하다 — 설계 문서의 "리스크" 항목 그대로 남겨두고, 이 계획에서는 검증하지 않는다. 이란토가 `gookbapanalyze` 로컬 실행 환경을 준비하면 별도로 확인.
