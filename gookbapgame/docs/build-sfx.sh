#!/usr/bin/env bash
# 효과음·BGM 원본을 웹용 m4a로 변환한다.
#
# 왜 변환하나: 원본 컨테이너가 제각각인데(opus/mp3/wav) **iOS Safari가 .ogg를
# 재생하지 못한다.** 모바일 웹 게임이라 아이폰에서 안 들리면 의미가 없어서
# AAC(m4a)로 통일했다. 원본은 기획 폴더에 그대로 두고 리포에는 변환본만 들어간다.
#
# 언제 돌리나: 기획 폴더의 소리가 새로 추가되거나 교체되었을 때.
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

# ── 효과음 ────────────────────────────────────────────────────────────────
# 원본 이름이 곧 에셋 이름인 것들. 실제로 쓰는 것만 변환한다.
NAMES=(coupon coupon_lose pencil_success pencil_failed coindrop click count_ready count_start)

for name in "${NAMES[@]}"; do
  # 원본이 이미 m4a면 그대로 복사한다. 재인코딩하면 손실만 한 번 더 얹힌다.
  if [ -f "$SRC/$name.m4a" ]; then
    cp "$SRC/$name.m4a" "$DEST/$name.m4a"
    echo "  OK $name.m4a (원본이 m4a — 복사)"
    continue
  fi
  if [ ! -f "$SRC/$name.opus" ]; then
    echo "  건너뜀 (원본 없음): $name.opus" >&2
    continue
  fi
  ffmpeg -v error -y -i "$SRC/$name.opus" \
    -c:a aac -b:a 96k -movflags +faststart \
    "$DEST/$name.m4a"
  echo "  OK $name.m4a"
done

# 원본 파일명이 에셋 이름과 다른 것들(생성기가 뱉은 이름 그대로라 길고 `#`가 섞여 있다).
# "에셋이름|원본파일명" 형식. 원본을 rename하지 않는 이유는 기획 폴더가 원본 보관소이고,
# 여기서 이름을 바꾸면 어느 생성물이었는지 추적이 끊기기 때문이다.
#
# **64k인 이유**: 이 둘은 종료 화면 멜로디라 다른 효과음과 달리 고역이 살아 있다
# (13kHz+ RMS: game_clear -43dB, game_over -37dB. 카운트다운은 -63/-56dB로 비어 있다).
# 48k로 내리면 그 대역이 8dB씩 무너진다 — 실측: game_clear 64k에서 -44.9dB인데
# 48k에서 -52.6dB, game_over는 -40.3 → -45.8dB. **48k로 내리지 말 것.**
RENAMED=(
  "game_clear|raw/game_clear_effect_so_#1-1786440414616.wav"
  "game_over|raw/game_over_effect_sou_#2-1786440391726.wav"
)

for entry in "${RENAMED[@]}"; do
  name="${entry%%|*}"
  file="${entry#*|}"
  if [ ! -f "$SRC/$file" ]; then
    echo "  건너뜀 (원본 없음): $file" >&2
    continue
  fi
  ffmpeg -v error -y -i "$SRC/$file" \
    -c:a aac -b:a 64k -movflags +faststart \
    "$DEST/$name.m4a"
  echo "  OK $name.m4a"
done

# 만점자 전용 축하음. **다른 효과음과 달리 원본이 m4a여도 재인코딩한다.**
#
# 1. 원본이 203kbps/103KB로 나머지 효과음을 다 합친 것보다 크다. 96k면 54KB로 절반이
#    되고, 4초짜리 축하음이라 그 정도 손실은 들리지 않는다. 매장에서 모바일 데이터로
#    받는 상황이라 프리로드에 100KB를 얹을 이유가 없다(`preloadSfx`는 전부 받는다).
# 2. **음량을 굽는다.** 원본이 -19.9 LUFS로 이 소리가 대체하는 coindrop(-29.0 LUFS)보다
#    9dB 크다 — 같은 자리에서 같은 순간에 나는 소리라 그대로 두면 만점자에게만 소리가
#    두 배로 튄다. `volume=0.55`로 -25.1 LUFS까지 내렸다(축하음이라 coindrop보다 4dB
#    큰 선은 남겼다). 런타임에서 못 낮추는 이유는 BGM 절의 iOS 설명과 같다.
if [ -f "$SRC/gratulate.m4a" ]; then
  ffmpeg -v error -y -i "$SRC/gratulate.m4a" \
    -af "volume=0.55" \
    -c:a aac -b:a 96k -movflags +faststart \
    "$DEST/gratulate.m4a"
  echo "  OK gratulate.m4a (만점 전용 — 96k, -25 LUFS)"
else
  echo "  건너뜀 (원본 없음): gratulate.m4a" >&2
fi

# ── BGM ───────────────────────────────────────────────────────────────────
# 효과음과 인코딩 설정이 다르다.
#
# 1. **음량을 필터 체인으로 다듬는다.** 런타임에서 낮추지 않고 에셋에 굽는 이유는
#    **iOS의 `HTMLMediaElement.volume`이 읽기 전용**이기 때문이다(`app/lib/sfx.ts`
#    주석 참고). 대입해도 조용히 무시된다. 조정하려면 이 스크립트를 다시 돌린다.
#
#    처음에는 `volume=0.5` 한 줄이었는데 실기에서 여전히 시끄러웠다(2026-08-12, 이란토).
#    **`volume`은 전체를 균일하게 줄여서 평균만 낮추고 순간적으로 튀는 피크는 그대로
#    남기기 때문이다** — 당시 평균 -18.8 LUFS인데 피크가 -1.2 dBFS로 사실상 최대치였다.
#
#    체인의 순서가 중요하다:
#      highpass=100    폰 스피커가 재생하지 못하는 초저역을 버린다(데이터·헤드룸 절약).
#      equalizer 2.5k  **폰에서 시끄럽게 들리는 실제 원인.** 사람 귀가 가장 예민하고
#                      작은 스피커가 실효 출력을 내는 대역이라 여기를 눌러야 체감이 준다.
#      acompressor     다이내믹을 눌러 피크와 평균의 격차를 줄인다. 이게 있어야
#                      같은 체감 음량에서 절대 레벨을 더 낮출 수 있다.
#      volume          **반드시 마지막.** 리미터/컴프레서를 volume 뒤에 두면 게인을
#                      도로 끌어올려 피크가 0 dBFS를 넘어 클리핑된다(실측: +1.9 dBFS).
#
#    **저역을 깎는 근거를 "스피커에서 웅웅거린다"로 적지 말 것.** 이 게임은 각자의
#    스마트폰에서 재생되고 폰 스피커는 저역이 물리적으로 안 나온다 — 웅웅거릴 일이
#    없다. 초저역을 버리는 건 어차피 안 들리는 대역을 정리하는 것뿐이다.
#
#    결과(폰 스피커 응답 통과 기준): 전체 -18.8 → -28.0 LUFS, 피크 -1.2 → -8.3 dBFS.
#    효과음 중 가장 조용한 coindrop(-29.0 LUFS)과 비슷한 수준이라 효과음이 묻히지 않는다.
# 2. **모노 + 32k.** 60초짜리 두 곡이라 원본 그대로면 2.9MB인데, 매장에서 모바일
#    데이터로 받는 상황이라 최대한 줄인다(합계 505KB, 83% 감소).
#
#    32k까지 내려도 **측정상 손실이 없다.** 이 곡들은 칩튠이라 고역이 원래 비어
#    있어서다 — 원본의 13kHz 이상 에너지가 -55dB로 사실상 무음이고, 저비트레이트
#    AAC가 깎는 것이 바로 그 대역이다. 실측(13kHz+ RMS): 원본 -55.4dB, 64k -51.8,
#    48k -52.2, 40k -52.4, **32k -54.9**, 24k **-62.3**.
#    24k에서 처음으로 7dB 급락하므로 **32k가 손실 없는 최저점**이다.
#    더 줄이려다 24k로 내리지 말 것.
#
#    22.05kHz 다운샘플은 이득이 없다(32k에서 240KB로 동일). AAC가 이미 대역을
#    알아서 자르기 때문이라 샘플레이트는 건드리지 않는다.
BGM=(
  "bgm_main|raw/Level_Select.mp3"
  "bgm_game|raw/Level_Select_Screen.mp3"
)

for entry in "${BGM[@]}"; do
  name="${entry%%|*}"
  file="${entry#*|}"
  if [ ! -f "$SRC/$file" ]; then
    echo "  건너뜀 (원본 없음): $file" >&2
    continue
  fi
  ffmpeg -v error -y -i "$SRC/$file" \
    -af "highpass=f=100,equalizer=f=2500:t=q:w=1.5:g=-5,acompressor=threshold=-20dB:ratio=3:attack=10:release=200:makeup=1,volume=0.45" \
    -ac 1 -c:a aac -b:a 32k -movflags +faststart \
    "$DEST/$name.m4a"
  echo "  OK $name.m4a (BGM — 모노 32k, 폰 기준 -28 LUFS)"
done

ls -lh "$DEST"
