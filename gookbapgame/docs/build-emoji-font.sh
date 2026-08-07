#!/usr/bin/env bash
# 흑백 이모지 서브셋 폰트를 다시 만든다.
#
# 언제 돌리나: `app/lib/couponEmoji.ts`에 이모지를 새로 추가했을 때.
# 서브셋에 없는 이모지는 화면에서 두부(􏿽)로 보인다 — 에러가 아니라 조용히 깨진다.
#
# scripts/가 아니라 docs/에 있는 이유는 test-db와 같다: scripts/는 .gitignore
# 대상(.gitignore:48)이라 클린 체크아웃하면 사라진다.
#
# 필요한 것: fonttools (pacman -S python-fonttools, brotli 포함), curl
#
#   bash docs/build-emoji-font.sh
#
set -euo pipefail

cd "$(dirname "$0")/.."
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# 실을 이모지. 현재 쓰는 것 + 음식점 쿠폰 맥락에서 나올 법한 것들을 미리 넣어둔다.
# 매번 폰트를 다시 만들지 않아도 되도록 여유를 둔 것이고, 63자에 21KB라 부담이 없다.
# 새 이모지를 매핑 표에 넣었다면 여기에도 더한 뒤 이 스크립트를 돌릴 것.
UNICODES="U+2139,U+2615,U+2699,U+2705,U+274C,U+27A1,U+2B05,U+2B50,U+FE0F,\
U+1F310,U+1F336,U+1F344,U+1F356,U+1F357,U+1F358,U+1F359,U+1F35A,U+1F35B,U+1F35C,\
U+1F361,U+1F362,U+1F364,U+1F365,U+1F366,U+1F369,U+1F36A,U+1F36B,U+1F36C,U+1F370,\
U+1F371,U+1F372,U+1F373,U+1F374,U+1F375,U+1F376,U+1F37A,U+1F37D,U+1F381,U+1F389,\
U+1F3AB,U+1F3C6,U+1F4A7,U+1F504,U+1F507,U+1F50A,U+1F525,U+1F944,U+1F953,U+1F954,U+1F955,U+1F957,\
U+1F958,U+1F95A,U+1F95B,U+1F95F,U+1F962,U+1F964,U+1F969,U+1F96C,U+1F9C1,U+1F9C2,\
U+1F9C3,U+1F9C4,U+1F9C5,U+1F9CB"

echo "1/3 Noto Emoji(흑백 가변 폰트) 내려받는 중..."
curl -sL --fail --max-time 120 -o "$WORK/NotoEmoji.ttf" \
  "https://raw.githubusercontent.com/google/fonts/main/ofl/notoemoji/NotoEmoji%5Bwght%5D.ttf"

# 가변 폰트 그대로는 서브셋되지 않는다. 하나의 굵기로 고정한 뒤 잘라낸다.
echo "2/3 wght=400으로 고정하는 중..."
fonttools varLib.instancer "$WORK/NotoEmoji.ttf" wght=400 -o "$WORK/NotoEmoji-400.ttf" >/dev/null

echo "3/3 서브셋 + woff2 변환 중..."
pyftsubset "$WORK/NotoEmoji-400.ttf" \
  --unicodes="$UNICODES" \
  --flavor=woff2 \
  --output-file=public/fonts/NotoEmoji-subset.woff2 \
  --layout-features='' \
  --no-hinting \
  --desubroutinize

ls -lh public/fonts/NotoEmoji-subset.woff2
echo "완료. 라이선스(OFL)는 public/fonts/LICENSE-NotoEmoji.txt에 있다."
