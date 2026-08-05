import { test } from "node:test";
import assert from "node:assert/strict";
import { nicknameFromParticipantRows } from "./existingNickname.ts";

test("nicknameFromParticipantRows: first/last 조합을 한국어로 이어붙인다", () => {
  const rows = [
    {
      participant_id: "p-1",
      nickname_first: { ko: "든든한", en: "Hearty" },
      nickname_last: { ko: "국밥", en: "Gookbap" },
    },
  ];
  assert.equal(nicknameFromParticipantRows(rows), "든든한 국밥");
});

test("nicknameFromParticipantRows: get_participant는 단일 객체를 줄 수도 있다", () => {
  const row = {
    nickname_first: { ko: "든든한" },
    nickname_last: { ko: "국밥" },
  };
  assert.equal(nicknameFromParticipantRows(row), "든든한 국밥");
});

test("nicknameFromParticipantRows: 아직 닉네임이 배정되지 않았으면 null", () => {
  assert.equal(nicknameFromParticipantRows([{ participant_id: "p-1" }]), null);
  assert.equal(
    nicknameFromParticipantRows([{ nickname_first: { ko: "든든한" }, nickname_last: null }]),
    null
  );
});

test("nicknameFromParticipantRows: 빈 결과·null·비정상 입력이면 null", () => {
  assert.equal(nicknameFromParticipantRows([]), null);
  assert.equal(nicknameFromParticipantRows(null), null);
  assert.equal(nicknameFromParticipantRows(undefined), null);
  assert.equal(nicknameFromParticipantRows("nope"), null);
});

test("nicknameFromParticipantRows: ko가 비어 있으면 폴백 없이 null (닉네임을 지어내지 않는다)", () => {
  const rows = [{ nickname_first: { en: "Hearty" }, nickname_last: { en: "Gookbap" } }];
  assert.equal(nicknameFromParticipantRows(rows), null);
});
