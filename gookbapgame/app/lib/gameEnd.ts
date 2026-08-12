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
 * 종료 화면에 띄울 라벨. 완주만 CLEAR!고 나머지는 GAME OVER다.
 *
 * "처리가 같다"(useGameProgress의 handleStageClear/handleForceAdvance 주석)는
 * 그대로다 — 점수 계산도 다음 화면도 동일하고, 여기서 라벨만 갈린다.
 *
 * **i18n을 타지 않는다.** 로케일 3종(ko/en/ja)이 전부 같은 영문 리터럴이었다
 * (2026-08-12 확인 후 키 삭제). 번역 대상 문구가 아니라 카운트다운의 START와
 * 같은 계열의 로고성 표시라서, 로케일 파일에 두면 "번역해야 할 것"으로 보여
 * 언젠가 누가 번역해 넣는다. 같은 이유로 CountdownOverlay의 START도 함께
 * 하드코딩했다.
 *
 * 참고로 라벨이 길어져도 창 밖으로 넘치지는 않는다 — GameEndScreen이 실제
 * 렌더 폭을 재서 font-size를 줄인다(`useFitText`). 다만 그건 넘침 방지일 뿐
 * 번역 경로를 되살릴 근거는 아니다.
 */
export function gameEndLabel(reason: GameEndReason): string {
  return reason === "cleared" ? "CLEAR!" : "GAME OVER";
}
