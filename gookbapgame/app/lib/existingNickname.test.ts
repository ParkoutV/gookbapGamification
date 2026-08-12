import { test } from "node:test";
import assert from "node:assert/strict";
import { nicknameFromParticipantRows } from "./existingNickname.ts";

test("nicknameFromParticipantRows: 다국어 맵을 그대로 돌려준다", () => {
  // **여기서 문자열로 확정하지 않는 것이 요점이다.** 예전에는 "ko"만 뽑아 써서
  // 영문·일본어 환경에서도 닉네임만 한국어로 나왔다(2026-08-12 제보).
  const rows = [
    {
      participant_id: "p-1",
      nickname_first: { ko: "든든한", en: "Hearty" },
      nickname_last: { ko: "국밥", en: "Gookbap" },
    },
  ];
  assert.deepEqual(nicknameFromParticipantRows(rows), {
    first: { ko: "든든한", en: "Hearty" },
    last: { ko: "국밥", en: "Gookbap" },
    number: null,
  });
});

test("nicknameFromParticipantRows: nickname_number를 그대로 싣는다", () => {
  // 재방문 경로가 이걸 빠뜨리면 배정 직후와 다시 접속했을 때 이름이 달라 보인다
  // (2026-08-10 제보). '#'을 붙이는 것은 formatNickname의 몫이다.
  const rows = [
    {
      nickname_first: { ko: "든든한" },
      nickname_last: { ko: "국밥" },
      nickname_number: "0023",
    },
  ];
  assert.equal(nicknameFromParticipantRows(rows)?.number, "0023");
});

test("nicknameFromParticipantRows: nickname_number는 nullable — 없으면 null", () => {
  const base = { nickname_first: { ko: "든든한" }, nickname_last: { ko: "국밥" } };
  assert.equal(nicknameFromParticipantRows([{ ...base, nickname_number: null }])?.number, null);
  assert.equal(nicknameFromParticipantRows([{ ...base, nickname_number: "" }])?.number, null);
  assert.equal(nicknameFromParticipantRows([{ ...base, nickname_number: "  " }])?.number, null);
});

test("nicknameFromParticipantRows: get_participant는 단일 객체를 줄 수도 있다", () => {
  const row = {
    nickname_first: { ko: "든든한" },
    nickname_last: { ko: "국밥" },
  };
  assert.deepEqual(nicknameFromParticipantRows(row), {
    first: { ko: "든든한" },
    last: { ko: "국밥" },
    number: null,
  });
});

test("nicknameFromParticipantRows: 아직 닉네임이 배정되지 않았으면 null", () => {
  // null이면 호출부가 배정 API로 넘어간다. 한쪽 단어만으로 지어내면 서버에 저장된
  // 값과 어긋나므로, 조합이 온전할 때만 반환한다.
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

test("nicknameFromParticipantRows: ko가 없고 en만 있어도 통과시킨다", () => {
  // **예전에는 여기서 null을 돌려줬다.** "ko"만 보던 시절의 잔재인데, 그러면 한국어
  // 번역이 아직 없는 단어를 쓰는 사람은 조회에 실패해 매번 새 닉네임을 배정받는다.
  // 언어 선택과 폴백은 formatNickname이 한다(locale → ko → "—").
  const rows = [{ nickname_first: { en: "Hearty" }, nickname_last: { en: "Gookbap" } }];
  assert.deepEqual(nicknameFromParticipantRows(rows), {
    first: { en: "Hearty" },
    last: { en: "Gookbap" },
    number: null,
  });
});
