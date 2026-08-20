"use client";

import { useState } from "react";
import PixelPanel from "./PixelPanel";
import { useLocale } from "../lib/i18n/LocaleContext";
import { LEGAL_DOC_IDS, type LegalDocId } from "../lib/legalDocs";
import { useAgreementBody } from "../hooks/useAgreementBody";

interface LegalNoticeProps {
  /**
   * 최초 1회 고지인가.
   *
   * **두 쓰임의 차이는 닫는 방법 하나뿐이다**(2026-08-14).
   * - `true`(최초 고지): 타이틀바 ✕가 없고 `확인` 버튼만 있다. **거부라는 선택지를
   *   두지 않는 것이 설계다** — 이건 동의를 받아 보관하는 게이트가 아니라 의무
   *   고지이고, 닫기/거부가 있으면 동의 게이트가 되어버린다(ROADMAP C1 메모).
   * - `false`(푸터 열람): ✕로 닫는다. 이미 고지받은 사람이 다시 읽는 자리라
   *   `확인`이 의미 없다.
   *
   * 두 쓰임을 별도 컴포넌트로 가르지 않은 것은 탭·스크롤·본문이 전부 같기 때문이다.
   * 대신 **닫는 방법을 이 prop 하나로 갈라둔다** — 합쳐서 ✕를 항상 띄우면 위의
   * 설계 결정이 조용히 무너진다.
   */
  firstRun: boolean;
  onClose: () => void;
}

/**
 * 약관·개인정보처리방침·쿠폰 이용안내를 탭으로 넘겨 보는 창.
 *
 * 본문은 대시보드가 관리한다(`agreements` 테이블, 2026-08-20 이관). 조회 전·실패
 * 시에는 `app/lib/legalDocs.ts`의 번들 본문으로 떨어진다 — `useAgreementBody` 참고.
 *
 * **본문 로케일이 UI 로케일과 다를 수 있다.** DB에 그 로케일 본문이 없으면 en·ko로
 * 접히고, 번들 폴백은 애초에 ko/en 2종뿐이다. 탭 이름·버튼 같은 UI 껍데기는 4종을 따른다.
 */
export default function LegalNotice({ firstRun, onClose }: LegalNoticeProps) {
  const { t, locale } = useLocale();
  const [tab, setTab] = useState<LegalDocId>(firstRun ? "privacy" : "terms");
  const { body, bodyLocale } = useAgreementBody(tab, locale);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("legal.title")}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
    >
      <PixelPanel
        size="card"
        title={t("window.brand")}
        // 최초 고지에는 ✕를 주지 않는다(위 firstRun 주석).
        onClose={firstRun ? undefined : onClose}
        closeAriaLabel={t("legal.closeAria")}
        className="max-w-sm w-full"
      >
        <h2 className="text-lg font-bold text-ink mb-3 text-center">{t("legal.title")}</h2>

        {/* 탭. 스타일은 랭킹 화면과 같은 것을 쓴다 — 같은 역할의 UI가 화면마다
            다르게 생길 이유가 없다. */}
        <div className="flex gap-1 mb-3">
          {LEGAL_DOC_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-pressed={tab === id}
              className={`pixel-mask-btn-solid flex-1 min-w-0 py-2 px-1 text-xs font-bold transition-opacity active:scale-95 ${
                tab === id ? "bg-accent text-accent-ink" : "bg-surface text-ink"
              }`}
            >
              {t(`legal.tab.${id}`)}
            </button>
          ))}
        </div>

        {/* 본문. `key`가 탭이라 갈아탈 때 스크롤이 맨 위로 돌아간다 — 없으면 같은
            DOM이 재사용되어 개인정보처리방침 8항을 읽다 다른 탭으로 옮기면 그
            문서의 중간부터 보인다.

            **높이 상한은 `vh`가 아니라 `dvh`다**(AGENTS.md "화면 높이" 절). 여기서는
            특히 위험하다: 최초 고지 경로에는 타이틀바 ✕가 없어서 **'확인' 버튼이
            유일한 탈출구**인데, 이 모달은 `items-center`로 가운데 정렬만 하고
            스크롤을 주지 않으므로 패널이 가시 영역을 넘으면 위아래가 함께 잘린다.
            `vh`는 툴바가 없는 높이로 고정되므로 툴바가 두꺼운 브라우저에서 그
            버튼이 잘려 **고지를 닫을 방법이 사라진다.** */}
        <div
          key={tab}
          className="legal-doc-body text-xs text-ink text-left whitespace-pre-line max-h-[45dvh] overflow-y-auto mb-4 leading-relaxed"
        >
          {body}
        </div>

        {/* 원문이 한국어라는 고지. 한국어 화면에서는 자명하므로 띄우지 않는다. */}
        {bodyLocale !== "ko" && (
          <p className="text-[0.65rem] text-muted text-left mb-3">{t("legal.originalNotice")}</p>
        )}

        {firstRun && (
          <>
            <p className="text-xs text-muted text-left mb-4">{t("legal.agreeNotice")}</p>
            <button
              type="button"
              onClick={onClose}
              className="pixel-mask-btn-solid w-full py-3 px-6 bg-accent text-accent-ink font-bold transition-opacity active:scale-95"
            >
              {t("legal.confirmButton")}
            </button>
          </>
        )}
      </PixelPanel>
    </div>
  );
}
