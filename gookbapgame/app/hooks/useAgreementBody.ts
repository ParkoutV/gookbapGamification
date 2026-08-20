"use client";

import { useEffect, useState } from "react";
import { fetchAgreements } from "../actions";
import {
  chooseAgreementBody,
  pickAgreementBody,
  type AgreementBodies,
  type AgreementDocId,
} from "../lib/agreements";
import { couponGuideBody, legalDocBody, pickLegalLocale } from "../lib/legalDocs";

/**
 * 약관 본문 한 편을 가져온다 — **DB(대시보드) 우선, 실패하면 번들 본문**.
 *
 * 두 화면(`LegalNotice`·`CouponGuideNotice`)이 같은 폴백을 각자 조립하면 언젠가 한쪽만
 * 어긋난다. 조회는 `fetchAgreements`가 TTL 캐시로 묶으므로 훅이 여러 번 불려도 요청이
 * 그만큼 나가지는 않는다.
 *
 * **로딩 중에도 빈 화면을 만들지 않는다.** 처음부터 번들 본문을 돌려주고 응답이 오면
 * 갈아끼운다 — 개인정보처리방침은 최초 실행 고지의 대상이라 "잠깐 비어 있음"이
 * 곧 고지 실패다(AGENTS.md). 이관 초기에는 DB가 자리표시자라 폴백이 주 경로이기도 하다.
 */
export function useAgreementBody(
  id: AgreementDocId,
  locale: string,
): { body: string; bodyLocale: string } {
  const [bodies, setBodies] = useState<AgreementBodies | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchAgreements().then((result) => {
      if (!cancelled) setBodies(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const remote = pickAgreementBody(bodies, id, locale);
  // 번들 폴백은 ko/en 2종뿐이라 ja·zh는 여기서 en으로 접힌다(`pickLegalLocale`).
  const fallbackLocale = pickLegalLocale(locale);
  const bundle = {
    text: id === "coupon" ? couponGuideBody(fallbackLocale) : legalDocBody(fallbackLocale, id),
    locale: fallbackLocale as string,
  };
  // 고르는 규칙은 `chooseAgreementBody`에 있다 — 실측으로 한 번 뒤집힌 순서라
  // 테스트가 닿는 층에 둔다.
  const chosen = chooseAgreementBody(remote, locale, bundle);
  return { body: chosen.text, bodyLocale: chosen.locale };
}
