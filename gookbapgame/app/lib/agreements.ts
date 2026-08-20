/**
 * 대시보드가 관리하는 약관 본문(`agreements` 테이블)을 화면이 쓸 모양으로 편다.
 *
 * 조회는 `actions.ts`의 `fetchAgreements`가 하고, 이 파일은 **순수 계산만** 한다 —
 * 폴백 순서와 껍데기 형태가 어긋나기 쉬운 자리라 테스트가 닿는 층에 둔다.
 *
 * 계약(2026-08-20, 저쪽 `AGENTS.md` 16번 + 실물 확인):
 *   `doc_id` varchar PK ('terms' | 'privacy' | 'coupon')
 *   `body`   jsonb  — `{"ko": "...", "en": "..."}` 다국어 맵
 *   `updated_at` timestamptz
 *   RLS `Everyone SELECT` — anon이 직접 읽는다(RPC 불필요).
 */

/** 화면이 쓰는 문서 3종. `legalDocs.ts`의 `DocId`와 같은 값이다. */
export const AGREEMENT_DOC_IDS = ["terms", "privacy", "coupon"] as const;
export type AgreementDocId = (typeof AGREEMENT_DOC_IDS)[number];

/** `doc_id` → 로케일 맵. 조회에 실패하면 이것 자체가 `null`이다. */
export type AgreementBodies = Partial<Record<AgreementDocId, Record<string, string>>>;

export interface AgreementRow {
  doc_id: string;
  /** jsonb라 객체로 오지만, 문자열로 오는 경우도 받는다(아래 주석). */
  body: unknown;
}

/**
 * `body` 한 칸을 로케일 맵으로 편다.
 *
 * **jsonb인데도 문자열을 받는 이유**: `coupon_effects.coupon_type`이 컬럼 타입 `text`에
 * JSON 문자열을 담고 있어 클라이언트가 `JSON.parse`로 펴고 있다. 두 테이블이 같은
 * "다국어 맵"인데 형태가 갈리는 전례가 이미 있으므로, 한쪽만 가정했다가 **에러 없이
 * 본문이 통째로 비는** 사고를 만들지 않는다(상품명이 "—"로 떨어졌던 2026-08-07과
 * 같은 구조).
 */
function parseBody(body: unknown): Record<string, string> | null {
  if (typeof body === "string") {
    try {
      return parseBody(JSON.parse(body));
    } catch {
      return null;
    }
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const out: Record<string, string> = {};
  for (const [locale, text] of Object.entries(body as Record<string, unknown>)) {
    // 빈 문자열은 "없는 것"으로 친다 — 대시보드에서 칸만 열고 안 채운 로케일이
    // 실제로 있다(`web_coupon_settings`의 `ja: ""`가 그 경우다).
    if (typeof text === "string" && text.trim() !== "") out[locale] = text;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** 조회 결과 행들을 `doc_id` 기준 맵으로 모은다. 알 수 없는 `doc_id`는 버린다. */
export function toAgreementBodies(rows: AgreementRow[]): AgreementBodies {
  const out: AgreementBodies = {};
  for (const row of rows) {
    const id = AGREEMENT_DOC_IDS.find((known) => known === row.doc_id);
    if (!id) continue;
    const body = parseBody(row.body);
    if (body) out[id] = body;
  }
  return out;
}

/**
 * 요청 로케일의 본문을 고른다. 없으면 `null`이고, 호출부가 번들 폴백으로 떨어진다.
 *
 * **폴백 순서는 요청 → en → ko다** — UI 문구(`translate.ts`)·DB 다국어 맵
 * (`localizedName.ts`)과 같은 순서를 쓴다. 화면마다 순서가 다르면 같은 화면에서
 * 문구는 영어인데 본문만 한국어로 뜬다.
 *
 * **DB에 있는 로케일은 그대로 쓴다**(2026-08-20, 이란토). 예전에는 ja/zh 사용자를
 * 무조건 en으로 접었는데(`pickLegalLocale`), 이제 대시보드가 로케일별로 본문을
 * 관리하므로 채워진 언어는 채워진 대로 보여준다. 번들 폴백 쪽은 ko/en 2종뿐이라
 * 그때는 여전히 `pickLegalLocale`이 접는다.
 */
export function pickAgreementBody(
  bodies: AgreementBodies | null,
  id: AgreementDocId,
  locale: string,
): { text: string; locale: string } | null {
  const body = bodies?.[id];
  if (!body) return null;
  // 어느 로케일이 실제로 쓰였는지까지 돌려준다 — 화면이 "원문은 한국어입니다" 고지를
  // 띄울지 판정하는 데 필요하고, 요청 로케일만 보면 폴백으로 ko가 나온 경우를 놓친다.
  for (const candidate of [locale, "en", "ko"]) {
    const text = body[candidate];
    if (text) return { text, locale: candidate };
  }
  return null;
}

/**
 * DB 본문과 번들 폴백 중 무엇을 화면에 올릴지 고른다.
 *
 * **요청 로케일이 DB에 있을 때만 DB가 이긴다.** 다른 로케일로 폴백된 DB 본문보다
 * 같은 언어의 번들 본문이 낫다 — 이관 초기의 DB에는 ko만 들어 있어서, 순서를
 * 뒤집으면 **영어 사용자가 영어 약관 대신 한국어 본문을 본다**(2026-08-20 실측).
 *
 * 번들에도 없는 경우(장래에 문서가 늘면 생길 수 있다)에만 DB의 다른 로케일을 쓴다.
 */
export function chooseAgreementBody(
  remote: { text: string; locale: string } | null,
  locale: string,
  bundle: { text: string; locale: string },
): { text: string; locale: string } {
  if (remote && remote.locale === locale) return remote;
  if (bundle.text) return bundle;
  return remote ?? bundle;
}
