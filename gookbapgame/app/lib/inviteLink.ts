/**
 * '친구 초대하기' 링크를 만든다.
 *
 * gookbapanalyze/AGENTS.md의 KPI 5단계(공유 링크 생성) 규칙:
 * 공유 링크는 **새 트랙을 만드는 것이 아니라**, 같은 지점(branch_id)에 이미
 * `is_shared = true`로 설정돼 있는 트랙의 track_id를 `?q=`에 실어 보낸다.
 * 그 링크로 들어온 사람은 1단계 접속 처리에서 자동으로 "공유 유입"으로 잡힌다.
 *
 * 그래서 현재 접속 URL을 그대로 복사하면 안 된다 — 그건 `is_shared=false`인
 * 매장 QR 트랙이라 유입이 공유로 분류되지 않는다.
 */
/**
 * 조회 결과에서 초대 링크에 실을 트랙 id를 고른다.
 *
 * 지점을 특정할 수 없는 유입 — 온라인 광고, `?q=` 없는 기본 URL, 등록되지 않은
 * 트랙, 아직 공유 트랙을 안 만든 지점 — 은 전부 '온라인' 지점의 공유 트랙으로
 * 떨어진다. 폴백이 없으면 그 경로에서 버튼이 아예 안 뜨고, 그건 공유 유입 KPI를
 * 통째로 포기하는 것과 같다.
 *
 * 둘 다 없으면 null이고 호출부는 버튼을 숨긴다. 현재 URL로 대체하지 말 것 —
 * `is_shared=false`인 매장 트랙이 실려 유입이 공유로 분류되지 않는다.
 */
export function resolveInviteTrackId(
  branchSharedTrackId: string | null | undefined,
  fallbackTrackId: string | null | undefined
): string | null {
  return branchSharedTrackId || fallbackTrackId || null;
}

export function buildInviteUrl(origin: string, sharedTrackId: string): string {
  const url = new URL(origin);
  url.search = "";
  url.hash = "";
  url.searchParams.set("q", sharedTrackId);
  return url.toString();
}

/**
 * 클립보드에 담을 최종 문구. 홍보 문구와 링크를 줄바꿈으로 잇는다.
 * 문구 자체는 i18n에서 오고(하드코딩 금지) 여기서는 조립만 한다.
 */
export function buildInviteMessage(promoText: string, inviteUrl: string): string {
  return `${promoText}\n${inviteUrl}`;
}
