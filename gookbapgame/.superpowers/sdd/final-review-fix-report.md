# Final whole-branch review — fix report

Post-hoc cleanup pass on branch `worktree-visual-identity-renewal`, addressing two findings from the final review of the 6-task dark "gukbap" visual identity restyle. Both findings were className regressions introduced during `PixelPanel` conversion; no logic changed.

## Changes

**1. `text-center` restored on 3 card screens** (dropped when their card `div` was converted to `<PixelPanel size="card">`; `StageTransitionModal.tsx` and `WheelScreen.tsx` already had it correctly):
- `app/components/StartScreen.tsx` — `<PixelPanel size="card" className="max-w-md w-full">` → added `text-center`.
- `app/components/GameResultScreen.tsx` — `<PixelPanel size="card" className="max-w-sm w-full">` → added `text-center`. The `<dl>` breakdown rows keep their own `text-left` (unchanged, correct — centered card, left-aligned key/value rows).
- `app/components/DailyResultScreen.tsx` — `<PixelPanel size="card" className="max-w-sm w-full">` → added `text-center`.

**2. `active:scale-95` restored on 2 CTA buttons** (dropped during conversion; `GameResultScreen.tsx`'s and `WheelScreen.tsx`'s "다음" buttons already had it):
- `app/components/StartScreen.tsx` — "게임 시작" button (`disabled={isLoading}`), added `active:scale-95` alongside existing `disabled:opacity-50 disabled:cursor-not-allowed`.
- `app/components/StageTransitionModal.tsx` — "다음"/"재도전" button (`disabled={isLoading}`), same addition.

No other findings were touched, per instructions — the unused `--wood-dark` token and the non-tokenized `bg-black/40` checkmark overlay in `GameScreen.tsx` were explicitly left as-is.

## Verification

1. **`npx tsc --noEmit`** — 0 errors.
2. **`npm test`** — 27/27 pass (composeScene, stageConfig, nickname, gameSelection, pipeline-visual). No test targets styling directly; this is a regression guard only, as expected.
3. **Visual check** — built 4 temporary uncommitted preview routes (`app/preview-start`, `app/preview-result`, `app/preview-daily`, `app/preview-modal`, each rendering the target component directly with representative props), served via `next dev` on port 3010, screenshotted headless with `playwright-core` + the repo's cached Chromium (`~/.cache/ms-playwright/chromium-1232/chrome-linux64/chrome`):
   - StartScreen, GameResultScreen, DailyResultScreen: title/text now centered inside the card; GameResultScreen's Stage/완주/시간/정답행진 rows remain left-aligned within the centered card, as intended.
   - StartScreen "게임 시작" and StageTransitionModal "다음" buttons: captured a screenshot mid-`mousedown` on each — button visibly shrinks/insets relative to its resting-state screenshot, confirming `active:scale-95` fires.
   - All 4 preview routes and the temporary screenshot script were deleted before committing; `git status` shows only the 4 intended component files changed.
