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
