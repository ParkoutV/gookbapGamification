#!/usr/bin/env python3
"""app/이 쓰는 이모지가 전부 서브셋 폰트에 들어 있는지 검사한다.

서브셋에 없는 이모지는 **에러 없이 두부(􏿽)로 보인다.** 화면에서 눈으로 보기
전까지 아무도 모르므로, 이모지를 추가했다면 이 검사를 돌릴 것.

    python3 docs/check-emoji-font.py

빠진 게 있으면 `docs/build-emoji-font.sh`의 UNICODES에 코드포인트를 더한 뒤
그 스크립트를 다시 돌린다.

npm test(node:test)가 아니라 여기 있는 이유: woff2 파싱에 fontTools가 필요한데
그걸 위해 JS 의존성을 더할 이유가 없다. 이모지 추가는 드문 일이라 수동 실행으로 족하다.
"""

import re
import sys
from pathlib import Path

try:
    from fontTools.ttLib import TTFont
except ImportError:
    sys.exit("fontTools가 필요하다: pacman -S python-fonttools")

ROOT = Path(__file__).resolve().parent.parent
FONT = ROOT / "public" / "fonts" / "NotoEmoji-subset.woff2"
# app/ 전체를 훑는다. 매핑 표(couponEmoji.ts)만 보면 컴포넌트에 직접 박은 이모지를
# 놓친다 — SoundToggle의 🔇/🔊가 실제로 그렇게 빠질 뻔했다.
SOURCE_DIR = ROOT / "app"


# 이모지 구간에 있지만 이모지가 아닌 기호. 본문 폰트가 렌더한다.
NON_EMOJI_SYMBOLS = {
    0x2714,  # ✔ HEAVY CHECK MARK
    0x2715,  # ✕ MULTIPLICATION X — 닫기 버튼에 쓴다
    0x2716,  # ✖ HEAVY MULTIPLICATION X
    0x2718,  # ✘ HEAVY BALLOT X
}


def is_emoji(ch: str) -> bool:
    """이모지 폰트가 맡아야 하는 글자인지.

    U+2600~U+27BF 구간에는 이모지가 아닌 순수 기호도 섞여 있다(✕ U+2715는
    MULTIPLICATION X라는 수학 기호다). 그런 글자는 Noto Emoji에 글리프가 없고
    본문 폰트가 렌더하므로, 여기서 걸러내지 않으면 없는 문제를 있다고 보고한다.
    판정은 실제 폰트 커버리지로 하는 게 정확하지만, 그러면 "폰트에 없으니 검사
    대상이 아니다"가 되어 검사 자체가 무의미해진다. 그래서 예외를 나열한다.
    """
    o = ord(ch)
    if o in NON_EMOJI_SYMBOLS:
        return False
    return (
        0x1F300 <= o <= 0x1FAFF
        or 0x2600 <= o <= 0x27BF
        or 0x2B00 <= o <= 0x2BFF
        or o in (0x2139, 0xFE0F)
    )


def main() -> int:
    used: dict[str, set[str]] = {}
    for path in sorted(SOURCE_DIR.rglob("*.ts*")):
        if "/.next/" in str(path) or path.name.endswith(".test.ts"):
            continue
        for ch in path.read_text(encoding="utf-8"):
            if is_emoji(ch) and ch != "️":
                used.setdefault(ch, set()).add(str(path.relative_to(ROOT)))

    font = TTFont(FONT)
    covered: set[int] = set()
    for table in font["cmap"].tables:
        covered |= set(table.cmap.keys())

    missing = sorted((c for c in used if ord(c) not in covered), key=ord)

    print(f"app/이 쓰는 이모지: {len(used)}자")
    print(f"폰트 수록: {len(covered)}자")

    if missing:
        print()
        print("!! 서브셋에 없다 — 화면에서 두부로 보인다:")
        for ch in missing:
            where = ", ".join(sorted(used[ch]))
            print(f"   {ch} U+{ord(ch):04X}  ← {where}")
        print()
        print("   " + ",".join("U+%04X" % ord(c) for c in missing))
        print("   docs/build-emoji-font.sh의 UNICODES에 더한 뒤 그 스크립트를 다시 돌릴 것.")
        return 1

    print("OK — 전부 포함됨")
    return 0


if __name__ == "__main__":
    sys.exit(main())
