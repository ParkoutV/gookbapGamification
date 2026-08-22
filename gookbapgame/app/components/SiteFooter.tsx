"use client";

import { useLocale } from "../lib/i18n/LocaleContext";

/**
 * 법률 문서 링크 + copyright.
 *
 * **첫 화면 전용이 아니다**(2026-08-20, 이란토). 배경(`DaylightBackground`) 하단에는
 * 이 글자의 가독성을 위한 dimming 그라데이션이 깔려 있는데, 예전에는 푸터가
 * `StartScreen` 안에만 있어서 **다른 화면에서는 그라데이션만 남아 어색했다.**
 * 그래서 배경과 마찬가지로 `page.tsx` 한 곳에서 렌더하고, 게임 중(`playing`)에만 뺀다 —
 * 그때는 `GameScreen`이 불투명한 배경으로 화면을 덮으므로 배경도 함께 가려진다.
 *
 * **`fixed`가 아니라 `absolute`다.** 뷰포트에 고정하면 랭킹·쿠폰 목록처럼 내용이 긴
 * 화면에서 그 위에 겹쳐 뜬다(2026-08-14에 첫 화면에서 겪고 걷어낸 그 문제다).
 * 기준은 `page.tsx` 루트이고, 내용이 길어져 루트가 늘어나면 푸터도 그 바닥으로
 * 따라 내려간다.
 *
 * **최초 고지 이후 법률 문서를 다시 볼 수 있는 유일한 진입점이라** 링크를 copyright와
 * 함께 둔다. 개인정보처리방침은 언제든 열람할 수 있어야 하는데, 첫 실행에만 뜨는
 * 팝업으로 끝내면 그 통로가 없다.
 *
 * **회사명은 로케일 파일이 아니라 여기 하드코딩한다.** 4개 파일에 같은 값이 들어가면
 * 언젠가 어긋난다 — `LOCALE_LABELS`와 `GAME OVER`/`CLEAR!` 리터럴을 로케일에서 뺀 것과
 * 같은 근거다(AGENTS.md 연출 글자 절). 상호는 번역 대상이 아니고, 표기는 회사 문서를
 * 따라 '(주)웨이브앤바이브'다.
 *
 * **글자를 흰색으로 둔다.** 푸터는 패널 바깥이라 배경 사진에 그대로 노출되는 유일한
 * 텍스트이다. `text-muted`(#5A6570)를 그대로 두면 `city_midnight` 위에서 **2.02:1**까지
 * 떨어진다 — 재열람의 유일한 통로라 실제 손실이다.
 *
 * **회색을 유지한 채로는 못 고친다.** #5A6570의 휘도가 배경들과 `--bg` 사이에 끼어
 * 있어 배경을 밝히면 대비가 단조 증가하지 않고 글자 휘도를 통과한다
 * (α=0.3 → 1.03 / 0.5 → 1.47 / 0.7 → 2.15). 어둡게 하는 방향에서만 흰 글자의 대비가
 * 단조 증가한다. 가독성은 배경 레이어 하단의 그라데이션이 만든다 — 푸터 자리 국소
 * 최악 **7.22:1**로 AA를 넘는다. 사각형 칩을 얹는 안은 `day`처럼 밝은 배경에서 그
 * 자리만 패인 것처럼 보여 버렸다(2026-08-15 이란토).
 */
export default function SiteFooter({ onOpenLegal }: { onOpenLegal: () => void }) {
  const { t } = useLocale();

  return (
    /* `z-50`이 없으면 눌리지 않는다. 이 푸터는 화면들보다 **먼저** 렌더되는데,
       `StartScreen` 루트가 `relative`(=positioned) + `min-h-dvh`라 z-index가 같은
       auto끼리는 DOM 순서로 밀려 화면 쪽이 위에 깔린다 — 글자는 보이지만 클릭은
       투명한 화면 박스가 먹는다(2026-08-22 이란토). 정적 배치인 다른 화면들에서는
       멀쩡했던 이유도 이것이다. 50은 오버레이(`z-50`)와 동률이라 DOM 순서상 여전히
       그 아래이고, 모달(`z-[60]`)보다는 확실히 아래다. */
    <footer className="absolute inset-x-0 bottom-6 z-50 flex flex-col items-center gap-1 text-center">
      <button
        type="button"
        onClick={onOpenLegal}
        className="text-xs text-white underline underline-offset-2"
      >
        {t("legal.openButton")}
      </button>
      <p className="text-[0.65rem] text-white">Copyright © 2026 (주)웨이브앤바이브</p>
    </footer>
  );
}
