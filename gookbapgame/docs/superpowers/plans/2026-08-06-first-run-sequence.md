# 첫 진입 시퀀스 (TERM · 튜토리얼 · 백그라운드 프리로드) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 최초 접속자에게 TERM 고지 팝업과 튜토리얼을 보여주고, 튜토리얼을 읽는 동안 게임 데이터를 백그라운드로 프리로드한다.

**Architecture:** 현재 `runPreload()`가 완료 시 `setPhase("playing")`을 직접 호출해 "프리로드 완료 = 화면 전환"이 되어 있다. 이를 끊고 `preloadStatus` 독립 상태를 도입해, 자동 진입은 `phase === "loading"`인 경로에서만 일어나게 한다. 튜토리얼은 새 `GamePhase`, TERM은 `page.tsx`의 오버레이. 최초 실행 여부는 쿠키 2개로만 판정하며 서버 통신이 없다.

**Tech Stack:** Next.js 16.2.9 (App Router, `"use client"`), React 19.2.4, TypeScript, Tailwind v4, 테스트는 `node --test --experimental-strip-types`.

**설계 문서:** `docs/superpowers/specs/2026-08-06-first-run-sequence-design.md` — 결정의 근거는 전부 여기 있다. 구현 중 판단이 필요하면 먼저 읽을 것.

## Global Constraints

- **이 저장소의 Next.js는 학습 데이터와 다르다.** 코드를 쓰기 전에 `node_modules/next/dist/docs/`의 관련 가이드를 읽을 것 (`AGENTS.md`).
- **테스트 파일은 글롭으로 수집되지 않는다.** `package.json`의 `test` 스크립트가 파일 경로를 하나씩 나열한다. 새 테스트 파일은 반드시 그 목록에 추가해야 하며, 추가하지 않으면 `npm test`가 그 파일을 실행하지 않고 조용히 통과한다.
- **로케일은 ko / en / ja 셋 다, 같은 커밋에서.** `Dictionary`는 `Record<string, string>`이고 키 정합성 검사 테스트가 없다. `translateWith`가 ja→en→ko로 폴백하므로 ko만 추가해도 테스트는 통과하지만 영어·일본어 사용자에게 한국어가 노출된다. 컴파일러도 테스트도 잡아주지 않는다.
- **쿠키 속성 고정:** `path=/`, `max-age=63072000`(2년), `SameSite=Lax`. httpOnly 아님.
- **서버 통신 금지:** TERM 동의 이력이나 튜토리얼 시청 여부를 서버/DB에 기록하지 말 것. 의무 고지이며 로컬 상태로 충분하다.
- **`review` 모드 튜토리얼은 절대 `runPreload()`를 호출하지 않는다.** 선제적 프리로드를 추가하지 말 것 (이유는 Task 4에 있다).
- 커밋 메시지는 한국어로, 저장소의 기존 커밋 스타일을 따른다.
- **`npm run lint`는 기준선부터 이미 실패한다.** 브랜치 시작 시점(`0ee3d65`) 기준
  `24 problems (17 errors, 7 warnings)`. 판정 기준은 "전부 통과"가 아니라
  **"기존에 없던 종류의 오류가 새로 생기지 않았는가"**다. 아래 두 규칙은 이 코드베이스가
  이미 광범위하게 위반하고 있으므로 새 코드가 같은 방식으로 걸리는 것은 허용한다.
  - `react-hooks/set-state-in-effect` — `app/page.tsx:43`(`setShowDrawEntry`),
    `app/lib/i18n/LocaleContext.tsx:32`에 선례가 있다. 이 계획의 하이드레이션 패턴
    (마운트 후 쿠키 읽기)과 자동 전환 효과가 필연적으로 여기 걸린다.
  - `@typescript-eslint/no-explicit-any` — `app/lib/pendingDraw.test.ts`,
    `surveySubmitted.test.ts`가 테스트 스텁을 심을 때 `(globalThis as any)`를 쓴다.
    새 테스트도 같은 방식을 쓴다.
  **기존 오류를 덤으로 고치지 말 것** — 이 작업의 범위가 아니고 diff만 커진다.
- **node 실행 경로:** 이 환경의 node는 PATH에 없다. 명령 앞에
  `export PATH="$HOME/.local/opt/node22/bin:$PATH"`를 붙여라 (node v22.20.0, npm 10.9.3).

---

## File Structure

**신규**

| 파일 | 책임 |
|---|---|
| `app/lib/firstRunFlags.ts` | 쿠키 2개의 읽기/쓰기. 순수 브라우저 상태, React 의존 없음 |
| `app/lib/firstRunFlags.test.ts` | 위의 테스트 |
| `app/components/TermNotice.tsx` | TERM 고지 모달. 표시와 확인 버튼만 |
| `app/components/TutorialScreen.tsx` | 튜토리얼 3페이지. `mode`로 온보딩/다시보기를 가름 |

**수정**

| 파일 | 변경 |
|---|---|
| `app/hooks/useGameProgress.ts` | `preloadStatus` 도입, `runPreload`에서 `setPhase` 제거, 자동 전환 효과 추가, `GamePhase`에 `"tutorial"` 추가, `startGame(withTutorial)` |
| `app/page.tsx` | TERM 오버레이 배선, `"tutorial"` phase 렌더, 튜토리얼 진입/종료 콜백 |
| `app/components/StartScreen.tsx` | 튜토리얼 상시 버튼 추가 |
| `app/lib/i18n/locales/{ko,en,ja}.ts` | `term.*`, `tutorial.*` 키 추가 |
| `package.json` | `test` 스크립트에 `firstRunFlags.test.ts` 추가 |

**작업 순서의 이유:** Task 2가 기존 동작을 건드리는 유일한 지점이다. Task 2까지 끝냈을 때 겉보기 동작은 지금과 **완전히 같아야** 한다. 그 다음에 Task 3~5를 얹는다.

---

### Task 1: 쿠키 플래그 모듈

**Files:**
- Create: `app/lib/firstRunFlags.ts`
- Test: `app/lib/firstRunFlags.test.ts`
- Modify: `package.json` (`scripts.test`)

**Interfaces:**
- Consumes: 없음 (독립 모듈)
- Produces: `hasAcknowledgedTerm(): boolean`, `markTermAcknowledged(): void`, `hasSeenTutorial(): boolean`, `markTutorialSeen(): void`

- [ ] **Step 1: `package.json`의 test 목록에 새 테스트 파일을 먼저 추가한다**

이걸 먼저 하지 않으면 Step 3의 "실패 확인"이 무의미해진다 — 파일이 실행되지 않은 채 통과한다.

`package.json`의 `scripts.test` 문자열 맨 끝(`app/lib/surveySubmitted.test.ts` 뒤)에 공백으로 이어붙인다:

```
app/lib/firstRunFlags.test.ts
```

- [ ] **Step 2: 실패하는 테스트를 작성한다**

`app/lib/firstRunFlags.test.ts`:

```ts
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  hasAcknowledgedTerm,
  markTermAcknowledged,
  hasSeenTutorial,
  markTutorialSeen,
} from "./firstRunFlags.ts";

// node 런타임에는 document가 없으므로 최소 쿠키 스텁을 심는다.
// document.cookie는 "읽으면 전체 목록, 쓰면 한 건 추가"라는 비대칭 접근자다.
let rawWrites: string[] = [];

function installCookieStub() {
  const jar = new Map<string, string>();
  rawWrites = [];
  (globalThis as any).document = {
    get cookie(): string {
      return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
    },
    set cookie(str: string) {
      rawWrites.push(str);
      const pair = str.split(";")[0];
      const idx = pair.indexOf("=");
      jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    },
  };
}

beforeEach(() => {
  installCookieStub();
});

test("기본값은 둘 다 false다", () => {
  assert.equal(hasAcknowledgedTerm(), false);
  assert.equal(hasSeenTutorial(), false);
});

test("mark 후에는 true가 된다", () => {
  markTermAcknowledged();
  assert.equal(hasAcknowledgedTerm(), true);
  markTutorialSeen();
  assert.equal(hasSeenTutorial(), true);
});

test("두 플래그는 서로 독립적이다", () => {
  markTermAcknowledged();
  assert.equal(hasAcknowledgedTerm(), true);
  assert.equal(hasSeenTutorial(), false);
});

test("다른 쿠키가 섞여 있어도 오탐하지 않는다", () => {
  document.cookie = "gookbapgame_token=abc123";
  assert.equal(hasAcknowledgedTerm(), false);
  markTermAcknowledged();
  assert.equal(hasAcknowledgedTerm(), true);
});

test("쓰기에 path/max-age/SameSite 속성이 붙는다", () => {
  markTermAcknowledged();
  const written = rawWrites.at(-1) ?? "";
  assert.match(written, /path=\//);
  assert.match(written, /max-age=63072000/);
  assert.match(written, /SameSite=Lax/);
});

test("document가 없으면(서버 렌더링) false를 반환하고 예외를 던지지 않는다", () => {
  delete (globalThis as any).document;
  assert.equal(hasAcknowledgedTerm(), false);
  assert.equal(hasSeenTutorial(), false);
  assert.doesNotThrow(() => markTermAcknowledged());
  assert.doesNotThrow(() => markTutorialSeen());
});
```

- [ ] **Step 3: 테스트를 돌려 실패를 확인한다**

Run: `export PATH="$HOME/.local/opt/node22/bin:$PATH" && npm test`
Expected: FAIL — `Cannot find module './firstRunFlags.ts'`

- [ ] **Step 4: 최소 구현을 작성한다**

`app/lib/firstRunFlags.ts`:

```ts
const TERM_ACK_COOKIE = "gookbapgame_term_ack";
const TUTORIAL_SEEN_COOKIE = "gookbapgame_tutorial_seen";

// 2년. 참여자 식별 토큰(gookbapgame_token)의 만료와 맞췄다.
const MAX_AGE_SEC = 63072000;

/**
 * "이 브라우저에서 TERM 고지를 봤다 / 튜토리얼을 봤다"는 표시.
 *
 * localStorage를 쓰는 pendingDraw.ts / surveySubmitted.ts와 달리 쿠키를 쓰는 이유는
 * 만료가 있기 때문이다. TERM은 의무 고지라서 2년 뒤 다시 노출되는 것이 방어 가능한
 * 동작인 반면 localStorage는 만료되지 않는다.
 *
 * 서버는 이 값을 읽지 않는다(그래서 httpOnly가 아니다). 동의 이력을 서버에 남기는
 * 설계로 확장하지 말 것 — 자세한 이유는
 * docs/superpowers/specs/2026-08-06-first-run-sequence-design.md 참고.
 */
function isAvailable(): boolean {
  return typeof document !== "undefined";
}

function readFlag(name: string): boolean {
  if (!isAvailable()) return false;
  return document.cookie
    .split(";")
    .some((entry) => entry.trim() === `${name}=1`);
}

function writeFlag(name: string): void {
  if (!isAvailable()) return;
  document.cookie = `${name}=1; path=/; max-age=${MAX_AGE_SEC}; SameSite=Lax`;
}

export function hasAcknowledgedTerm(): boolean {
  return readFlag(TERM_ACK_COOKIE);
}

export function markTermAcknowledged(): void {
  writeFlag(TERM_ACK_COOKIE);
}

export function hasSeenTutorial(): boolean {
  return readFlag(TUTORIAL_SEEN_COOKIE);
}

export function markTutorialSeen(): void {
  writeFlag(TUTORIAL_SEEN_COOKIE);
}
```

- [ ] **Step 5: 테스트를 돌려 통과를 확인한다**

Run: `export PATH="$HOME/.local/opt/node22/bin:$PATH" && npm test`
Expected: PASS — 새 테스트 6개를 포함해 전부 통과

- [ ] **Step 6: 커밋**

```bash
git add app/lib/firstRunFlags.ts app/lib/firstRunFlags.test.ts package.json
git commit -m "최초 실행 여부를 판정하는 쿠키 플래그 모듈 추가

TERM 고지와 튜토리얼을 최초 1회만 띄우기 위한 로컬 상태.
기존 pendingDraw/surveySubmitted와 달리 localStorage가 아니라 쿠키를
쓰는 이유는 만료가 있기 때문 — 의무 고지가 2년 뒤 다시 뜨는 것은
방어 가능한 동작이지만 localStorage는 만료되지 않는다."
```

---

### Task 2: 프리로드 완료와 화면 전환의 분리

**이 태스크가 끝났을 때 겉보기 동작은 지금과 완전히 같아야 한다.** 순수한 구조 변경이다.

**Files:**
- Modify: `app/hooks/useGameProgress.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `PreloadStatus` 타입 (`"idle" | "loading" | "ready" | "error"`), 훅 반환값에 `preloadStatus: PreloadStatus` 추가. `GamePhase` union에 `"tutorial"` 추가. `startGame(withTutorial?: boolean)` 시그니처.

- [ ] **Step 1: `GamePhase`에 `"tutorial"`을 추가하고 `PreloadStatus` 타입을 정의한다**

`app/hooks/useGameProgress.ts`의 `GamePhase` 선언(19–28행)을 다음으로 교체:

```ts
export type GamePhase =
  | "start"
  | "tutorial"
  | "loading"
  | "playing"
  | "gameResult"
  | "surveyIntro"
  | "survey"
  | "wheel"
  | "dailyResult"
  | "myCoupons";

/**
 * 프리로드의 진행 상태. "화면 전환"과 분리된 값이라는 점이 핵심이다.
 *
 * 예전에는 runPreload가 완료 시 곧바로 setPhase("playing")을 호출해서
 * "프리로드 완료 = 게임 시작"이었다. 튜토리얼을 병렬로 띄우려면 이 둘이
 * 분리되어야 한다 — 안 그러면 프리로드가 끝나는 순간 튜토리얼을 읽던
 * 사용자가 게임으로 튕겨나간다.
 */
export type PreloadStatus = "idle" | "loading" | "ready" | "error";
```

- [ ] **Step 2: `preloadStatus` state를 추가한다**

`const [loadError, setLoadError] = useState<LoadError | null>(null);` (42행) 바로 아래에 추가:

```ts
  const [preloadStatus, setPreloadStatus] = useState<PreloadStatus>("idle");
```

- [ ] **Step 3: `runPreload`에서 `setPhase`를 제거하고 상태만 갱신하게 바꾼다**

기존 `runPreload`(140–151행)를 다음으로 교체:

```ts
  // 리셋(setPreloadStatus("loading"))을 startGame이 아니라 여기 첫 문장에 두는 이유:
  // 호출자마다 리셋을 기억해야 하는 구조면 언젠가 빠진다. retryPreload를 포함한
  // 모든 호출자가 자동으로 같은 보장을 받게 한다.
  //
  // 리셋이 왜 필요한가: startGame은 sessions를 비우지 않고, page.tsx의 leaveDrawFlow는
  // sessions를 든 채로 start phase로 돌아올 수 있다. status가 "ready"로 남아 있으면
  // 두 번째 판이 직전 판의 스테이지 데이터로 시작된다.
  //
  // 경합은 없다: startGame이 setPhase(...)를 호출한 직후 동기적으로 runPreload를 부르고,
  // runPreload는 첫 await 이전에 이 setState를 실행한다. 같은 React 배치에 들어가므로
  // phase === "loading" && preloadStatus === "ready"인 중간 렌더가 존재하지 않는다.
  const runPreload = useCallback(async () => {
    setLoadError(null);
    setPreloadStatus("loading");
    const result = await preloadAllStages(fetchGameData);
    if (result.ok) {
      setSessions(result.sessions);
      totalAnswersRef.current = result.sessions.reduce((sum, s) => sum + countDifferences(s), 0);
      setLoadNonce((n) => n + 1);
      setPreloadStatus("ready");
    } else {
      setLoadError({ key: result.key, params: result.params });
      setPreloadStatus("error");
    }
  }, []);
```

- [ ] **Step 4: 자동 전환을 담당하는 효과를 추가한다**

Step 3의 `runPreload` 바로 아래에 추가:

```ts
  // 게임 진입의 자동 경로는 여기 한 곳만 담당한다.
  // phase가 "loading"일 때만 작동하므로, 튜토리얼(phase === "tutorial") 중에
  // 프리로드가 끝나도 사용자를 끌어가지 않는다. 튜토리얼에서의 진입은
  // 사용자가 "시작하기"를 누를 때 page.tsx가 goToPhase("playing")으로 처리한다.
  useEffect(() => {
    if (phase === "loading" && preloadStatus === "ready") {
      setPhase("playing");
    }
  }, [phase, preloadStatus]);
```

- [ ] **Step 5: `startGame`이 튜토리얼 경로를 받을 수 있게 한다**

기존 `startGame`(153–177행)을 파라미터를 받는 형태로 감싼다. **본문 전체가 한 단계 더 들여쓰기된다** — 아래는 앞뒤만 보여주고 가운데 리셋 코드(`setStageIndex(0)`부터 `void runPreload();`까지)는 순서와 내용을 그대로 유지한 채 들여쓰기만 맞춘다.

```ts
  // withTutorial이면 튜토리얼로 진입하고, 프리로드는 그 뒤에서 병렬로 돈다.
  // 아니면 기존과 동일하게 로딩 화면으로 간다(재방문자 경로).
  //
  // 기본값을 false로 둔 이유는 호출부를 아직 안 고쳤을 때 기존 동작이 유지되게
  // 하려는 것이다. 튜토리얼 배선은 page.tsx에서 별도로 한다.
  const startGame = useCallback(
    (withTutorial: boolean = false) => {
      setPhase(withTutorial ? "tutorial" : "loading");
      setStageIndex(0);
      // ... (기존 리셋 코드 그대로: setRemainingTimeSec부터 nicknameSynced 복구까지)
      void runPreload();
    },
    [runPreload]
  );
```

- [ ] **Step 6: 훅 반환값에 `preloadStatus`를 추가한다**

`return {` 블록(263행~)의 `loadError,` 다음 줄에 추가:

```ts
    preloadStatus,
```

- [ ] **Step 7: 타입 검사와 테스트를 돌린다**

```bash
export PATH="$HOME/.local/opt/node22/bin:$PATH"
npx tsc --noEmit
npm test
npm run lint
```

Expected: `tsc`와 `npm test`는 통과. `npm run lint`는 기준선(24 problems / 17 errors)에서 늘어나더라도, 늘어난 것이 `react-hooks/set-state-in-effect`와 `@typescript-eslint/no-explicit-any`뿐이면 정상이다(Global Constraints 참고). 그 외 종류의 오류가 새로 나오면 고쳐라. `startGame`에 기본값 `false`를 줬으므로 `page.tsx`의 기존 호출부(`onStart={game.startGame}`)는 수정 없이 컴파일된다.

- [ ] **Step 8: 겉보기 동작이 그대로인지 수동 확인한다**

`docs/local-test-setup.md`대로 서버 두 개를 띄운 뒤:

1. `npm run dev` → 시작 화면 → `게임 시작` → 로딩 화면 → 게임이 정상 시작되는지
2. **회귀 확인 (이 변경의 핵심):** 게임 1판 완주 → 게임 결과 → 설문 → 룰렛 → 오늘의 결과 → `처음으로` → `게임 시작` → **2판의 그림이 1판과 다른지 확인**. 같으면 `runPreload`의 리셋이 빠진 것이다.

- [ ] **Step 9: 커밋**

```bash
git add app/hooks/useGameProgress.ts
git commit -m "프리로드 완료와 화면 전환을 분리

runPreload가 완료 시 setPhase(\"playing\")을 직접 호출하던 구조를 끊고
preloadStatus를 독립 상태로 뒀다. 이 상태로는 겉보기 동작이 이전과
같지만, 튜토리얼을 프리로드와 병렬로 돌리려면 이 분리가 전제다.

리셋을 runPreload 첫 문장에 둔 이유는 주석에 적어뒀다 — startGame이
sessions를 비우지 않기 때문에 status가 ready로 남으면 두 번째 판이
직전 판 데이터로 시작된다."
```

---

### Task 3: TERM 고지 모달

**Files:**
- Create: `app/components/TermNotice.tsx`
- Modify: `app/page.tsx`, `app/lib/i18n/locales/{ko,en,ja}.ts`

**Interfaces:**
- Consumes: `hasAcknowledgedTerm()`, `markTermAcknowledged()` (Task 1)
- Produces: `<TermNotice onAcknowledge={() => void} />`

> **문구 확인 필요:** 아래 `term.body`는 이 코드베이스가 실제로 수집하는 항목(익명 식별 쿠키, 게임 점수, 설문 응답, 쿠폰 발급 이력)을 근거로 쓴 초안이다. 배포 전에 이란토·구자건이 실제 개인정보처리방침 문구로 확정해야 한다. 구현은 이 초안으로 진행하고, 확정되면 로케일 파일의 문자열만 교체하면 된다.

- [ ] **Step 1: 로케일 3종에 `term.*` 키를 추가한다**

`app/lib/i18n/locales/ko.ts`의 `"preload.preparing"` 블록 앞에 추가:

```ts
  "term.title": "개인정보 처리 안내",
  "term.body":
    "이 게임은 원활한 참여와 쿠폰 발급을 위해 아래 정보를 수집합니다.\n\n" +
    "· 익명 식별용 쿠키 (이름·연락처 등 개인을 특정하는 정보는 수집하지 않습니다)\n" +
    "· 게임 점수 및 진행 기록\n" +
    "· 설문에 응답한 내용\n" +
    "· 쿠폰 발급 및 사용 내역\n\n" +
    "수집된 정보는 게임 운영과 쿠폰 지급 목적으로만 사용되며, 행사 종료 후 파기됩니다.",
  "term.agreeNotice": "확인을 누르면 위 내용에 동의한 것으로 간주합니다.",
  "term.confirmButton": "확인",
```

`app/lib/i18n/locales/en.ts`의 같은 위치에 추가:

```ts
  "term.title": "Privacy Notice",
  "term.body":
    "This game collects the following information to run the game and issue coupons.\n\n" +
    "· An anonymous identification cookie (no name, contact details, or other personally identifying information is collected)\n" +
    "· Game scores and play records\n" +
    "· Your survey answers\n" +
    "· Coupon issuance and redemption history\n\n" +
    "This information is used only to operate the game and issue coupons, and is discarded after the event ends.",
  "term.agreeNotice": "Tapping Confirm means you agree to the above.",
  "term.confirmButton": "Confirm",
```

`app/lib/i18n/locales/ja.ts`의 같은 위치에 추가:

```ts
  "term.title": "個人情報の取り扱いについて",
  "term.body":
    "このゲームでは、ゲームの運営とクーポン発行のために以下の情報を収集します。\n\n" +
    "· 匿名識別用のクッキー（氏名・連絡先など個人を特定する情報は収集しません）\n" +
    "· ゲームのスコアおよびプレイ記録\n" +
    "· アンケートの回答内容\n" +
    "· クーポンの発行・利用履歴\n\n" +
    "収集した情報はゲームの運営とクーポン発行の目的にのみ使用し、イベント終了後に破棄します。",
  "term.agreeNotice": "「確認」を押すと、上記の内容に同意したものとみなします。",
  "term.confirmButton": "確認",
```

- [ ] **Step 2: `TermNotice` 컴포넌트를 만든다**

`app/components/TermNotice.tsx`:

```tsx
"use client";

import PixelPanel from "./PixelPanel";
import { useLocale } from "../lib/i18n/LocaleContext";

interface TermNoticeProps {
  onAcknowledge: () => void;
}

/**
 * 최초 접속 시 1회 뜨는 개인정보 처리 안내.
 *
 * 동의를 받아 보관하는 게이트가 아니라 의무 고지다 — 확인을 누르면 동의한 것으로
 * 간주하고, 서버에 아무것도 기록하지 않는다. 닫기(X)나 거부 버튼을 두지 않는 것도
 * 그래서다: 거부라는 선택지가 있으면 동의 게이트가 되어버린다.
 */
export default function TermNotice({ onAcknowledge }: TermNoticeProps) {
  const { t } = useLocale();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("term.title")}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
    >
      <PixelPanel size="card" className="max-w-sm w-full">
        <h2 className="text-xl font-bold text-ink mb-4 text-center">{t("term.title")}</h2>
        <div className="text-sm text-ink text-left whitespace-pre-line max-h-[45vh] overflow-y-auto mb-4">
          {t("term.body")}
        </div>
        <p className="text-xs text-muted text-left mb-5">{t("term.agreeNotice")}</p>
        <button
          type="button"
          onClick={onAcknowledge}
          className="pixel-mask-btn-solid w-full py-3 px-6 bg-accent text-accent-ink font-bold transition-opacity active:scale-95"
        >
          {t("term.confirmButton")}
        </button>
      </PixelPanel>
    </div>
  );
}
```

`z-[60]`인 이유: `PreloadScreen`이 `z-50`이므로 그보다 위에 있어야 한다.

- [ ] **Step 3: `page.tsx`에 배선한다**

import에 추가:

```tsx
import TermNotice from "./components/TermNotice";
import { hasAcknowledgedTerm, markTermAcknowledged } from "./lib/firstRunFlags";
```

`showDrawEntry` 블록(41–44행) 바로 아래에 추가:

```tsx
  // 쿠키는 서버 렌더링 시점에 읽을 수 없다. showDrawEntry와 같은 이유로 마운트 후에
  // 읽어야 하이드레이션이 어긋나지 않는다 — useState(() => hasAcknowledgedTerm())로
  // 초기값을 계산하면 서버에서는 항상 false가 되어 마크업이 달라진다.
  const [showTerm, setShowTerm] = useState(false);
  useEffect(() => {
    setShowTerm(!hasAcknowledgedTerm());
  }, []);

  const acknowledgeTerm = useCallback(() => {
    markTermAcknowledged();
    setShowTerm(false);
  }, []);
```

`return`의 최상위 `<div>` 안, `<LanguageToggle />` 바로 위에 추가:

```tsx
      {showTerm && <TermNotice onAcknowledge={acknowledgeTerm} />}
```

- [ ] **Step 4: 검사를 돌린다**

```bash
export PATH="$HOME/.local/opt/node22/bin:$PATH"
npx tsc --noEmit
npm run lint
npm test
```

Expected: `tsc`와 `npm test`는 통과. `npm run lint`는 기준선(24 problems / 17 errors) 대비 늘어난 것이 `react-hooks/set-state-in-effect`와 `@typescript-eslint/no-explicit-any`뿐이면 정상(Global Constraints 참고).

- [ ] **Step 5: 수동 확인**

1. 브라우저 개발자도구 → Application → Cookies에서 `gookbapgame_term_ack` 삭제 → 새로고침 → 모달이 뜨는지
2. `확인` 클릭 → 사라지고 쿠키가 생기는지
3. 새로고침 → **다시 뜨지 않는지**
4. 모달이 떠 있는 상태에서 새로고침 → 다시 뜨는지 (확인을 안 눌렀으므로 정상)
5. 언어를 English / 日本語로 바꾼 뒤 쿠키를 지우고 새로고침 → 해당 언어로 나오는지

- [ ] **Step 6: 커밋**

```bash
git add app/components/TermNotice.tsx app/page.tsx app/lib/i18n/locales/
git commit -m "최초 접속 시 개인정보 처리 안내 모달 표시

동의 게이트가 아니라 의무 고지이므로 거부 버튼을 두지 않고, 확인을
누르면 동의한 것으로 간주한다. 서버에 아무것도 기록하지 않는다.

문구는 실제 수집 항목을 근거로 한 초안이며 배포 전 확정 필요."
```

---

### Task 4: 튜토리얼 화면

**Files:**
- Create: `app/components/TutorialScreen.tsx`
- Modify: `app/lib/i18n/locales/{ko,en,ja}.ts`

**Interfaces:**
- Consumes: `PreloadStatus` (Task 2), `LoadError` (`app/lib/preloadGame.ts`)
- Produces: `<TutorialScreen mode preloadStatus loadError onRetryPreload onFinish onExit />` — 정확한 prop 타입은 Step 2의 인터페이스 선언 참조

> **불변 조건:** `review` 모드는 `runPreload()`를 호출하지 않는다. 자동 전환 효과가 `phase === "loading"`을 조건으로 걸고 있어 `review` 중(phase는 `"tutorial"`)에는 무해하지만, 누군가 "미리 받아두면 빠르겠지" 하고 `review`에 프리로드를 붙이면 그 순간 사용자가 게임으로 끌려가는 경로가 열린다. 선제적 프리로드를 추가하지 말 것.

- [ ] **Step 1: 로케일 3종에 `tutorial.*` 키를 추가한다**

문구는 `app/lib/stageConfig.ts`의 실제 상수에서 도출한 것이다 — 값을 바꾸려면 그쪽을 먼저 볼 것.

`app/lib/i18n/locales/ko.ts`의 `term.*` 블록 아래에 추가:

```ts
  "tutorial.openButton": "게임 방법",
  "tutorial.progress": "{current} / {total}",
  "tutorial.prevButton": "이전",
  "tutorial.nextButton": "다음",
  "tutorial.startButton": "시작하기",
  "tutorial.closeButton": "닫기",
  "tutorial.exitAria": "튜토리얼 닫기",
  "tutorial.waiting": "준비 중...",

  "tutorial.what.title": "다른 곳을 찾아라",
  "tutorial.what.body":
    "좌우 두 그림에서 다른 곳을 찾아 터치하세요.\n" +
    "총 7단계, 단계마다 5곳씩 숨어 있습니다. 마지막 7단계만 7곳입니다.",

  "tutorial.limit.title": "시간과 기회",
  "tutorial.limit.body":
    "제한시간은 단계별이 아니라 전체 300초입니다.\n" +
    "한 단계에서 3번 틀리면 그 단계는 거기서 끝나고 다음 단계로 넘어갑니다.\n" +
    "틀릴 때마다 10점이 깎입니다.",

  "tutorial.score.title": "점수 올리기",
  "tutorial.score.body":
    "빨리 끝낼수록 시간 보너스가 붙습니다.\n" +
    "연속으로 맞히면 콤보 보너스가 쌓입니다.\n" +
    "게임이 끝나면 국밥력 등급이 나오고, 쿠폰 뽑기로 이어집니다.",
```

`app/lib/i18n/locales/en.ts`:

```ts
  "tutorial.openButton": "How to Play",
  "tutorial.progress": "{current} / {total}",
  "tutorial.prevButton": "Back",
  "tutorial.nextButton": "Next",
  "tutorial.startButton": "Start",
  "tutorial.closeButton": "Close",
  "tutorial.exitAria": "Close tutorial",
  "tutorial.waiting": "Getting ready...",

  "tutorial.what.title": "Spot the Difference",
  "tutorial.what.body":
    "Tap the spots that differ between the two pictures.\n" +
    "There are 7 stages with 5 differences each — except the final stage, which has 7.",

  "tutorial.limit.title": "Time and Chances",
  "tutorial.limit.body":
    "You get 300 seconds for the whole game, not per stage.\n" +
    "Three wrong taps in a stage ends that stage and moves you on.\n" +
    "Each wrong tap costs 10 points.",

  "tutorial.score.title": "Scoring",
  "tutorial.score.body":
    "Finishing faster earns a time bonus.\n" +
    "Consecutive correct taps build a combo bonus.\n" +
    "When the game ends you get a Gukbap rank, then a coupon draw.",
```

`app/lib/i18n/locales/ja.ts`:

```ts
  "tutorial.openButton": "遊び方",
  "tutorial.progress": "{current} / {total}",
  "tutorial.prevButton": "戻る",
  "tutorial.nextButton": "次へ",
  "tutorial.startButton": "はじめる",
  "tutorial.closeButton": "閉じる",
  "tutorial.exitAria": "チュートリアルを閉じる",
  "tutorial.waiting": "準備中...",

  "tutorial.what.title": "違うところを探そう",
  "tutorial.what.body":
    "左右の絵で違うところを見つけてタッチしてください。\n" +
    "全7ステージ、各ステージに5か所ずつ隠れています。最後の7ステージだけ7か所です。",

  "tutorial.limit.title": "制限時間とチャンス",
  "tutorial.limit.body":
    "制限時間はステージごとではなく、全体で300秒です。\n" +
    "1つのステージで3回間違えると、そのステージは終了して次に進みます。\n" +
    "間違えるたびに10点減点されます。",

  "tutorial.score.title": "スコアを伸ばす",
  "tutorial.score.body":
    "早く終えるほどタイムボーナスが付きます。\n" +
    "連続で正解するとコンボボーナスが加算されます。\n" +
    "ゲーム終了後はクッパ力ランクが出て、クーポン抽選に進みます。",
```

- [ ] **Step 2: `TutorialScreen` 컴포넌트를 만든다**

`app/components/TutorialScreen.tsx`:

```tsx
"use client";

import { useState } from "react";
import PixelPanel from "./PixelPanel";
import { useLocale } from "../lib/i18n/LocaleContext";
import type { PreloadStatus } from "../hooks/useGameProgress";
import type { LoadError } from "../lib/preloadGame";

// 페이지 순서. 로케일 키의 중간 세그먼트로 쓴다(tutorial.what.title 등).
const PAGE_KEYS = ["what", "limit", "score"] as const;

interface TutorialScreenProps {
  /**
   * "onboarding": 최초 게임 시작 경로. 마지막 버튼이 프리로드 완료를 기다린다.
   * "review": 시작 화면에서 다시 보는 경로. 프리로드와 무관하다.
   *
   * review 모드에서 프리로드를 시작하면 안 된다 — 이유는 이 파일이 아니라
   * 호출부(page.tsx)와 설계 문서에 있다.
   */
  mode: "onboarding" | "review";
  preloadStatus: PreloadStatus;
  loadError: LoadError | null;
  onRetryPreload: () => void;
  /** onboarding이면 게임으로, review면 시작 화면으로. 판단은 호출부가 한다. */
  onFinish: () => void;
  /** 좌상단 X. 항상 시작 화면으로 돌아간다. */
  onExit: () => void;
}

export default function TutorialScreen({
  mode,
  preloadStatus,
  loadError,
  onRetryPreload,
  onFinish,
  onExit,
}: TutorialScreenProps) {
  const { t } = useLocale();
  const [pageIndex, setPageIndex] = useState(0);

  const pageKey = PAGE_KEYS[pageIndex];
  const isLastPage = pageIndex === PAGE_KEYS.length - 1;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-bg text-ink p-6">
      <PixelPanel size="card" className="max-w-md w-full relative">
        <button
          type="button"
          onClick={onExit}
          aria-label={t("tutorial.exitAria")}
          className="absolute top-2 left-2 text-xl text-muted bg-transparent border-0 p-2 leading-none"
        >
          ✕
        </button>

        <p className="text-xs text-muted text-center mb-2">
          {t("tutorial.progress", { current: pageIndex + 1, total: PAGE_KEYS.length })}
        </p>

        <h2 className="text-2xl font-bold text-center mb-4">
          {t(`tutorial.${pageKey}.title`)}
        </h2>

        {/*
          일러스트 자리. 로드맵 A단계(디자인 톤·아이콘)가 끝난 뒤 채운다.
          지금 비워두는 이유는 톤이 확정되기 전에 그리면 재작업이 되기 때문이다.
        */}
        <div className="w-full aspect-[4/3] mb-4 bg-black/20" aria-hidden="true" />

        <p className="text-sm text-left whitespace-pre-line mb-6 min-h-[6rem]">
          {t(`tutorial.${pageKey}.body`)}
        </p>

        <div className="flex gap-3 w-full">
          {pageIndex > 0 && (
            <button
              type="button"
              onClick={() => setPageIndex((i) => i - 1)}
              className="pixel-mask-btn-solid flex-1 py-3 px-4 bg-transparent border border-muted text-ink font-bold active:scale-95"
            >
              {t("tutorial.prevButton")}
            </button>
          )}

          {!isLastPage && (
            <button
              type="button"
              onClick={() => setPageIndex((i) => i + 1)}
              className="pixel-mask-btn-solid flex-1 py-3 px-4 bg-accent text-accent-ink font-bold active:scale-95"
            >
              {t("tutorial.nextButton")}
            </button>
          )}

          {isLastPage && mode === "review" && (
            <button
              type="button"
              onClick={onFinish}
              className="pixel-mask-btn-solid flex-1 py-3 px-4 bg-accent text-accent-ink font-bold active:scale-95"
            >
              {t("tutorial.closeButton")}
            </button>
          )}

          {/*
            onboarding의 마지막 페이지만 프리로드 상태를 반영한다.
            화면을 갈아끼우지 않고 이 버튼 자리 하나가 세 상태를 표현한다 —
            읽던 맥락이 사라지지 않게 하려는 의도적인 선택이다.
          */}
          {isLastPage && mode === "onboarding" && preloadStatus === "error" && (
            <button
              type="button"
              onClick={onRetryPreload}
              className="pixel-mask-btn-solid flex-1 py-3 px-4 bg-accent text-accent-ink font-bold active:scale-95"
            >
              {t("common.retry")}
            </button>
          )}

          {isLastPage && mode === "onboarding" && preloadStatus !== "error" && (
            <button
              type="button"
              onClick={onFinish}
              disabled={preloadStatus !== "ready"}
              className="pixel-mask-btn-solid flex-1 py-3 px-4 bg-accent text-accent-ink font-bold active:scale-95 disabled:opacity-50"
            >
              {preloadStatus === "ready" ? t("tutorial.startButton") : t("tutorial.waiting")}
            </button>
          )}
        </div>

        {isLastPage && mode === "onboarding" && preloadStatus === "error" && loadError && (
          <p className="text-error text-sm mt-4">{t(loadError.key, loadError.params)}</p>
        )}
      </PixelPanel>
    </div>
  );
}
```

- [ ] **Step 3: 검사를 돌린다**

```bash
export PATH="$HOME/.local/opt/node22/bin:$PATH"
npx tsc --noEmit
npm run lint
npm test
```

Expected: `tsc`와 `npm test`는 통과. `npm run lint`는 기준선(24 problems / 17 errors) 대비 늘어난 것이 `react-hooks/set-state-in-effect`와 `@typescript-eslint/no-explicit-any`뿐이면 정상(Global Constraints 참고).. 이 시점에는 컴포넌트가 아직 어디서도 렌더되지 않으므로 화면에는 변화가 없다.

- [ ] **Step 4: 커밋**

```bash
git add app/components/TutorialScreen.tsx app/lib/i18n/locales/
git commit -m "튜토리얼 화면 컴포넌트 추가 (아직 미배선)

3페이지 구성이며 문구는 stageConfig.ts의 실제 상수에서 도출했다.
mode prop 하나로 온보딩(프리로드 완료를 기다림)과 다시보기(무관)를
가른다. 일러스트 자리는 디자인 톤 확정 전이라 비워뒀다."
```

---

### Task 5: 배선 — 첫 실행이면 튜토리얼, 시작 화면에 상시 버튼

**Files:**
- Modify: `app/page.tsx`, `app/components/StartScreen.tsx`

**Interfaces:**
- Consumes: `<TutorialScreen>` (Task 4), `hasSeenTutorial()` / `markTutorialSeen()` (Task 1), `startGame(withTutorial)` / `preloadStatus` (Task 2)
- Produces: 없음 (최종 배선)

- [ ] **Step 1: `StartScreen`에 튜토리얼 버튼을 추가한다**

props 인터페이스에 추가:

```tsx
  onOpenTutorial: () => void;
```

구조 분해 목록에도 `onOpenTutorial`을 추가한 뒤, 하단 버튼 행(`<div className="flex gap-3 w-full">`)을 3열 그리드로 바꾼다:

```tsx
        <div className="grid grid-cols-3 gap-2 w-full">
          <PixelPanel size="btn">
            <button type="button" className="w-full font-bold text-ink text-sm">{t("start.myResult")}</button>
          </PixelPanel>
          <PixelPanel size="btn">
            <button type="button" className="w-full font-bold text-ink text-sm">{t("start.ranking")}</button>
          </PixelPanel>
          <PixelPanel size="btn">
            <button type="button" onClick={onOpenTutorial} className="w-full font-bold text-ink text-sm">
              {t("tutorial.openButton")}
            </button>
          </PixelPanel>
        </div>
```

`flex-1`을 떼고 `grid-cols-3`으로 바꾼 이유: 버튼이 3개가 되면서 flex의 균등 분배로는 좁은 화면에서 글자가 넘친다.

- [ ] **Step 2: `page.tsx`에 튜토리얼 진입/종료를 배선한다**

import에 추가:

```tsx
import TutorialScreen from "./components/TutorialScreen";
import {
  hasAcknowledgedTerm,
  markTermAcknowledged,
  hasSeenTutorial,
  markTutorialSeen,
} from "./lib/firstRunFlags";
```

(Task 3에서 넣은 `firstRunFlags` import 줄을 위 형태로 교체한다.)

`acknowledgeTerm` 아래에 추가:

```tsx
  // 튜토리얼을 "다시 보기"로 열었는지 구분한다. onboarding이면 완주 시 게임으로,
  // review면 시작 화면으로 돌아가야 하는데 phase만으로는 구분할 수 없다.
  const [tutorialMode, setTutorialMode] = useState<"onboarding" | "review">("onboarding");

  // 게임 시작. 튜토리얼을 아직 안 본 참여자만 튜토리얼을 거친다.
  // 쿠키는 클릭 이벤트에서만 읽으므로 서버 렌더 중에는 호출되지 않는다
  // (enterSurveyFlow의 hasSurveySubmitted와 같은 전제).
  const handleStart = useCallback(() => {
    const withTutorial = !hasSeenTutorial();
    setTutorialMode("onboarding");
    startGame(withTutorial);
  }, [startGame]);

  // 시작 화면의 상시 버튼. runPreload를 부르지 않는다 — 부르는 순간
  // 프리로드가 끝나면서 사용자를 게임으로 끌고 갈 경로가 열린다.
  const openTutorialReview = useCallback(() => {
    setTutorialMode("review");
    goToPhase("tutorial");
  }, [goToPhase]);

  // 튜토리얼 완주. onboarding일 때만 쿠키를 쓴다 — 게임에 실제로 진입한
  // 경우에만 "봤다"로 친다.
  const finishTutorial = useCallback(() => {
    if (tutorialMode === "review") {
      goToPhase("start");
      return;
    }
    markTutorialSeen();
    goToPhase("playing");
  }, [tutorialMode, goToPhase]);

  // 좌상단 X. 쿠키를 쓰지 않으므로 다음 게임 시작 때 다시 뜬다.
  // preloadStatus를 직접 되돌리지는 않는다. 다만 다시 시작하면 runPreload가
  // 첫 문장에서 loading으로 리셋하고 재요청하므로, 프리로드는 처음부터 다시 돈다
  // (preloadAllStages에 캐시가 없다).
  const exitTutorial = useCallback(() => {
    goToPhase("start");
  }, [goToPhase]);
```

위 `handleStart`가 쓰는 `startGame`은 **기존 구조 분해 줄(37행)에 추가해서** 얻는다. `game` 객체를 의존성에 넣으면 안 된다 — 그 줄 위의 주석이 설명하듯 `useGameProgress`는 매 렌더 새 객체를 반환하므로 콜백이 매 렌더 재생성된다. 개별 함수는 `useCallback`으로 안정적이다.

```tsx
  const { goToPhase, proceedToDailyResult, phase, scoreBreakdown, startGame } = game;
```

- [ ] **Step 3: `page.tsx`의 렌더 부분을 배선한다**

`StartScreen` 렌더의 `onStart`를 바꾸고 `onOpenTutorial`을 추가한다:

```tsx
      {game.phase === "start" && (
        <StartScreen
          nickname={game.nickname}
          onRegenerateNickname={game.regenerateNickname}
          isRegeneratingNickname={game.isRegenerating}
          onStart={handleStart}
          onOpenTutorial={openTutorialReview}
          onGoToDraw={showDrawEntry ? enterDrawFromStart : undefined}
        />
      )}
```

`game.phase === "loading"` 블록 **바로 위**에 튜토리얼 블록을 추가한다:

```tsx
      {game.phase === "tutorial" && (
        <TutorialScreen
          mode={tutorialMode}
          preloadStatus={game.preloadStatus}
          loadError={game.loadError}
          onRetryPreload={game.retryPreload}
          onFinish={finishTutorial}
          onExit={exitTutorial}
        />
      )}
```

- [ ] **Step 4: 검사를 돌린다**

```bash
export PATH="$HOME/.local/opt/node22/bin:$PATH"
npx tsc --noEmit
npm run lint
npm test
```

Expected: `tsc`와 `npm test`는 통과. `npm run lint`는 기준선(24 problems / 17 errors) 대비 늘어난 것이 `react-hooks/set-state-in-effect`와 `@typescript-eslint/no-explicit-any`뿐이면 정상(Global Constraints 참고).

- [ ] **Step 5: 수동 확인 — 최초 실행 경로**

`docs/local-test-setup.md`대로 서버 두 개를 띄운 뒤, 개발자도구에서 `gookbapgame_term_ack`와 `gookbapgame_tutorial_seen` 쿠키를 지우고 새로고침한다.

1. TERM 모달이 뜬다 → `확인`
2. 시작 화면 → `게임 시작` → **튜토리얼 1/3**이 뜬다 (로딩 화면이 아니다)
3. `다음` → 2/3 → `다음` → 3/3
4. 3/3의 버튼이 `준비 중...`(비활성)에서 `시작하기`(활성)로 바뀐다. 네트워크가 빠르면 이미 `시작하기`일 수 있다 — 개발자도구 Network 탭에서 Slow 3G로 스로틀하면 대기 상태를 확인할 수 있다.
5. `시작하기` → 게임이 곧바로 시작된다 (로딩 화면을 거치지 않는다)

- [ ] **Step 6: 수동 확인 — 재방문·다시보기·이탈 경로**

1. **재방문:** 게임을 한 판 끝내고 `처음으로` → `게임 시작` → 튜토리얼 없이 로딩 화면 → 게임 (쿠키가 써졌으므로)
2. **다시보기:** 시작 화면의 `게임 방법` 버튼 → 튜토리얼 → 3/3의 버튼이 `닫기`인지 확인 → 누르면 시작 화면으로. **이때 게임이 시작되면 안 된다.**
3. **X 이탈:** `gookbapgame_tutorial_seen` 쿠키를 지우고 → `게임 시작` → 튜토리얼에서 X → 시작 화면 → 다시 `게임 시작` → **튜토리얼이 또 뜬다**(쿠키를 안 썼으므로). 이때 프리로드는 **처음부터 다시** 돈다(`runPreload`가 매번 `loading`으로 리셋하고 `preloadAllStages`에 캐시가 없다). 따라서 3/3에서 다시 `준비 중...`을 거친다.
4. **프리로드 실패:** `gookbapanalyze` 서버를 끄고 쿠키를 지운 뒤 `게임 시작` → 튜토리얼 3/3에서 에러 문구와 `다시 시도` 버튼이 뜨는지 → 서버를 다시 켜고 `다시 시도` → `시작하기`로 바뀌는지
5. **회귀:** 게임 1판 완주 → 설문 → 룰렛 → 오늘의 결과 → `처음으로` → `게임 시작` → 2판의 그림이 1판과 다른지

- [ ] **Step 7: 커밋**

```bash
git add app/page.tsx app/components/StartScreen.tsx
git commit -m "첫 진입 시퀀스 배선: 최초 실행 시 튜토리얼, 시작 화면에 상시 버튼

최초 실행자는 게임 시작 시 튜토리얼을 거치고, 그 사이 프리로드가
백그라운드로 돈다. 튜토리얼 완주(시작하기)에서만 쿠키를 쓰므로
X로 이탈하거나 프리로드가 실패해 게임에 못 들어간 경우에는 다음에
다시 뜬다.

다시보기 모드는 프리로드를 시작하지 않는다 — 시작하면 프리로드가
끝나는 순간 사용자를 게임으로 끌고 가는 경로가 열린다."
```

---

## 완료 후 남는 것

계획 범위 밖이며 로드맵의 다른 단계에서 다룬다.

- **튜토리얼 일러스트** — `TutorialScreen.tsx`의 `aspect-[4/3]` 빈 슬롯. 로드맵 A단계(디자인 톤 확정) 이후.
- **TERM 문구 확정** — Task 3의 초안을 이란토·구자건이 실제 개인정보처리방침 문구로 교체. 로케일 파일의 문자열만 바꾸면 되고 코드 변경은 없다.
- **로딩 화면 디자인 개선** — 로드맵 A단계.
- **`preloadStatus` 전이의 자동 테스트** — 이 저장소에 훅을 렌더할 테스트 인프라가 없어 의도적으로 뺐다(설계 문서 §7). React 테스트 인프라를 들이게 되면 그때 추가.

작업이 끝나면 `docs/client/ROADMAP.md`의 C1 체크박스 3개를 채운다.
