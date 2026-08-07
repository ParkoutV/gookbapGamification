#!/usr/bin/env python3
"""매핑 표가 쓰는 이모지가 전부 서브셋 폰트에 들어 있는지 검사한다.

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
SOURCE = ROOT / "app" / "lib" / "couponEmoji.ts"
FONT = ROOT / "public" / "fonts" / "NotoEmoji-subset.woff2"


def is_emoji(ch: str) -> bool:
    o = ord(ch)
    return (
        0x1F300 <= o <= 0x1FAFF
        or 0x2600 <= o <= 0x27BF
        or 0x2B00 <= o <= 0x2BFF
        or o in (0x2139, 0xFE0F)
    )


def main() -> int:
    source = SOURCE.read_text(encoding="utf-8")
    used = {ch for lit in re.findall(r'"([^"]+)"', source) for ch in lit if is_emoji(ch)}

    font = TTFont(FONT)
    covered: set[int] = set()
    for table in font["cmap"].tables:
        covered |= set(table.cmap.keys())

    missing = sorted((c for c in used if ord(c) not in covered), key=ord)

    print(f"매핑 표가 쓰는 이모지: {len(used)}자")
    print(f"폰트 수록: {len(covered)}자")

    if missing:
        print()
        print("!! 서브셋에 없다 — 화면에서 두부로 보인다:")
        print("   " + " ".join(missing))
        print("   " + ",".join("U+%04X" % ord(c) for c in missing))
        print()
        print("   docs/build-emoji-font.sh의 UNICODES에 더한 뒤 그 스크립트를 다시 돌릴 것.")
        return 1

    print("OK — 전부 포함됨")
    return 0


if __name__ == "__main__":
    sys.exit(main())
