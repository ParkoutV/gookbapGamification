import { test } from "node:test";
import assert from "node:assert/strict";
import { buildInviteUrl, buildInviteMessage } from "./inviteLink.ts";

test("buildInviteUrl: 공유 트랙 id를 ?q=로 싣는다", () => {
  assert.equal(
    buildInviteUrl("https://game.example.com", "shared-track-1"),
    "https://game.example.com/?q=shared-track-1"
  );
});

test("buildInviteUrl: 현재 URL의 기존 쿼리(매장 QR 트랙)를 물고 가지 않는다", () => {
  // 매장 QR로 들어온 사람의 주소창에는 is_shared=false인 트랙이 붙어 있다.
  // 그게 남아 있으면 공유 유입이 아니라 매장 유입으로 잡혀 KPI가 틀어진다.
  const url = buildInviteUrl("https://game.example.com/?q=branch-qr-track#play", "shared-track-1");
  assert.equal(url, "https://game.example.com/?q=shared-track-1");
  assert.ok(!url.includes("branch-qr-track"));
  assert.ok(!url.includes("#play"));
});

test("buildInviteUrl: 경로가 있으면 유지한다", () => {
  assert.equal(
    buildInviteUrl("https://example.com/game", "t1"),
    "https://example.com/game?q=t1"
  );
});

test("buildInviteMessage: 홍보 문구와 링크를 줄바꿈으로 잇는다", () => {
  assert.equal(buildInviteMessage("같이 하자!", "https://e.com/?q=t"), "같이 하자!\nhttps://e.com/?q=t");
});
