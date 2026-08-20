#!/usr/bin/env bash
# 픽셀 폰트(Galmuri11)를 실제로 쓰는 글자만 남겨 서브셋한다.
#
# 왜: 원본은 505KB로 **첫 방문 전송량의 절반 이상**을 차지했다(_next 정적 896KB 중
# 493KB). 한글 11172자 + 한자 6477자가 전부 들어 있는데, 이 게임에서 픽셀 폰트는
# 제목·점수·국밥력 등급·연출 글자(GAME OVER 등)에만 쓴다. 서브셋하면 21KB다(96% 감소).
#
# 언제 돌리나: **로케일 파일(ko/en/ja)의 문구를 고쳤을 때, 특히 새 언어를 추가했을 때.**
# 서브셋에 없는 글자는 에러 없이 두부(􏿽)로 보인다 — `docs/build-emoji-font.sh`와 같은
# 함정이다.
#
# 필요한 것: python3 + fonttools (pip install fonttools brotli)
#
#   bash docs/build-pixel-font.sh
#
set -euo pipefail

cd "$(dirname "$0")/.."

SRC="${PIXEL_FONT_SRC:-docs/fonts-src/Galmuri11.woff2}"
DEST="public/fonts/Galmuri11.woff2"

if [ ! -f "$SRC" ]; then
  echo "원본 폰트를 찾을 수 없다: $SRC" >&2
  echo "" >&2
  echo "서브셋본을 다시 서브셋하면 글자가 계속 줄어든다. 원본(505KB, 20965자)이" >&2
  echo "필요하며 https://galmuri.quiple.dev 에서 받을 수 있다." >&2
  echo "다른 위치에 있다면 PIXEL_FONT_SRC 환경변수로 지정할 것." >&2
  exit 1
fi

python3 - "$SRC" "$DEST" <<'PY'
import pathlib, sys
from fontTools import subset

src, dest = sys.argv[1], sys.argv[2]
chars = set()

# 1. 인쇄 가능한 ASCII 전부.
#    점수(`123 / 500`)처럼 값이 정해지지 않은 자리가 있어 숫자·기호를 전부 넣는다.
chars |= {chr(c) for c in range(0x20, 0x7F)}

# 2. 로케일 파일에 등장하는 모든 문자.
#    **어떤 키가 픽셀 폰트에 걸리는지 따지지 않는다.** 예전에 그렇게 좁혔다가
#    92자를 뽑았는데, 소스에 하드코딩된 GAME OVER/CLEAR!의 A·C·L·O·V·!가 통째로
#    빠져 있었다(로케일 파일을 떠났기 때문). 키를 일일이 추적하는 방식은 문구가
#    옮겨다닐 때마다 조용히 깨진다. 한글·한자는 어차피 필요한 것만 남으므로
#    넉넉하게 잡아도 크기 차이는 몇 KB에 불과하다.
#
#    **zh는 일부러 빠져 있다 — 추가하지 말 것**(2026-08-13). Galmuri11의 한자는
#    KS X 1001 기반이라 간체자가 원본 cmap에 아예 없다(실측: UI 어휘 43자 중 19자
#    누락, `饭`·`门`·`险`·`简` 등). 여기 넣어도 서브셋에 들어가지 않으므로 크기만
#    헛되이 재고, 아래 검증에 zh를 넣으면 **영영 통과하지 못한다.**
#    대신 `globals.css`의 `:root:lang(zh)`가 픽셀 폰트를 본문 폰트로 되돌린다 —
#    중국어 화면은 애초에 이 폰트를 쓰지 않는다.
for loc in ("ko", "en", "ja"):
    chars |= set(pathlib.Path(f"app/lib/i18n/locales/{loc}.ts").read_text())

# 3. 소스에 하드코딩된 연출 문자열(로케일 파일에 없다).
#    `app/lib/gameEnd.ts`와 `app/components/CountdownOverlay.tsx` 참고 —
#    로케일 3종이 전부 같은 영문이라 i18n에서 뺐다.
chars |= set("GAME OVER") | set("CLEAR!") | set("START")
#    크레딧 화면 제목도 하드코딩이다(`CreditsScreen.tsx`, 2026-08-20).
#    "프"·"젝"·"뚝"은 로케일 문구 어디에도 없어서 이 줄이 없으면 두부가 된다.
chars |= set("프로젝트 완뚝")

# 4. 일본어 여유분(`docs/kanji-subset.txt`, 1529자).
#    **2번만으로는 일본어 문구를 추가할 때마다 이 스크립트를 다시 돌려야 하고,
#    안 돌리면 두부(􏿽)가 된다.** 미리 여유를 둬서 웬만한 추가는 재빌드 없이 버티게 한다.
#
#    목록은 "빈도 상위 1500자 + 상용한자에 있으나 JIS 제1수준에 없는 글자"다.
#    **표준 하나만으로는 부족하다** — 실측으로 확인했다(2026-08-12):
#      - 문학 빈도(아오조라 문고) 상위 1200자를 넣어도 지금 쓰는 174자 중 15자가 빠진다
#        (匿 協 営 履 扱 抽 招 挑 棄 況 秒 絡 膳 豚 須 — 익명·영업·초 같은 UI 어휘라
#        문학 코퍼스에 잘 안 나온다). 그래서 2번(실사용분)과 반드시 합쳐야 한다.
#      - JIS 제1수준은 1978년 제정이라 현대 상용 어휘가 빠진다. 대표적으로 `丼`(덮밥)이
#        상용한자에는 있는데 제1수준에는 없다 — 음식 서비스에서 바로 문제가 된다.
#    자세한 근거는 `~/.agents/common-rag/일본어_웹폰트_서브셋_한자범위_결정.md`.
#
#    한자 전체(6477자)를 넣으면 269KB로 불어난다. 지금 174자를 쓰는 게임이 그만큼을
#    필요로 할 일은 없어서 1529자에서 끊었다(80KB).
kanji = pathlib.Path("docs/kanji-subset.txt")
if kanji.exists():
    chars |= set(kanji.read_text())

chars = {c for c in chars if c.isprintable()}

opts = subset.Options()
opts.flavor = "woff2"
opts.desubroutinize = True
# **`--layout-features=''`를 쓰지 말 것.** 이모지 폰트 스크립트에는 그 옵션이 있지만,
# 거기서 GSUB을 비운 탓에 VS16 클러스터가 합쳐지지 않는 버그가 있었다(AGENTS.md).
# 본문용 텍스트 폰트에서 레이아웃 기능을 걷어내는 것은 위험도가 다르다.

font = subset.load_font(src, opts)
subsetter = subset.Subsetter(options=opts)
subsetter.populate(text="".join(sorted(chars)))
subsetter.subset(font)
subset.save_font(font, dest, opts)

# 검증: 픽셀 폰트가 실제로 렌더하는 문자열이 전부 들어갔는지 확인한다.
# 여기서 걸러지지 않으면 화면에서 두부로 나타난다.
from fontTools.ttLib import TTFont

cmap = TTFont(dest).getBestCmap()
must = {
    "연출(하드코딩)": "GAMEOVRCLS!T",
    "크레딧 제목": "프로젝트 완뚝",
    "숫자·기호": "0123456789/:%.,",
    "ko 제목·등급": "다른그림찾기게임결과오늘의국밥력단골미식가탐험입문생",
    "ja 제목·등급": "間違い探しゲーム結果今日のクッパ常連美食家検初心者",
    "en 제목·등급": "SpotheDifrncGamRsulTdyGukbapPwMtEx",
}
missing = {
    label: "".join(c for c in s if ord(c) not in cmap)
    for label, s in must.items()
}
missing = {k: v for k, v in missing.items() if v}
if missing:
    print("필수 글자가 빠졌다:", missing, file=sys.stderr)
    sys.exit(1)

print(f"  OK {dest} — {len(cmap)}자, {pathlib.Path(dest).stat().st_size // 1024}KB")
PY
