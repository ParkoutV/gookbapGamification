# 프리로딩 로딩화면 설계

## 배경 / 문제

`gookbapgame`은 스테이지 진입 시점마다 그때그때 `fetchGameData`로 세션을 뽑고, `/api/scene` API가 매 요청마다 sharp로 이미지를 즉석 합성해 응답한다(`app/api/scene/route.ts` + `app/lib/composeScene.ts`). 원래 이 지연을 감추기 위해 백엔드에 unified 이미지 캐시를 두려 했으나 그 작업이 완결되지 않았고, 그 결과 실제 플레이 중 스테이지 전환 순간에 이미지 로딩 과정이 사용자 눈에 그대로 노출된다.

`/api/scene` 응답에는 이미 `Cache-Control: public, max-age=3600` 헤더가 있다(2026-07-27 확인). base+parts 조합이 결정적이므로 이 헤더는 "같은 조합 재요청 시 서버 재연산을 피하는" 문제는 이미 해결하고 있다. 하지만 **최초 1회의 로딩은 캐시 유무와 무관하게 반드시 발생**하며, 그 최초 1회가 게임 플레이 중(스테이지 진입 순간)에 일어나는 것이 원래 문제였다. 이번 스펙은 그 최초 1회를 게임 시작 전 전체화면 로딩화면으로 옮겨서, 실제 플레이 중에는 로딩이 전혀 보이지 않게 하는 것이 목표다.

부수적으로, `fetchImageBuffer`(route.ts)가 파츠 하나만 fetch 실패해도 `Promise.all`이 통째로 reject되고 GET 핸들러에 try/catch가 없어 무차별 500이 뜨는 문제가 있다([[project_gookbapgame_stage3_image_bug]] 참고, 근본원인 미확정인 3단계 이미지 버그와 별개로 존재하던 방어코드 미비). 프리로드 실패 시 사용자에게 유의미한 에러를 보여주려면 이 부분도 함께 손봐야 하므로, 이번 스펙 범위에 포함한다.

## 범위

### 이번 스펙에서 실구현

- 게임 시작 시 레벨 1~7 전체(세션 데이터 + 이미지 14장)를 미리 불러오는 전체화면 로딩화면
- 로딩 중 배치(동시 4개 제한, 배치는 순차 진행) 방식의 이미지 preload
- 프리로드 실패 시 에러 문구 + 재시도(전체 재시작)
- `fetchImageBuffer`의 파츠 단위 에러 핸들링 보강
- 재도전(스테이지 실패) 시 이미 로드된 7단계 세트 재사용, 재롤 없음

### 다음 스펙으로 이관 (명시적 제외)

- 3단계 이미지 버그의 근본원인 자체 조사 — 이번 스펙은 "로딩을 안 보이게" 하는 것과 "실패 시 에러를 명확히 보여주는" 것까지만 다루며, 왜 실패하는지의 근본원인 규명은 범위 밖이다.
- 히트박스 겹침 문제 — 별도 스펙으로 이후 진행.
- 서버 측 캐시 구조 개선(예: `unified_images`류 DB 캐시 테이블 도입) — 현재 `Cache-Control` 헤더로 충분하다고 판단, 재검토 필요 시 별도 스펙.

## 아키텍처

### phase 상태머신 확장

`useGameProgress`의 `GamePhase` 유니온에 `"loading"`을 추가한다:

```
"start" | "loading" | "playing" | "stageClear" | "stageFail" | "gameResult" | "wheel" | "dailyResult"
```

`startGame()` 호출 시 phase를 즉시 `"loading"`으로 전환하고, 프리로드가 끝나야 `"playing"`으로 넘어간다.

### `app/lib/preloadGame.ts` (신규)

React에 의존하지 않는 순수 함수로 분리한다(`stageConfig.ts`, `gameSelection.ts`와 같은 패턴).

```ts
export async function preloadAllStages(): Promise<GameSession[]> {
  // 1. 레벨 1~7의 GameSession을 병렬로 확정 (DB 조회만이라 가벼움)
  const sessions = await Promise.all(
    STAGE_CONFIG.map((cfg) => fetchGameData(cfg.level, cfg.diffCount))
  );
  if (sessions.some((s) => s === null)) {
    throw new PreloadError("session", ...);
  }

  // 2. 14개 씬 URL을 동시 4개 제한 큐로 preload (배치는 순차 진행)
  const urls = sessions.flatMap((s) => [s.leftSceneUrl, s.rightSceneUrl]);
  await preloadImagesWithConcurrencyLimit(urls, 4);

  return sessions as GameSession[];
}
```

- `preloadImagesWithConcurrencyLimit`: `new Image()` + `onload`/`onerror`로 브라우저 캐시에 태우는 간단한 큐. 캐시 헤더(`max-age=3600`)를 그대로 활용하도록 별도 쿼리 파라미터를 붙이지 않고 세션이 이미 갖고 있는 URL을 그대로 사용한다.
- 하나라도 실패하면 즉시 reject하고 나머지 대기 중인 preload는 중단한다(부분 성공 상태를 유지하지 않음 — 재시도는 항상 전체 재시작).

### `useGameProgress` 변경

- `sessions: GameSession[]` 상태 추가(7개 확정된 세션 배열).
- `startGame()`: phase → `"loading"` → `preloadAllStages()` 호출 → 성공 시 `sessions` 저장 + `currentStage=1` + phase → `"playing"`, 실패 시 `loadError` 설정(phase는 `"loading"`에 머무름, 에러+재시도 UI로 전환).
- `advanceToNextStage()` / `retryFromStageOne()`: 더 이상 `fetchGameData`를 호출하지 않고, 이미 확정된 `sessions[currentStage - 1]`을 즉시 사용한다. 네트워크 호출이 없어지므로 이 경로들의 `isLoading`은 사실상 상수 `false`가 된다(그대로 남겨둬도 무해하지만 실질적 의미는 없어짐).

### 신규 컴포넌트 `app/components/PreloadScreen.tsx`

- 전체화면(`fixed inset-0`), 기존 `PixelPanel` 스타일 재사용.
- 표시 내용: 스피너 + 고정 문구. 진행률(숫자/프로그레스바) 없음.
- `loadError` 존재 시: 에러 문구 + 재시도 버튼(클릭 시 `preloadAllStages()`를 처음부터 재실행).
- `page.tsx`에서 `phase === "loading"`일 때 `StartScreen` 대신 렌더링.

### `app/api/scene/route.ts` 보강

`fetchImageBuffer` 실패를 개별 파츠 단위로 구분해서 던지도록 수정:

```ts
async function fetchImageBuffer(url: string, label: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${label}: ${url} (${res.status})`);
  }
  return Buffer.from(await res.arrayBuffer());
}
```

GET 핸들러 전체를 try/catch로 감싸 502(업스트림 이미지 실패)로 응답하도록 한다(현재는 핸들러 밖에서 에러가 던져져 Next.js 기본 500이 뜸). 이 정도만으로도 프리로드 실패 시 어떤 스테이지의 어떤 URL이 문제인지 브라우저 네트워크 탭/응답 바디에서 확인 가능해진다 — 서버 로그 인프라 구축은 범위 밖.

## 에러 처리

| 실패 지점 | 동작 |
|---|---|
| `fetchGameData`가 특정 레벨에서 null 반환(콘텐츠 부족) | `preloadAllStages` reject → `PreloadScreen`에 에러 문구 + 재시도 |
| 이미지 preload `onerror`(404/502 등) | 위와 동일 |
| 재시도 버튼 클릭 | `preloadAllStages()` 처음부터 재실행 (부분 재개 없음) |

3단계 버그가 재현될 경우, 이번 스펙 적용 후에는 게임 시작 전 로딩화면 단계에서 명확한 에러로 걸러지게 되어 "게임판은 뜨는데 이미지만 안 보이는" 현재의 혼란스러운 실패 모드 자체가 사라진다. 다만 이는 증상 완화이며 근본원인 규명은 아니다.

## 테스트

- `preloadGame.test.ts`: 동시 실행이 4개로 제한되는지, 배치가 순차로 진행되는지, 하나 실패 시 나머지 대기 항목이 중단되는지에 대한 단위 테스트(fetch/Image를 목으로 대체).
- `app/api/scene/route.ts`의 에러 응답(개별 파츠 실패 시 502 + 식별 가능한 메시지)에 대한 단위 테스트.
- 수동 확인: 로컬 Supabase(시딩 완료)로 게임 시작 → 로딩화면 → 7단계 전체 클리어까지 스테이지 전환 시 로딩이 전혀 보이지 않는지, 스테이지 실패 후 재도전 시 동일 세트가 재사용되는지, 의도적으로 네트워크를 끊어 프리로드 실패 → 에러+재시도 UI 확인.
