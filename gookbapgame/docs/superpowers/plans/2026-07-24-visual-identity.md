# 비주얼 아이덴티티 리뉴얼 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 보라-핑크 그라디언트 글래스모피즘 프로토타입 UI를, 국밥 상차림 픽셀아트 레퍼런스를 기준으로 한 다크 톤 + 계단(픽셀) 코너 디자인 시스템으로 교체한다.

**Architecture:** CSS 커스텀 프로퍼티(토큰)를 `app/globals.css`에 정의하고, 재사용 가능한 `PixelPanel` 컴포넌트(카드/버튼 공용 2단 계단 코너 마스크)를 만들어 6개 기존 화면(`StartScreen`, `GameScreen`, `WheelScreen`, `StageTransitionModal`, `GameResultScreen`, `DailyResultScreen`)에 적용한다. 레이아웃 구조(상태머신, 데이터 흐름)는 건드리지 않고 스타일만 교체한다.

**Tech Stack:** Next.js 16 / React 19 / Tailwind CSS v4 (`@theme inline`) / `next/font` (google + local) / SVG `mask-image`

## Global Constraints

- 색상은 전부 `app/globals.css`의 CSS 커스텀 프로퍼티(토큰)를 참조한다. 컴포넌트 파일에 색상 hex 값을 직접 쓰지 않는다.
- 다크 팔레트가 기본값이다 (스펙 `2026-07-24-visual-identity-design.md`의 "다크 테마" 표 값 그대로):
  `--bg:#1C1510` `--surface:#29201A` `--wood:#B98A54` `--wood-dark:#D9BC8E` `--accent:#E9B94A` `--accent-ink:#2E2620` `--ink:#F3E9DC` `--muted:#8A7A64` `--amber:#E28A3D`
- 기존 `backdrop-blur`/보라-핑크 그라디언트 글래스모피즘은 전부 제거한다.
- 매 태스크 완료 후 반드시: `npx tsc --noEmit` 0 errors, `npm test` 전부 통과, `npm run dev`로 해당 화면 수동 시각 확인.
- 이번 플랜은 실제 라인 아이콘 세트를 새로 디자인하지 않는다 — 브레인스토밍에서 방향만 논의했고 실제 아이콘 아트가 확정되지 않았기 때문에, 기존 이모지(🔄 등)는 이번 플랜에서 그대로 둔다(후속 스펙으로 이관).
- 코너 마스크는 스펙이 "목표"로 언급한 `mask-composite` 서브트랙트 방식(완전 유동 크기) 대신, **고정 참조 크기 SVG를 `mask-size:100% 100%`로 늘리는 방식**을 쓴다. 카드/버튼 크기가 참조 크기에서 ±수십 px 벗어나도 계단 노치가 1.5~6px 수준이라 비율 오차가 시각적으로 감지되지 않고, `mask-composite`의 Safari 키워드 불일치 리스크를 완전히 피할 수 있다. (스펙의 "열린 질문"을 이 플랜에서 이렇게 해소한다.)

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `app/globals.css` | 색 토큰, 폰트 변수, 코너 마스크 유틸리티 클래스 |
| `app/layout.tsx` | 폰트 로딩(`next/font`), `lang="ko"` |
| `public/fonts/Galmuri11.woff2` | 픽셀 폰트 파일(직접 다운로드해서 배치) |
| `public/masks/pixel-card.svg` / `pixel-card-inner.svg` | 카드용 계단 코너 마스크(바깥/안쪽) |
| `public/masks/pixel-btn.svg` / `pixel-btn-inner.svg` | 버튼(아웃라인)용 계단 코너 마스크(바깥/안쪽) |
| `public/masks/pixel-btn-solid.svg` | 버튼(솔리드, 단일 레이어)용 계단 코너 마스크 |
| `app/components/PixelPanel.tsx` | 카드/아웃라인 버튼 공용 2단 계단 코너 래퍼 컴포넌트 |
| `app/components/StartScreen.tsx` | Task 3에서 토큰/PixelPanel 적용 |
| `app/components/StageTransitionModal.tsx` | Task 4에서 적용 |
| `app/components/GameResultScreen.tsx`, `DailyResultScreen.tsx` | Task 5에서 적용 |
| `app/components/GameScreen.tsx` | Task 6에서 적용 |
| `app/components/WheelScreen.tsx` | Task 7에서 적용 |

---

### Task 1: 디자인 토큰 + 폰트

**Files:**
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`
- Create: `public/fonts/Galmuri11.woff2` (직접 다운로드)

**Interfaces:**
- Produces: CSS 커스텀 프로퍼티 `--bg` `--surface` `--wood` `--wood-dark` `--accent` `--accent-ink` `--ink` `--muted` `--amber`, 폰트 CSS 변수 `--font-body`(Noto Sans KR) `--font-pixel`(Galmuri11)

- [ ] **Step 1: 픽셀 폰트 파일 확보**

  https://github.com/quiple/galmuri 릴리즈(OFL 라이선스, 한글 지원 도트 폰트)에서 `Galmuri11.woff2`를 받아 `public/fonts/Galmuri11.woff2`로 저장한다. 이 저장소가 대신 받아둘 수 없는 바이너리 자산이라 수동 단계다.

- [ ] **Step 2: `app/globals.css` 토큰/폰트 변수 교체**

```css
@import "tailwindcss";

:root {
  --bg: #1C1510;
  --surface: #29201A;
  --wood: #B98A54;
  --wood-dark: #D9BC8E;
  --accent: #E9B94A;
  --accent-ink: #2E2620;
  --ink: #F3E9DC;
  --muted: #8A7A64;
  --amber: #E28A3D;
}

@theme inline {
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-wood: var(--wood);
  --color-wood-dark: var(--wood-dark);
  --color-accent: var(--accent);
  --color-accent-ink: var(--accent-ink);
  --color-ink: var(--ink);
  --color-muted: var(--muted);
  --color-amber: var(--amber);
  --font-body: var(--font-noto-sans-kr);
  --font-pixel: var(--font-galmuri);
}

body {
  background: var(--bg);
  color: var(--ink);
  font-family: var(--font-body), -apple-system, "Apple SD Gothic Neo", sans-serif;
}
```

- [ ] **Step 3: `app/layout.tsx`에서 폰트 로딩 교체**

```tsx
import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const notoSansKR = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const galmuri = localFont({
  src: "../public/fonts/Galmuri11.woff2",
  variable: "--font-galmuri",
  display: "swap",
});

export const metadata: Metadata = {
  title: "다른그림찾기 - 국밥",
  description: "국밥 한 상차림 다른그림찾기 게임",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${notoSansKR.variable} ${galmuri.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: 타입/테스트/시각 확인**

```bash
npx tsc --noEmit
npm test
npm run dev
```

`http://localhost:3000`을 열어 배경이 `#1C1510`(짙은 갈색)으로, 본문 텍스트가 크림색으로 바뀌었는지 확인한다(아직 컴포넌트별 스타일은 안 바뀌어서 화면 자체는 어색해 보여도 정상이다 — 다음 태스크에서 교체).

- [ ] **Step 5: 커밋**

```bash
git add app/globals.css app/layout.tsx public/fonts/Galmuri11.woff2
git commit -m "feat: 다크 토큰/폰트 시스템 도입"
```

---

### Task 2: 코너 마스크 에셋 + `PixelPanel` 컴포넌트 (StartScreen에 적용)

**Files:**
- Create: `public/masks/pixel-card.svg`, `public/masks/pixel-card-inner.svg`, `public/masks/pixel-btn.svg`, `public/masks/pixel-btn-inner.svg`, `public/masks/pixel-btn-solid.svg`
- Modify: `app/globals.css` (코너 마스크 유틸리티 클래스)
- Create: `app/components/PixelPanel.tsx`
- Modify: `app/components/StartScreen.tsx`

**Interfaces:**
- Consumes: Task 1의 색 토큰(`--wood`, `--surface`, `--accent`, `--accent-ink`, `--ink`, `--amber`)
- Produces: `<PixelPanel size="card" | "btn">` 컴포넌트, CSS 클래스 `.pixel-mask-btn-solid`(솔리드 버튼 단일 레이어용)

- [ ] **Step 1: 마스크 SVG 5개 생성**

이중 레이어(바깥 나무색 + 안쪽 배경색)는 "완전히 동일한 계단 도형을 재사용하고, 링 두께는 padding으로만 만든다" 원칙을 따른다 — 바깥/안쪽 각각 따로 축소 계산하지 않는다(설계 스펙에서 이게 안 맞물리는 버그였음이 확인됨). 아래 5개 파일은 이미 이 원칙대로 좌표를 산출해둔 것이다.

`public/masks/pixel-card.svg` (카드 바깥, 참조 크기 360×240, 계단 offset 1.5/2.5/6):
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 240">
  <polygon shape-rendering="crispEdges" fill="#fff" points="0,234 1.5,234 1.5,237.5 2.5,237.5 2.5,238.5 6,238.5 6,240 354,240 354,238.5 357.5,238.5 357.5,237.5 358.5,237.5 358.5,234 360,234 360,6 358.5,6 358.5,2.5 357.5,2.5 357.5,1.5 354,1.5 354,0 6,0 6,1.5 2.5,1.5 2.5,2.5 1.5,2.5 1.5,6 0,6"/>
</svg>
```

`public/masks/pixel-card-inner.svg` (카드 안쪽, 356×236 — 바깥에서 2px씩 줄인 크기, 같은 offset 재사용):
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 356 236">
  <polygon shape-rendering="crispEdges" fill="#fff" points="0,230 1.5,230 1.5,233.5 2.5,233.5 2.5,234.5 6,234.5 6,236 350,236 350,234.5 353.5,234.5 353.5,233.5 354.5,233.5 354.5,230 356,230 356,6 354.5,6 354.5,2.5 353.5,2.5 353.5,1.5 350,1.5 350,0 6,0 6,1.5 2.5,1.5 2.5,2.5 1.5,2.5 1.5,6 0,6"/>
</svg>
```

`public/masks/pixel-btn.svg` (버튼 아웃라인 바깥, 참조 크기 160×44, offset 1/1.5/4):
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 44">
  <polygon shape-rendering="crispEdges" fill="#fff" points="0,40 1,40 1,42.5 1.5,42.5 1.5,43 4,43 4,44 156,44 156,43 158.5,43 158.5,42.5 159,42.5 159,40 160,40 160,4 159,4 159,1.5 158.5,1.5 158.5,1 156,1 156,0 4,0 4,1 1.5,1 1.5,1.5 1,1.5 1,4 0,4"/>
</svg>
```

`public/masks/pixel-btn-inner.svg` (버튼 아웃라인 안쪽, 157×41 — 바깥에서 1.5px씩 줄인 크기):
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 157 41">
  <polygon shape-rendering="crispEdges" fill="#fff" points="0,37 1,37 1,39.5 1.5,39.5 1.5,40 4,40 4,41 153,41 153,40 155.5,40 155.5,39.5 156,39.5 156,37 157,37 157,4 156,4 156,1.5 155.5,1.5 155.5,1 153,1 153,0 4,0 4,1 1.5,1 1.5,1.5 1,1.5 1,4 0,4"/>
</svg>
```

`public/masks/pixel-btn-solid.svg` (솔리드 버튼용 — 단일 레이어라 `pixel-btn.svg`와 동일한 도형을 그대로 재사용):
```bash
cp public/masks/pixel-btn.svg public/masks/pixel-btn-solid.svg
```

- [ ] **Step 2: `app/globals.css`에 코너 마스크 유틸리티 추가**

```css
.pixel-frame {
  background: var(--wood);
}
.pixel-frame--card {
  padding: 2px;
  mask-image: url(/masks/pixel-card.svg);
  -webkit-mask-image: url(/masks/pixel-card.svg);
  mask-size: 100% 100%;
  -webkit-mask-size: 100% 100%;
  mask-repeat: no-repeat;
  -webkit-mask-repeat: no-repeat;
}
.pixel-frame--btn {
  padding: 1.5px;
  mask-image: url(/masks/pixel-btn.svg);
  -webkit-mask-image: url(/masks/pixel-btn.svg);
  mask-size: 100% 100%;
  -webkit-mask-size: 100% 100%;
  mask-repeat: no-repeat;
  -webkit-mask-repeat: no-repeat;
}
.pixel-frame-inner {
  background: var(--surface);
  height: 100%;
}
.pixel-frame-inner--card {
  mask-image: url(/masks/pixel-card-inner.svg);
  -webkit-mask-image: url(/masks/pixel-card-inner.svg);
  mask-size: 100% 100%;
  -webkit-mask-size: 100% 100%;
  mask-repeat: no-repeat;
  -webkit-mask-repeat: no-repeat;
  padding: 1.5rem 1.25rem;
}
.pixel-frame-inner--btn {
  mask-image: url(/masks/pixel-btn-inner.svg);
  -webkit-mask-image: url(/masks/pixel-btn-inner.svg);
  mask-size: 100% 100%;
  -webkit-mask-size: 100% 100%;
  mask-repeat: no-repeat;
  -webkit-mask-repeat: no-repeat;
  padding: .7rem .6rem;
}
.pixel-mask-btn-solid {
  mask-image: url(/masks/pixel-btn-solid.svg);
  -webkit-mask-image: url(/masks/pixel-btn-solid.svg);
  mask-size: 100% 100%;
  -webkit-mask-size: 100% 100%;
  mask-repeat: no-repeat;
  -webkit-mask-repeat: no-repeat;
}
```

- [ ] **Step 3: `app/components/PixelPanel.tsx` 작성**

```tsx
interface PixelPanelProps {
  size: "card" | "btn";
  className?: string;
  children: React.ReactNode;
}

export default function PixelPanel({ size, className, children }: PixelPanelProps) {
  return (
    <div className={`pixel-frame pixel-frame--${size} ${className ?? ""}`}>
      <div className={`pixel-frame-inner pixel-frame-inner--${size}`}>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: `StartScreen.tsx`을 토큰 + `PixelPanel`로 교체**

```tsx
"use client";

import PixelPanel from "./PixelPanel";

interface StartScreenProps {
  nickname: string;
  onRegenerateNickname: () => void;
  onStart: () => void;
  isLoading: boolean;
  loadError: string | null;
}

export default function StartScreen({
  nickname,
  onRegenerateNickname,
  onStart,
  isLoading,
  loadError,
}: StartScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-bg text-ink p-6">
      <PixelPanel size="card" className="max-w-md w-full">
        <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: "var(--font-pixel)" }}>
          다른그림찾기
        </h1>
        <div className="flex items-center justify-center gap-2 mb-8">
          <span className="text-ink">{nickname} 님 환영합니다</span>
          <button
            type="button"
            onClick={onRegenerateNickname}
            aria-label="닉네임 다시 생성"
            className="text-xl"
          >
            🔄
          </button>
        </div>
        {loadError && <p className="text-red-400 mb-4">{loadError}</p>}
        <button
          onClick={onStart}
          disabled={isLoading}
          className="pixel-mask-btn-solid w-full py-4 px-6 bg-accent text-accent-ink text-xl font-bold transition-opacity disabled:opacity-50 disabled:cursor-not-allowed mb-4"
        >
          {isLoading ? "로딩 중..." : "게임 시작"}
        </button>
        <div className="flex gap-3 w-full">
          <PixelPanel size="btn" className="flex-1">
            <button type="button" className="w-full font-bold text-ink">내 결과</button>
          </PixelPanel>
          <PixelPanel size="btn" className="flex-1">
            <button type="button" className="w-full font-bold text-ink">랭킹</button>
          </PixelPanel>
        </div>
      </PixelPanel>
    </div>
  );
}
```

- [ ] **Step 5: 타입/테스트/시각 확인**

```bash
npx tsc --noEmit
npm test
npm run dev
```

`http://localhost:3000`에서 Start 화면 카드에 계단 코너와 나무색 테두리가 보이는지, "게임 시작" 버튼이 골든 옐로(`--accent`)로 나오는지, 확대해도 모서리가 흐려지지 않는지 확인한다.

- [ ] **Step 6: 커밋**

```bash
git add public/masks app/globals.css app/components/PixelPanel.tsx app/components/StartScreen.tsx
git commit -m "feat: 계단 코너 마스크 유틸리티 도입, StartScreen에 적용"
```

---

### Task 3: `StageTransitionModal` 적용

**Files:**
- Modify: `app/components/StageTransitionModal.tsx`

**Interfaces:**
- Consumes: `PixelPanel`(Task 2), 색 토큰

- [ ] **Step 1: 기존 파일 확인 후 블러 오버레이 제거, `PixelPanel` 적용**

기존 `StageTransitionModal.tsx`의 오버레이 배경(검정 반투명 + `backdrop-blur`)을 우드톤 반투명으로, 모달 카드를 `PixelPanel size="card"`로 교체한다. 버튼(`onNext`)은 Task 2의 솔리드 버튼 클래스(`pixel-mask-btn-solid bg-accent text-accent-ink`)를 그대로 재사용한다. 로딩/에러 텍스트는 색만 토큰으로 바꾸고 문구는 그대로 둔다(`isLoading`, `loadError` prop 시그니처 변경 없음).

배경 오버레이 예시:
```tsx
<div className="fixed inset-0 bg-[#1C1510]/80 flex items-center justify-center z-50">
```

- [ ] **Step 2: 타입/테스트/시각 확인**

```bash
npx tsc --noEmit
npm test
npm run dev
```

Stage를 클리어하거나 타임아웃시켜 모달이 뜨는지, 카드 스타일이 StartScreen과 일관되는지 확인한다.

- [ ] **Step 3: 커밋**

```bash
git add app/components/StageTransitionModal.tsx
git commit -m "feat: StageTransitionModal에 다크 토큰/계단 코너 적용"
```

---

### Task 4: `GameResultScreen` / `DailyResultScreen` 적용 (픽셀 폰트)

**Files:**
- Modify: `app/components/GameResultScreen.tsx`
- Modify: `app/components/DailyResultScreen.tsx`

**Interfaces:**
- Consumes: `PixelPanel`(Task 2), 색 토큰, `--font-pixel`(Task 1)

- [ ] **Step 1: 두 컴포넌트에 `PixelPanel` + 토큰 적용, 점수/국밥력 텍스트만 픽셀 폰트로**

점수(`scoreBreakdown`/`MAX_TOTAL_SCORE` 등 기존 props)와 국밥력(`gukbapTier`) 텍스트에만 `style={{ fontFamily: "var(--font-pixel)" }}`를 적용하고, 나머지 텍스트(라벨, 버튼)는 기존 `--font-body` 그대로 둔다 — 스펙이 "픽셀 폰트는 딱 두 곳에만" 제한했기 때문이다. 국밥력 텍스트 색은 `--amber`.

- [ ] **Step 2: 타입/테스트/시각 확인**

```bash
npx tsc --noEmit
npm test
npm run dev
```

게임을 완주해 결과 화면까지 도달시켜, 큰 점수/국밥력 숫자만 도트체로 보이고 나머지는 일반 산세리프로 남아있는지 확인한다.

- [ ] **Step 3: 커밋**

```bash
git add app/components/GameResultScreen.tsx app/components/DailyResultScreen.tsx
git commit -m "feat: 결과 화면에 다크 토큰/픽셀 폰트 적용"
```

---

### Task 5: `GameScreen` 상단 바 적용

**Files:**
- Modify: `app/components/GameScreen.tsx`

**Interfaces:**
- Consumes: 색 토큰

- [ ] **Step 1: 상단 타이머/스테이지 표시 바만 카드 톤으로, 배경은 `--bg`보다 어둡게**

`GameScreen.tsx`의 레이아웃/타이머 로직(`timeLimitSec`, `onStageTimeout` 등)은 건드리지 않는다. 최상위 배경색만 `--bg`보다 한 단계 어두운 값(예: `#150F0B`)으로, 상단 타이머 바 배경만 `--surface` + `--wood` 테두리로 바꾼다. 다른그림찾기 이미지 두 장 자체(레이아웃/크기)는 변경하지 않는다.

- [ ] **Step 2: 타입/테스트/시각 확인**

```bash
npx tsc --noEmit
npm test
npm run dev
```

게임 플레이 화면에서 상단 바만 카드 톤으로 바뀌고 이미지 비교 영역은 그대로인지 확인한다.

- [ ] **Step 3: 커밋**

```bash
git add app/components/GameScreen.tsx
git commit -m "feat: GameScreen 상단 바에 다크 토큰 적용"
```

---

### Task 6: `WheelScreen` 래퍼 적용

**Files:**
- Modify: `app/components/WheelScreen.tsx`

**Interfaces:**
- Consumes: `PixelPanel`(Task 2), 색 토큰

- [ ] **Step 1: 휠 자체를 감싸는 카드/버튼만 토큰 적용**

휠 그래픽 자체(원형 UI)는 이번 플랜 범위 밖(스펙의 "다음으로 이관" 참조) — 지금 상태(정적 placeholder) 그대로 둔다. 휠을 감싸는 카드/버튼만 `PixelPanel`/토큰으로 교체한다.

- [ ] **Step 2: 타입/테스트/시각 확인**

```bash
npx tsc --noEmit
npm test
npm run dev
```

- [ ] **Step 3: 커밋**

```bash
git add app/components/WheelScreen.tsx
git commit -m "feat: WheelScreen 래퍼에 다크 토큰 적용"
```

---

## Self-Review

**Spec coverage:**
- 컬러/타이포 토큰 → Task 1
- 코너 처리 기법(SVG mask + crispEdges) → Task 2, 스펙의 `mask-composite` 유동 크기 목표는 Global Constraints에서 고정-참조-크기 방식으로 의도적으로 단순화(이유 명시)
- 6개 화면 적용 → Task 2(Start), 3(Modal), 4(Result×2), 5(Game), 6(Wheel)
- 픽셀아트 히어로 이미지 사용 규칙 — 스펙엔 "카드 안에 원본 회색 배경 그대로 크롭해 넣는다"고만 되어 있고 이번 플랜의 6개 화면 중 실제로 히어로 이미지를 배치하는 화면이 지정되어 있지 않다. **갭:** 이 이미지를 어느 화면(StartScreen 배경? 결과 화면?)에 실제로 넣을지는 스펙에 명시되지 않았으므로 이번 플랜에서는 제외했다 — 필요하면 별도 태스크로 추가해야 한다.
- 다크 테마 기본값 → Global Constraints + Task 1

**Placeholder scan:** "TBD"/"나중에" 문구 없음. Task 1의 폰트 파일 확보만 수동 단계이나 정확한 출처/파일명을 명시했으므로 placeholder가 아니다.

**Type consistency:** `PixelPanel`의 `size` prop(`"card" | "btn"`)과 CSS 클래스명(`pixel-frame--card`/`--btn`, `pixel-frame-inner--card`/`--btn`)이 Task 2~6 전체에서 동일하게 쓰인다. 기존 컴포넌트 props 시그니처(`isLoading`, `loadError`, `gukbapTier` 등)는 전혀 변경하지 않는다.
