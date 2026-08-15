import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  RANKING_BODY_H,
  RANKING_HEADER_H,
  RANKING_LIST_H,
} from "./rankingLayout.ts";

/*
 * 랭킹 네 상태(로딩·실패·빈 목록·목록)의 높이가 어긋나면 탭을 옮길 때마다 창이
 * 출렁인다(2026-08-14 이란토 실기 제보). 값이 여러 곳에 흩어지면 **한 곳만 고쳐도
 * 에러가 나지 않고 조용히** 다시 어긋나므로, `gameCue.test.ts`와 같은 이유로 검사한다.
 */

const SOURCE = readFileSync(
  new URL("../components/RankingScreen.tsx", import.meta.url),
  "utf8"
);

test("본문 높이는 목록 + 헤더다 — 헤더를 빼면 그만큼 잔여 출렁임이 남는다", () => {
  assert.equal(RANKING_BODY_H, RANKING_LIST_H + RANKING_HEADER_H);
});

test("세 안내 상태가 모두 RANKING_BODY_H를 쓴다", () => {
  const uses = SOURCE.match(/height:\s*RANKING_BODY_H/g) ?? [];
  assert.equal(
    uses.length,
    3,
    `로딩·실패·빈 목록 세 곳이어야 하는데 ${uses.length}곳이다`
  );
});

test("목록은 RANKING_LIST_H를 쓴다", () => {
  assert.match(SOURCE, /height:\s*RANKING_LIST_H/);
});

test("높이를 Tailwind 임의값으로 되돌리지 않았다", () => {
  // Tailwind v4는 소스 텍스트를 훑어 클래스를 만든다. JS 변수로 클래스명을 조립하면
  // 그 클래스가 생성되지 않아 높이가 조용히 0이 되므로, 인라인 style로만 넘긴다.
  assert.doesNotMatch(SOURCE, /h-\[\d+px\]/);
});
