#!/usr/bin/env python3
"""확정본 docx와 `app/lib/legalDocs.ts`의 한국어 전사본을 대조한다.

**왜 있는가.** 2026-08-14 전사할 때 docx를 `head`로 잘라 읽은 탓에 개인정보처리방침
11항(변경 안내)과 이메일·연락처·시행일이 통째로 빠진 채 커밋됐다. 앞부분이 전부
맞고 화면도 멀쩡해 보여서 눈으로는 드러나지 않았다 — 문서 끝이 잘리는 사고는
사람 눈으로 잡는 종류가 아니다.

`legalDocs.test.ts`는 마지막 항의 존재를 리터럴로 박아 같은 사고를 잡지만, 그건
"내가 아는 마지막 항"까지만 지킨다. **회사가 문서를 갱신했을 때**는 이 스크립트로
전문을 대조해야 한다.

사용법 (zip을 푼 디렉터리를 넘긴다):

    unzip -o docs/client/20260813_약관.zip -d /tmp/yakgwan
    python3 docs/check-legal-docs.py /tmp/yakgwan

en 전사본은 대조하지 않는다 — 번역이라 원문과 줄이 일대일로 맞지 않는다.
"""

import html
import pathlib
import re
import sys
import zipfile

# 전사할 때 글머리 기호 `· `를 붙였고, 원문의 ` : ` 공백 표기가 자리마다 다르다.
# 그 두 가지만 흡수하고 나머지 글자는 그대로 비교한다 — 곡선 따옴표(“회사”)까지
# 원문을 따르므로 정규화로 지우지 않는다(실제로 이 대조가 그 차이를 잡아냈다).
def norm(s: str) -> str:
    return re.sub(r"\s+", "", s).replace("·", "")


def docx_lines(path: pathlib.Path) -> list[str]:
    xml = zipfile.ZipFile(path).read("word/document.xml").decode("utf-8")
    xml = re.sub(r"</w:p>", "\n", xml)
    xml = re.sub(r"<[^>]+>", "", xml)
    return [line.strip() for line in html.unescape(xml).split("\n") if line.strip()]


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2

    root = pathlib.Path(sys.argv[1])
    docs = sorted(root.rglob("*.docx"))
    if not docs:
        print(f"❌ {root} 아래에 .docx가 없다")
        return 2

    source = pathlib.Path(__file__).parent.parent / "app/lib/legalDocs.ts"
    # ko 블록만 떼어낸다. en까지 포함해 비교하면 영어 본문이 우연히 통과시킬 여지가 있다.
    ko_block = norm(source.read_text().split("const ko:")[1].split("const en:")[0])

    missing = []
    total = 0
    for doc in docs:
        for line in docx_lines(doc):
            total += 1
            if norm(line) not in ko_block:
                missing.append((doc.name, line))

    print(f"원문 {total}줄 검사 ({len(docs)}개 문서)")
    if missing:
        print(f"❌ 전사 누락 {len(missing)}줄:")
        for name, line in missing:
            print(f"  [{name}] {line[:110]}")
        return 1

    print("✅ docx 모든 줄이 ko 전사본에 있다")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
