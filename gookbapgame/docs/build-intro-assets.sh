#!/usr/bin/env bash
# 시작 화면 슬라이드·시간대 배경 원본을 웹용 webp로 변환한다.
#
# 왜 두 그룹을 다르게 다루나:
#   - 배경 6장(city_*)은 **원본 1920×1080 그대로 복사한다.** 세로 화면에서
#     object-cover가 좌우를 잘라내는 것을 전제로 하므로 해상도 여유가 필요하다
#     (설계 문서 20260815-intro-visuals-and-prewarm-design.md 4절 참고).
#   - 슬라이드 3장은 고정 높이 컨테이너에 object-contain으로 작게 들어가므로
#     폭 800 상한으로 줄인다.
#
# 원본은 기획 폴더에 그대로 두고 리포에는 변환본만 들어간다(build-sfx.sh와 같은 방식).
#
# 언제 돌리나: 기획 폴더의 인트로 슬라이드·시간대 배경이 새로 추가되거나 교체되었을 때.
#
# 필요한 것: ImageMagick(magick) — libwebp가 내장돼 있어 cwebp 없이도 webp를 읽고 쓴다.
#
#   bash docs/build-intro-assets.sh
#
set -euo pipefail

cd "$(dirname "$0")/.."

SLIDES_SRC="${INTRO_SLIDES_SRC:-/home/iranto/Cloud/문서/작업/100. 기획/2026_일경험 완뚝/gfx/intro/slides}"
BG_SRC="${INTRO_BG_SRC:-/home/iranto/Cloud/문서/작업/100. 기획/2026_일경험 완뚝/gfx/황령산 전망대_parts/main_bg}"

SLIDES_DEST="public/images/intro"
BG_DEST="public/images/bg"

if [ ! -d "$SLIDES_SRC" ]; then
  echo "슬라이드 원본 폴더를 찾을 수 없다: $SLIDES_SRC" >&2
  echo "다른 위치라면 INTRO_SLIDES_SRC 환경변수로 지정할 것." >&2
  exit 1
fi

if [ ! -d "$BG_SRC" ]; then
  echo "배경 원본 폴더를 찾을 수 없다: $BG_SRC" >&2
  echo "다른 위치라면 INTRO_BG_SRC 환경변수로 지정할 것." >&2
  exit 1
fi

if ! command -v magick >/dev/null 2>&1; then
  echo "ImageMagick(magick)이 필요하다." >&2
  exit 1
fi

mkdir -p "$SLIDES_DEST" "$BG_DEST"

# ── 슬라이드 3장: 폭 800 상한 + webp 재인코딩 (비율 유지) ─────────────────
SLIDES=(1953_brand_1 1953_grandmother_mrs-rah table)

for name in "${SLIDES[@]}"; do
  src="$SLIDES_SRC/$name.webp"
  if [ ! -f "$src" ]; then
    echo "  건너뜀 (원본 없음): $name.webp" >&2
    continue
  fi
  # '800x800>' : 가로·세로 어느 쪽도 800을 넘지 않게, 이미 작으면 확대하지 않는다.
  # 실제로는 셋 다 가로가 더 크거나 정사각(1280x1502/770x770/1084x1012)이라
  # 폭 기준 축소로 동작한다.
  magick "$src" -resize '800x800>' -quality 85 "$SLIDES_DEST/$name.webp"
  echo "  OK $SLIDES_DEST/$name.webp"
done

# ── 배경 6장: 원본 1920×1080 그대로 복사 (절대 줄이지 않는다) ─────────────
BG_NAMES=(city_dawn city_morning city_day city_evening city_night city_midnight)

for name in "${BG_NAMES[@]}"; do
  src="$BG_SRC/$name.webp"
  if [ ! -f "$src" ]; then
    echo "  건너뜀 (원본 없음): $name.webp" >&2
    continue
  fi
  cp "$src" "$BG_DEST/$name.webp"
  echo "  OK $BG_DEST/$name.webp (원본 그대로 복사)"
done

echo "--- 슬라이드 ---"
ls -lh "$SLIDES_DEST"
echo "--- 배경 ---"
ls -lh "$BG_DEST"
