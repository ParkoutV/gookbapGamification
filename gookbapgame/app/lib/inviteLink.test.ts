import { test } from "node:test";
import assert from "node:assert/strict";
import { buildInviteUrl, buildInviteMessage, resolveInviteTrackId } from "./inviteLink.ts";

test("resolveInviteTrackId: 지점 공유 트랙이 있으면 그걸 쓴다", () => {
  assert.equal(resolveInviteTrackId("branch-shared", "online-fallback"), "branch-shared");
});

test("resolveInviteTrackId: 지점 공유 트랙이 없으면 온라인으로 떨어진다", () => {
  // ?q= 없는 기본 URL, 온라인 광고 유입, 아직 공유 트랙을 안 만든 지점.
  // 폴백이 없으면 버튼이 안 떠서 그 경로의 공유 유입 KPI를 통째로 잃는다.
  assert.equal(resolveInviteTrackId(null, "online-fallback"), "online-fallback");
  assert.equal(resolveInviteTrackId(undefined, "online-fallback"), "online-fallback");
  assert.equal(resolveInviteTrackId("", "online-fallback"), "online-fallback");
});

test("resolveInviteTrackId: 둘 다 없으면 null (호출부가 버튼을 숨긴다)", () => {
  assert.equal(resolveInviteTrackId(null, null), null);
  assert.equal(resolveInviteTrackId(null, undefined), null);
});

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
