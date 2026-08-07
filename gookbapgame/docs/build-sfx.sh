#!/usr/bin/env bash
# 효과음 원본(opus)을 웹용 m4a로 변환한다.
#
# 왜 변환하나: 원본은 Ogg 컨테이너의 Opus인데 **iOS Safari가 .ogg를 재생하지 못한다.**
# 모바일 웹 게임이라 아이폰에서 안 들리면 의미가 없어서 AAC(m4a)로 통일했다.
# 원본 opus는 기획 폴더에 그대로 두고, 리포에는 변환본만 들어간다.
#
# 언제 돌리나: 기획 폴더의 효과음이 새로 추가되거나 교체되었을 때.
#
# 필요한 것: ffmpeg
#
#   bash docs/build-sfx.sh
#
set -euo pipefail

cd "$(dirname "$0")/.."

SRC="${SFX_SRC:-/home/iranto/Cloud/문서/작업/100. 기획/2026_일경험 완뚝/sfx}"
DEST="public/sfx"

if [ ! -d "$SRC" ]; then
  echo "원본 폴더를 찾을 수 없다: $SRC" >&2
  echo "다른 위치라면 SFX_SRC 환경변수로 지정할 것." >&2
  exit 1
fi

mkdir -p "$DEST"

# 실제로 쓰는 것만 변환한다. 원본 폴더에는 아직 붙일 자리를 정하지 않은 것도 있다.
NAMES=(coupon coupon_lose pencil_success pencil_failed touch coindrop)

for name in "${NAMES[@]}"; do
  if [ ! -f "$SRC/$name.opus" ]; then
    echo "  건너뜀 (원본 없음): $name.opus" >&2
    continue
  fi
  ffmpeg -v error -y -i "$SRC/$name.opus" \
    -c:a aac -b:a 96k -movflags +faststart \
    "$DEST/$name.m4a"
  echo "  OK $name.m4a"
done

ls -lh "$DEST"
