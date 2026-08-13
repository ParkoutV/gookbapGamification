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
 * **라벨을 바꾸면 크기를 다시 재야 한다.** 글자 크기는 CSS가 라벨별 클래스로 갖고
 * 있고(`globals.css`의 `.game-cue` 계열), 자동으로 맞춰주는 장치가 없다 —
 * 실측 계산은 2026-08-13에 걷어냈다. `max-width: 100%`가 창을 뚫는 것만 막아줄
 * 뿐이므로, 긴 라벨을 넣으면 잘린다.
 *
 * **공백이 줄바꿈 지점이다**(`gameEndLabelLines`). `GAME OVER`가 두 줄로 쌓이는
 * 것이 그 때문이며, 라벨에 공백을 넣으면 자동으로 여러 줄이 된다.
 */
export function gameEndLabel(reason: GameEndReason): string {
  return reason === "cleared" ? "CLEAR!" : "GAME OVER";
}

/**
 * 라벨을 줄 단위로 쪼갠다. `GAME OVER` → `["GAME", "OVER"]`, `CLEAR!` → `["CLEAR!"]`.
 *
 * 한 줄로 두면 `GAME OVER`는 9자라 폭 제약에 먼저 걸려 53px까지만 커지는데,
 * 그러면 `CLEAR!`(84px) 옆에서 눈에 띄게 작다 — 창을 92% 채우므로 크기 계수 문제가
 * 아니라 한 줄의 물리적 한계다(2026-08-13, 이란토 제보). 두 줄로 쪼개면 각 줄이
 * 4자라 상한까지 커진다.
 *
 * **공백을 기준으로 나눈다.** 라벨이 6종 고정이라 `["GAME","OVER"]`를 그대로 박아도
 * 되지만, 그러면 라벨과 줄 구성이 두 곳에 나뉘어 한쪽만 고쳐질 수 있다. 공백 규칙
 * 하나면 `gameEndLabel`만 고쳐도 줄 구성이 따라온다.
 */
export function gameEndLabelLines(label: string): string[] {
  return label.split(" ");
}
