/**
 * 로딩 연출의 최소 노출 시간 계산.
 *
 * 뽑기 API가 200ms 만에 끝나면 로딩 아이콘이 한 번 깜빡이고 사라져서, 연출이
 * 아니라 화면 결함처럼 보인다. 그래서 "응답이 왔어도 최소 시간은 채운다".
 *
 * 훅이 아니라 순수 함수로 둔 이유는 테스트 때문이다 — 타이밍 계산에 off-by-one이
 * 생기면 카드가 아예 안 나오거나 연출이 통째로 건너뛰어지는데, React 렌더러 없이
 * 검증하려면 계산이 밖에 있어야 한다.
 */

/** 로딩 연출을 최소한 이만큼은 보여준다. */
export const MIN_LOADING_MS = 600;

/**
 * 지금 로딩 연출을 더 보여줘야 하는지, 보여준다면 몇 ms 남았는지.
 *
 * @param startedAt 로딩이 시작된 시각(ms). 아직 시작 전이면 null.
 * @param now       현재 시각(ms).
 * @param minMs     최소 노출 시간. 기본 MIN_LOADING_MS.
 * @returns 남은 시간(ms). 0이면 지금 끝내도 된다.
 */
export function remainingLoadingMs(
  startedAt: number | null,
  now: number,
  minMs: number = MIN_LOADING_MS
): number {
  // 시작하지 않았으면 기다릴 것도 없다.
  if (startedAt === null) return 0;

  const elapsed = now - startedAt;

  // 시계가 뒤로 갔거나(NTP 보정) 미래 시각이 들어온 경우. 음수 elapsed를 그대로
  // 빼면 minMs보다 긴 시간을 기다리게 되므로 상한을 minMs로 묶는다.
  if (elapsed < 0) return minMs;

  const remaining = minMs - elapsed;
  return remaining > 0 ? remaining : 0;
}
