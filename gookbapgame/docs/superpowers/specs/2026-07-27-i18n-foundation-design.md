# 다국어 지원 기반(i18n foundation) 설계

## 배경 / 문제

`gookbapgame`의 화면 텍스트(`StartScreen`, `GameResultScreen`, `PreloadScreen`, `DailyResultScreen`, `app/layout.tsx` 등)는 전부 한국어 문자열이 컴포넌트 코드에 그대로 하드코딩돼 있다. 이번 주 목표는 이 정적 UI 문자열을 다국어로 토큰화하는 것이다.

DB(`gookbapanalyze` 쪽)에는 `base_images.title` 등 이미 `{"ko":..., "en":...}` 형태의 다국어 JSONB가 마련돼 있지만, 확인 결과 `gookbapgame`의 어떤 화면에서도 이 값을 실제로 렌더링하지 않는다(전부 게임 자체 정적 문구). 따라서 이번 스펙은 DB JSONB 조회 로직과는 무관하며, 순수하게 게임 UI의 정적 문자열 토큰화만 다룬다. 다만 로케일 결정 메커니즘(감지/토글/영속성)은 나중에 DB 다국어 값을 화면에 쓰게 되더라도 그대로 재사용할 수 있도록 설계한다.

지원 언어가 3개를 넘어 유럽 주요 언어·아프리칸스어·인도차이나반도 언어(태국어, 싱할라어 등)까지 확장되는 안(운영자가 검수 못 하는 언어는 백엔드에서 lazy 기계번역)은 완전히 다른 질문들(폰트 폴백, 번역 캐싱, 무검수 번역의 품질 안전장치)을 필요로 하는 별개 작업이라 이번 스펙 범위에서 명시적으로 제외한다.

## 범위

### 이번 스펙에서 실구현

- 시스템 언어 자동 감지(`navigator.language`)를 기본값으로 하는 로케일 결정
- 좌상단 지구본 아이콘 클릭 → 드롭다운(유튜브 언어 설정 방식)으로 한국어/English/日本語 선택 → 즉시 전환
- 사용자가 수동으로 선택한 로케일은 localStorage에 저장해 재방문 시에도 유지(기존 `participant_id`/닉네임과 같은 패턴). 수동 선택 이전에는 매 접속마다 시스템 언어를 새로 감지
- 지원 로케일: `ko`(완성) / `en`(완성) / `ja`(키 구조만 마련, 값은 비어 있어도 됨 — 폴백으로 동작)
- 감지된 시스템 언어가 세 로케일 중 어디에도 속하지 않으면 `en`으로 설정(한국어 폴백 아님)
- `locale → en → ko` 순 폴백 체인을 가진 순수 함수 기반 번역 유틸리티(`app/lib/i18n/`)

### 다음 스펙으로 이관 (명시적 제외)

- 유럽 주요 언어(프랑스어, 독일어), 아프리칸스어, 인도차이나반도 언어(태국어, 싱할라어, 말레이어, 인도네시아어 등) 지원 — 운영자가 검수 불가능한 언어라 백엔드 lazy 배치 기계번역(캐싱, 무검수 배포에 대한 품질 안전장치)이 필요한 별개 작업
- 위 언어들에서 도트 폰트(`Galmuri11`)가 지원하지 않는 문자 체계(태국어, 싱할라어 등)에 대한 폰트 폴백(범용 고딕체) 처리 — 별도 스펙에서 함께 다룸
- DB의 다국어 JSONB(`base_images.title` 등)를 실제로 화면에 노출하는 기능 — 현재 어떤 화면에도 해당 요구가 없음. 필요해지면 이번 스펙의 로케일 상태(`useLocale`)를 그대로 재사용

## 아키텍처

### 파일 구조

```
app/lib/i18n/
  types.ts          — Locale = 'ko' | 'en' | 'ja', Dictionary 타입(ko.ts 키 구조 기준)
  locales/ko.ts      — 완성된 한국어 딕셔너리 (마스터/기준)
  locales/en.ts      — 완성된 영어 딕셔너리
  locales/ja.ts      — 자리만 마련 (빈 객체 또는 일부 키만) — 나머지는 en으로 폴백
  translate.ts       — t(locale, key): string (순수 함수, React 비의존)
  detectLocale.ts    — detectLocale(navigatorLanguage: string): Locale (순수 함수)
```

`stageConfig.ts`, `gameSelection.ts`, `nickname.ts`와 동일하게 React에 의존하지 않는 순수 함수로 핵심 로직을 분리한다.

### 키 구조

화면(namespace)별로 중첩된 딕셔너리, dot-path로 접근:

```ts
// locales/ko.ts
{
  common: { retry: "다시 시도" },
  start: { title: "다른그림찾기 - 국밥", playButton: "게임 시작", myResult: "내 결과", ranking: "랭킹" },
  preload: { loadError: "이미지를 불러오는데 실패했습니다. 네트워크 상태를 확인해주세요.", retryButton: "다시 시도" },
  gameResult: { /* ... */ },
  dailyResult: { /* ... */ },
}
```

드롭다운에 뜨는 "한국어 / English / 日本語" 표기는 현재 로케일과 무관하게 항상 고정된 값이므로(로케일이 `en`이어도 목록엔 여전히 "한국어"라고 표기) `t()`의 폴백 체인을 탈 필요가 없다. 딕셔너리에 넣지 않고 `types.ts`에 `LOCALE_LABELS: Record<Locale, string>` 상수로 따로 둔다 — 3개 로케일 파일에 같은 값을 중복해서 넣으면 나중에 실수로 어긋날 위험이 있기 때문이다.

`en.ts`/`ja.ts`도 동일한 키 구조를 따른다(`ja.ts`는 지금은 비어 있어도 구조는 동일하게 잡아둬서 나중에 값만 채우면 되도록 한다). `t(locale, 'start.playButton')`처럼 호출하며, 조회 순서는 `locale → en → ko`. 셋 다 없으면 키 문자열 자체를 그대로 반환한다(운영 중 크래시 없이, QA에서는 번역 누락이 눈에 띄도록).

### 로케일 결정 & 영속성

- localStorage 키(예: `gukbap_locale`)에 값이 있으면 그 값을 사용
- 없으면 매 접속마다 `navigator.language`를 `detectLocale()`로 매핑해 사용(시스템 언어 변경에 따라감)
- `detectLocale`: `ko-KR`→`ko`, `en-US`→`en`, `ja`→`ja`, 그 외(예: `fr-FR`)→`en`
- localStorage에 값을 쓰는 시점은 **사용자가 언어 토글에서 수동으로 선택했을 때뿐**이다. 자동 감지 결과는 저장하지 않는다 — 그래야 수동 선택 전에는 시스템 언어 변경을 계속 따라가고, 한 번이라도 수동 선택하면 그 뒤로는 재방문해도 그 선택이 고정된다.

### React 통합

- `LocaleProvider`(Context) — 앱 최상단에서 감싸고 `{ locale, setLocale, t }`를 제공
- 각 화면 컴포넌트는 하드코딩 문자열 대신 `const { t } = useLocale(); t('start.playButton')` 형태로 교체
- `LanguageToggle` 컴포넌트 — 좌상단 고정(`fixed top-2 left-2`), 기존 `PixelPanel` 와이어프레임 톤에 맞춘 지구본 아이콘. 클릭하면 드롭다운으로 "한국어 / English / 日本語" 3개 목록이 펼쳐지고(유튜브 언어 설정 방식), 선택 시 닫히며 즉시 전환

## 에러 처리

- `t()`는 어떤 경우에도 throw하지 않는다. 키가 세 로케일 어디에도 없으면 `[키 문자열]`을 그대로 렌더링한다.
- `ja.ts`가 특정 키를 아직 갖고 있지 않아도 정상 동작(en으로 자동 폴백)하므로, 일본어 번역이 부분적으로만 채워진 상태로 배포해도 문제없다.

## 테스트

- `translate.test.ts`: 정상 조회, `ja`에 키 없을 때 `en` 폴백, `en`에도 없을 때 `ko` 폴백, 셋 다 없을 때 키 문자열 그대로 반환
- `detectLocale.test.ts`: `ko-KR`/`en-US`/`ja`/`fr-FR`(미지원) 각각에 대한 매핑 확인
- 컴포넌트 스냅샷 테스트는 스코프 밖(수동 확인: 언어 토글로 3개 언어 전환 시 각 화면 문구가 올바르게 바뀌는지, 새로고침 후에도 수동 선택이 유지되는지)
