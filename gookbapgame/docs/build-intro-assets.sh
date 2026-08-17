#!/usr/bin/env bash
# 시작 화면 슬라이드·시간대 배경 원본을 웹용 webp로 변환한다.
#
# 왜 두 그룹을 다르게 다루나:
#   - 배경 6장(city_*)은 **원본을 그대로 복사한다(줄이지 않는다).** 세로 화면에서
#     object-cover가 좌우를 잘라내는 것을 전제로 하므로 해상도 여유가 필요하다
#     (설계 문서 20260815-intro-visuals-and-prewarm-design.md 4절 참고).
#
#     **원본이 클수록 좋다 — 압축 품질보다 해상도가 먼저다.** 고DPI 폰에서는
#     이미지가 확대되므로(iPhone 16 Pro 390×844 DPR3 → 4501×2532가 있어야 등배)
#     원본이 작으면 아무리 품질을 올려도 뭉개진다. 실측(2026-08-15, city_day를
#     그 기기 조건으로 렌더한 뒤 라플라시안 분산):
#       1920 q92        20.5   (2.34배 확대)
#       1920 q92 업스케일 92.9   (2.34배 확대 — 선명하게 만들어도 확대에서 잃는다)
#       3840 q75       231.2   (1.17배 확대)
#     **품질을 92→75로 낮췄는데도 4K가 11배 선명하고 용량은 사실상 같다**
#     (6장 1729KB → 1733KB). 압축 아티팩트는 확대되면 함께 뭉개져 눈에 안 띄지만
#     없는 픽셀은 만들 수 없기 때문이다.
#     **줄이는 처리를 넣지 말 것** — 없는 픽셀은 어떤 리샘플링 필터로도 못 만든다.
#
#     **현재는 QHD(2560×1440)다**(2026-08-17 마스터 교체분). 기기 확대가 1.17배에서
#     1.76배로 커져 위 표가 경고하는 구간으로 들어왔고, 기기 조건에서 잰 값도
#     전 장이 낮아졌다(94~232 → 24~124). 그림이 통째로 바뀌었으므로(구도가 다르다)
#     이 숫자들을 4K 시절과 1:1로 비교할 수는 없다 — 다만 확대 배율이 커진 것은
#     그림과 무관한 사실이라 위 수치와 함께 남겨둔다.
#
#     **그럼에도 QHD 그대로 가기로 확정했다(2026-08-17, 이란토).** 위 표를 근거로
#     4K 재출력을 제안했으나, **업스케일한 판본이 실제로 품질이 티가 났다는 것을
#     이란토가 직접 확인했다**(`main_bg/upscaled/`가 그 시도의 흔적이다).
#     확대 배율이 커지는 손해보다 원본 화질이 확실한 쪽을 택한 것이다.
#     **이 결정을 수치만 보고 뒤집지 말 것** — 표의 "1920 업스케일 92.9"가 바로
#     그 함정이다(선명도 지표는 올라가지만 눈에는 뭉개져 보인다).
#     용량도 함께 늘었다: 6장 1733KB → 2666KB. 방문자는 1장만 받지만 그 1장이
#     276~352KB에서 408~472KB가 됐다.
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
# 배경 원본은 **마스터링 날짜 폴더**로 간다(2026-08-17 교체분부터). 새 마스터가 나오면
# 이 기본값을 그 날짜로 올릴 것 — 폴더를 덮어쓰지 않는 것이 이란토의 작업 방식이다.
BG_SRC="${INTRO_BG_SRC:-/home/iranto/Cloud/문서/작업/100. 기획/2026_일경험 완뚝/gfx/황령산 전망대_parts/20260817/mastered}"

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

# ── 배경 6장: 원본 그대로 복사 (절대 줄이지 않는다) ───────────────────────
#
# **원본 파일명과 리포 파일명이 다르다.** 원본은 `sunset`인데 리포·코드는 `evening`이다
# (`DaylightStage` 유니언 타입, `daylight.ts`의 구간 표, `bgUrl`의 `city_${stage}`).
# 코드 쪽 이름을 바꾸면 타입·테스트·문서 표를 전부 건드려야 하므로 여기서 매핑한다.
BG_MAP=(
  "dawn:city_dawn"
  "morning:city_morning"
  "day:city_day"
  "sunset:city_evening"
  "night:city_night"
  "midnight:city_midnight"
)

for entry in "${BG_MAP[@]}"; do
  from="${entry%%:*}"
  name="${entry##*:}"
  src="$BG_SRC/$from.webp"
  if [ ! -f "$src" ]; then
    echo "  건너뜀 (원본 없음): $from.webp" >&2
    continue
  fi
  cp "$src" "$BG_DEST/$name.webp"
  # 원본을 그대로 넣으므로 **크기를 찍어준다.** 나중에 더 큰 원본으로 교체하면
  # 용량이 조용히 뛰는데(방문자는 1장만 받지만 그 1장이 커진다) 그때 여기서 보인다.
  dim=$(magick identify -format '%wx%h' "$BG_DEST/$name.webp" 2>/dev/null || echo '?')
  echo "  OK $BG_DEST/$name.webp ($dim, 원본 그대로 복사)"
done

echo "--- 슬라이드 ---"
ls -lh "$SLIDES_DEST"
echo "--- 배경 ---"
ls -lh "$BG_DEST"
