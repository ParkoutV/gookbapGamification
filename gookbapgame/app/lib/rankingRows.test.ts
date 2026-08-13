import { test } from "node:test";
import assert from "node:assert/strict";
import { toRankingList, type RankingViewRow } from "./rankingRows.ts";
import { formatNickname } from "./nicknameParts.ts";

const row = (
  ko: [string, string],
  number: string | null,
  score: number,
  joinedTime: string,
  en?: [string, string]
): RankingViewRow => ({
  nickname_first: { ko: ko[0], ...(en ? { en: en[0] } : {}) },
  nickname_last: { ko: ko[1], ...(en ? { en: en[1] } : {}) },
  nickname_number: number,
  gookbap_score: score,
  joined_time: joinedTime,
});

test("같은 닉네임의 여러 기록이 최고점 한 줄로 줄어든다", () => {
  const list = toRankingList([
    row(["활기찬", "뚝배기"], "0614", 1200, "2026-08-13T01:00:00Z"),
    row(["활기찬", "뚝배기"], "0614", 1953, "2026-08-13T02:00:00Z"),
    row(["활기찬", "뚝배기"], "0614", 800, "2026-08-13T03:00:00Z"),
  ]);

  assert.equal(list.entries.length, 1);
  assert.equal(list.entries[0].score, 1953);
  assert.equal(list.entries[0].rank, 1);
});

test("같은 단어 조합에 번호만 다르면 서로 다른 사람이다", () => {
  const list = toRankingList([
    row(["성실한", "수육"], "0010", 1500, "2026-08-13T01:00:00Z"),
    row(["성실한", "수육"], "0011", 1400, "2026-08-13T02:00:00Z"),
  ]);
  assert.equal(list.entries.length, 2);
});

/*
 * 번호는 `0614`처럼 앞자리 0을 갖는 **문자열**이다. 숫자로 변환하는 구현에서는 `0614`와
 * `614`가 같은 값이 되어 서로 다른 사람이 합쳐진다.
 */
test("앞자리 0이 다른 번호는 다른 사람이다", () => {
  const list = toRankingList([
    row(["활기찬", "뚝배기"], "0614", 1900, "2026-08-13T01:00:00Z"),
    row(["활기찬", "뚝배기"], "614", 1800, "2026-08-13T02:00:00Z"),
  ]);
  assert.equal(list.entries.length, 2);
});

/*
 * 번호가 없으면 서로 다른 무번호 참가자를 구분할 근거가 아예 없으므로, 합치는 쪽이
 * 아니라 **합치지 않는 쪽으로 실패한다** — 남의 기록을 내 것으로 합쳐 보여주는 것이
 * 더 나쁘다(스펙 §2).
 */
test("번호가 null인 서로 다른 참가자가 합쳐지지 않는다", () => {
  const list = toRankingList([
    row(["무명의", "손님"], null, 1400, "2026-08-13T01:00:00Z"),
    row(["무명의", "손님"], null, 1300, "2026-08-13T02:00:00Z"),
  ]);
  assert.equal(list.entries.length, 2);
  assert.deepEqual(
    list.entries.map((e) => e.score),
    [1400, 1300]
  );
});

test("빈 문자열·공백 번호는 번호 없는 것으로 친다 — 합쳐지지 않는다", () => {
  const list = toRankingList([
    row(["무명의", "손님"], "", 1400, "2026-08-13T01:00:00Z"),
    row(["무명의", "손님"], "   ", 1300, "2026-08-13T02:00:00Z"),
  ]);
  assert.equal(list.entries.length, 2);
  // 번호가 표시에 붙지 않아야 한다.
  assert.equal(list.entries[0].nickname.number, null);
});

/*
 * 단어 경계가 데이터에 침범당하지 않아야 한다. 단순 이어붙이기면 `"AB"+"C"`와
 * `"A"+"BC"`가 같은 키가 되어 서로 다른 사람이 합쳐진다.
 */
test("단어 경계가 이어붙이기로 뭉개지지 않는다", () => {
  const list = toRankingList([
    row(["가나", "다"], "0001", 1500, "2026-08-13T01:00:00Z"),
    row(["가", "나다"], "0001", 1400, "2026-08-13T02:00:00Z"),
  ]);
  assert.equal(list.entries.length, 2);
});

test("동점이면 joined_time이 이른 쪽이 위다", () => {
  const list = toRankingList([
    row(["늦은", "국밥"], "0002", 1500, "2026-08-13T09:00:00Z"),
    row(["이른", "국밥"], "0001", 1500, "2026-08-13T01:00:00Z"),
  ]);
  assert.deepEqual(
    list.entries.map((e) => e.nickname.number),
    ["0001", "0002"]
  );
});

/*
 * 그룹 **안에서도** 같은 동점 규칙이 필요하다. 그러지 않으면 그룹 대표의 joined_time이
 * 순회 순서에 따라 달라져 위의 전체 정렬이 흔들린다.
 */
test("한 사람의 두 기록이 점수까지 같으면 이른 쪽을 남긴다", () => {
  const late = "2026-08-13T09:00:00Z";
  const early = "2026-08-13T01:00:00Z";

  // 입력 순서를 뒤집어도 결과가 같아야 한다.
  for (const order of [[late, early], [early, late]]) {
    const list = toRankingList([
      row(["성실한", "수육"], "0010", 1500, order[0]),
      row(["성실한", "수육"], "0010", 1500, order[1]),
    ]);
    assert.equal(list.entries.length, 1);
    assert.equal(list.entries[0].joinedTime, early);
  }
});

/*
 * PostgREST는 `2024-09-11T14:59:26+00:00`처럼 **오프셋 형식**으로 준다(실측). 오프셋이
 * 섞이면 문자열 순서가 시간 순서와 갈리므로 정렬은 파싱한 값으로 해야 한다.
 *
 * 아래 두 시각은 **같은 순간**을 다르게 적은 것이 아니다 — 문자열로 비교하면 순서가
 * 뒤집히는 조합이다. "09:00+09:00"(UTC 00:00)이 실제로는 이르지만 문자열로는 "01:00+00:00"
 * (UTC 01:00)보다 크다.
 */
test("오프셋 형식이 섞여도 실제 시각 순서로 정렬한다", () => {
  const earlyInstant = "2026-08-13T09:00:00+09:00"; // UTC 00:00 — 실제로 이르다
  const lateInstant = "2026-08-13T01:00:00+00:00"; // UTC 01:00 — 실제로 늦다

  // 문자열 비교라면 "09:00+09:00" > "01:00+00:00"이라 순서가 뒤집힌다.
  assert.ok(earlyInstant > lateInstant, "전제: 문자열 순서와 시간 순서가 어긋난다");

  const list = toRankingList([
    row(["늦은", "국밥"], "0002", 1500, lateInstant),
    row(["이른", "국밥"], "0001", 1500, earlyInstant),
  ]);
  assert.deepEqual(
    list.entries.map((e) => e.nickname.number),
    ["0001", "0002"]
  );
});

test("파싱할 수 없는 시각은 버린다 — NaN은 동점 판정을 조용히 무력화한다", () => {
  const list = toRankingList([
    row(["정상", "국밥"], "0001", 100, "2026-08-13T01:00:00Z"),
    row(["깨진시각", "국밥"], "0002", 900, "어제쯤"),
  ]);
  assert.equal(list.entries.length, 1);
  assert.equal(list.entries[0].nickname.number, "0001");
});

test("점수·시각이 없는 행은 버린다 — 0점으로 실제 참가자를 밀어내지 않는다", () => {
  const list = toRankingList([
    { ...row(["정상", "국밥"], "0001", 100, "2026-08-13T01:00:00Z") },
    { ...row(["점수없음", "국밥"], "0002", 0, "2026-08-13T01:00:00Z"), gookbap_score: null },
    { ...row(["시각없음", "국밥"], "0003", 500, "2026-08-13T01:00:00Z"), joined_time: null },
  ]);
  assert.equal(list.entries.length, 1);
  assert.equal(list.entries[0].nickname.number, "0001");
});

test("표시 상한을 넘기면 truncated가 켜지고 그만큼만 남는다", () => {
  const rows = Array.from({ length: 25 }, (_, i) =>
    row(["참가자", "국밥"], String(i).padStart(4, "0"), 100 + i, "2026-08-13T01:00:00Z")
  );
  const list = toRankingList(rows, 20);

  assert.equal(list.entries.length, 20);
  assert.equal(list.truncated, true);
  // 상한 안쪽이면 꺼져 있어야 한다 — 늘 켜져 있으면 안내가 의미를 잃는다.
  assert.equal(toRankingList(rows.slice(0, 20), 20).truncated, false);
});

/*
 * **스펙 §6이 콕 집어 요구하는 검사다.** `formatNickname`의 결과를 그룹 키로 쓰면 두
 * 가지가 동시에 깨진다: (1) 로케일마다 문자열이 달라져 언어 토글에 그룹이 재계산되고,
 * (2) 번역이 한쪽만 있는 프리셋은 **통째로 한국어로 떨어져** 서로 다른 두 사람이 같은
 * 문자열로 수렴한다. 아래 데이터는 그 두 사람(en 번역 없음, 번호만 다름)을 섞어 둔 것이다.
 */
test("로케일이 그룹핑에 영향을 주지 않는다 — ko/en에서 그룹 수가 같다", () => {
  const rows = [
    // en 번역이 있는 사람
    row(["활기찬", "뚝배기"], "0614", 1900, "2026-08-13T01:00:00Z", ["Energetic", "Earthen Pot"]),
    row(["활기찬", "뚝배기"], "0614", 1200, "2026-08-13T02:00:00Z", ["Energetic", "Earthen Pot"]),
    // en 번역이 **없는** 서로 다른 두 사람. 영어 화면에서 표시 문자열이 완전히 같아진다.
    row(["수줍은", "깍두기"], "0020", 1700, "2026-08-13T03:00:00Z"),
    row(["수줍은", "깍두기"], "0021", 1600, "2026-08-13T04:00:00Z"),
  ];

  const list = toRankingList(rows);
  assert.equal(list.entries.length, 3, "무번역 두 사람이 합쳐지면 2가 된다");

  // 표시 문자열이 실제로 같은지 확인 — 이것이 참이라야 위 검사가 의미를 갖는다.
  const [a, b] = [list.entries[1], list.entries[2]];
  assert.equal(
    formatNickname(a.nickname, "en").replace(/#\d+/, ""),
    formatNickname(b.nickname, "en").replace(/#\d+/, ""),
    "번호를 떼면 영어 표시가 같아야 한다(그래서 표시 문자열을 키로 쓸 수 없다)"
  );

  // 그룹 결과가 로케일과 무관함을 값으로 확인한다 — 순수 함수라 로케일 인자가 아예 없다.
  assert.deepEqual(
    list.entries.map((e) => [e.nickname.number, e.score]),
    [
      ["0614", 1900],
      ["0020", 1700],
      ["0021", 1600],
    ]
  );
});
