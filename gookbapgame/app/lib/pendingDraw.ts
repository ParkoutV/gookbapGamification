const STORAGE_KEY = "gukbap_pending_draw";

/**
 * "접속 실패로 뽑기를 못 했다"는 표시. 시작 화면의 뽑기 버튼 노출에만 쓴다.
 *
 * 발급 자격의 근거가 아니다 — 자격 판정은 언제나 서버(/api/gatcha/draw)가 한다.
 * 그래서 사용자가 이 값을 조작해도 없던 쿠폰이 생기지 않는다.
 */
function isAvailable(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function markPendingDraw(): void {
  if (!isAvailable()) return;
  localStorage.setItem(STORAGE_KEY, "1");
}

export function clearPendingDraw(): void {
  if (!isAvailable()) return;
  localStorage.removeItem(STORAGE_KEY);
}

export function hasPendingDraw(): boolean {
  if (!isAvailable()) return false;
  return localStorage.getItem(STORAGE_KEY) === "1";
}
