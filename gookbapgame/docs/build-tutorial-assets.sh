#!/usr/bin/env bash
# 튜토리얼 3장의 예시 이미지를 원본 스크린샷에서 잘라 webp로 만든다.
#
# 왜 통짜 스크린샷을 쓰지 않고 자르나:
#   게임판 스크린샷은 650×1394(비율 0.47)로 세로가 매우 길다. 튜토리얼 패널
#   내부 폭이 416px인데, 폭을 맞추면 세로가 893px이 되어 제목·본문·버튼이 들어갈
#   자리가 없다. 반대로 높이를 제한하면 폭이 229px로 줄어 HUD 글씨를 읽을 수 없다.
#   **로딩 화면에서 겪은 것과 같은 함정이다**(세로로 긴 그림을 넓은 상자에 높이로
#   가두면 좌우만 빈다 — AGENTS.md의 `.photo-frame--fit` 절 참고).
#
#   그래서 페이지마다 **본문이 말하는 영역만** 잘라낸다. 각 크롭의 비율이 제각각인
#   것은 의도된 것이고, 화면이 그 비율을 그대로 쓴다(`TUTORIAL_SHOTS`의 aspect).
#
# 왜 마커(링·화살표)를 굽지 않나:
#   **크롭 자체가 마커다.** HUD 띠만 남기면 화면에 힌트·게이지·시간밖에 없어
#   가리킬 것이 없다. 게다가 `what` 장에 링을 치면 "다른 점을 찾아보세요"라고
#   해놓고 정답 위치를 알려주는 꼴이 되어 문장과 그림이 모순된다(2026-08-16, 이란토).
#   마커를 좌표로 얹는 방안도 검토했지만, 그 좌표가 스크린샷에 묶여 UI가 바뀔 때마다
#   다시 재야 하므로 함께 접었다.
#
# 로케일: 세 장 모두 4개 언어가 공용한다. what은 글자가 없고, limit은 "초" 한 글자뿐,
#   CLEAR!는 연출 글자라 애초에 i18n을 타지 않는다(AGENTS.md의 연출 글자 절).
#   예시 스크린샷은 글자가 아니라 **레이아웃을 참고시키는 것**이므로 로케일마다
#   따로 뽑지 않는다(2026-08-16, 이란토).
#
# 원본이 리포 안(docs/tutorial-src/)에 있는 이유:
#   build-intro-assets.sh와 달리 기획 폴더에 원본이 없다. board.png는 이란토가 실기에서
#   찍은 것이고 clear.png는 Playwright로 7단계를 클리어해 뽑은 것이라, 여기서 빠지면
#   크롭을 다시 만들 수 없다. docs/fonts-src/와 같은 취급이다.
#
# 언제 돌리나: 원본 스크린샷을 교체했거나 크롭 범위를 바꿨을 때.
#
# 필요한 것: ImageMagick(magick)
#
#   bash docs/build-tutorial-assets.sh
#
set -euo pipefail

cd "$(dirname "$0")/.."

SRC="docs/tutorial-src"
DEST="public/images/tutorial"

if ! command -v magick >/dev/null 2>&1; then
  echo "ImageMagick(magick)이 필요하다." >&2
  exit 1
fi

for f in board clear; do
  if [ ! -f "$SRC/$f.png" ]; then
    echo "원본이 없다: $SRC/$f.png" >&2
    exit 1
  fi
done

mkdir -p "$DEST"

# ── what: 두 인화지 전체 ────────────────────────────────────────────────
# 위아래 사진을 나란히 보여주는 것 자체가 "비교하라"는 지시다. 상단 HUD와 하단
# 여백을 덜어내 두 사진만 남긴다. 630x1005 (0.63)
magick "$SRC/board.png" -crop 630x1005+10+285 +repage -quality 85 "$DEST/what.webp"

# ── limit: HUD 띠 ──────────────────────────────────────────────────────
# 힌트 3칸 · ? · 시간 게이지 · 남은 초. 가로로 길어 패널 폭을 꽉 채우고,
# 칸이 짧아 본문 3줄이 여유롭게 들어간다. 630x65 (9.69)
# **오답 ✕✕✕는 여기 없다** — 사진 아래에 떨어져 있어 한 띠로 묶을 수 없다.
# 본문이 오답을 설명하므로 그림은 시간·힌트만 보여주고 나머지는 글이 맡는다.
magick "$SRC/board.png" -crop 630x65+10+735 +repage -quality 90 "$DEST/limit.webp"

# ── score: CLEAR! ──────────────────────────────────────────────────────
# 결과 패널(점수 항목)이 아니라 CLEAR! 연출을 쓴다 — 튜토리얼의 핵심은 게임 안에서
# 무엇을 하는지이지 그 뒤에 나오는 집계표가 아니다(2026-08-16, 이란토).
# 뒤 게임판은 로컬 픽스처라 밋밋하고 정답 표시가 잔뜩이라 패널만 남긴다.
# **'결과 발표!' 버튼은 잘라낸다** — 튜토리얼 안에 진짜 버튼처럼 보여서 누르려 든다
# (실물로 확인했다). 글자만 남기면 그럴 일이 없다. 376x116 (3.24)
magick "$SRC/clear.png" -crop 376x116+28+362 +repage -quality 90 "$DEST/score.webp"

echo "--- 튜토리얼 애셋 ---"
for f in what limit score; do
  dim=$(magick identify -format '%wx%h' "$DEST/$f.webp")
  size=$(du -h "$DEST/$f.webp" | cut -f1)
  echo "  OK $DEST/$f.webp ($dim, $size)"
done
