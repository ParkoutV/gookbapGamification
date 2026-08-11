/**
 * 게임이 끝난 이유. **추론하지 않고 호출부가 넘긴다.**
 *
 * foundCount와 필요 개수를 비교해 역산할 수도 있지만 그건 추측이다 — 호출부는
 * 이미 사실을 안다. page.tsx가 onStageClear(정답 완주)와 onForceAdvance(오답
 * 기회 소진)를 **별개 prop으로** 넘기고 있고, 타임아웃은 useGameProgress의
 * 타이머 이펙트가 스스로 안다. 세 경로가 각자 아는 것을 그대로 실어 나른다.
 */
export type GameEndReason = "cleared" | "wrongTouchExhausted" | "timeout";

/**
 * 종료 화면에 띄울 라벨의 i18n 키. 완주만 CLEAR고 나머지는 GAME OVER다.
 *
 * "처리가 같다"(useGameProgress의 handleStageClear/handleForceAdvance 주석)는
 * 그대로다 — 점수 계산도 다음 화면도 동일하고, 여기서 라벨만 갈린다.
 */
export function gameEndLabelKey(reason: GameEndReason): string {
  return reason === "cleared" ? "gameEnd.clear" : "gameEnd.gameOver";
}
