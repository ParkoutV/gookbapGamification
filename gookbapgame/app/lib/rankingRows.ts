import type { LocalizedName } from "./i18n/localizedName.ts";
import type { NicknameParts } from "./nicknameParts.ts";

/**
 * `ranking_view`가 돌려주는 행. **뷰가 `participant_id`를 의도적으로 제외했다** —
 * 그 값이 전부 노출되면 남의 쿠폰을 가로챌 취약점이 열린다(2026-08-13, 이란토).
 * 그래서 사람 단위 집계는 닉네임으로 한다(세션 ID당 닉네임 조합이 하나로 고정되므로
 * 사람 단위 키로 성립한다).
 *
 * **`best_score`를 쓰지 말 것**(2026-08-13, 이란토 확정). 실측 50행에서 전부 0이었고
 * 실제 점수는 `gookbap_score`에만 있다 — 클라이언트가 `gookbap_score`만 insert하기
 * 때문이다(`actions.ts`의 `submitGameScore`). 그래서 이 타입에는 아예 넣지 않았다.
 * `submitGameScore`를 고쳐 `best_score`를 채우지도 말 것 — 재화 집계를 오염시킬 수 있고,
 * 이란토가 안 쓴다고 확정한 컬럼이다.
 */
export type RankingViewRow = {
  nickname_first: LocalizedName | null;
  nickname_last: LocalizedName | null;
  /** nullable이고 `0614`처럼 앞자리 0이 있는 **문자열**이다. 숫자로 변환하지 말 것. */
  nickname_number: string | null;
  gookbap_score: number | null;
  joined_time: string | null;
};

/** 화면에 뿌리는 한 줄. 닉네임은 조립 전 재료로 나른다 — 표시는 로케일을 따라야 한다. */
export type RankingEntry = {
  rank: number;
  nickname: NicknameParts;
  score: number;
  /** 동점 정렬 근거. 화면에는 쓰지 않지만 테스트가 정렬을 확인하는 데 필요하다. */
  joinedTime: string;
  /**
   * `joinedTime`을 파싱한 값. 정렬은 **이것으로** 한다.
   *
   * **문자열 비교로 시각을 정렬하지 말 것.** PostgREST는 `2024-09-11T14:59:26+00:00`처럼
   * **오프셋 형식**으로 주는데(실측), 오프셋이 섞이면 문자열 순서가 시간 순서와 갈린다 —
   * `...T09:00:00+09:00`(UTC 00:00)이 `...T01:00:00+00:00`(UTC 01:00)보다 뒤로 정렬된다.
   * 지금 로컬은 전부 `+00:00`이라 우연히 맞지만, 서버 설정 하나에 조용히 뒤집힌다.
   */
  joinedAt: number;
};

/** 화면에 보여줄 최대 순위. 넘긴 것이 있으면 화면이 그 사실을 알린다(조용히 자르지 않는다). */
export const RANKING_DISPLAY_LIMIT = 20;

/** 한 페이지에 보여줄 순위 수. 20위까지를 두 페이지로 나눈다(2026-08-13, 이란토). */
export const RANKING_PAGE_SIZE = 10;

/**
 * 페이지 수. 항목이 없으면 1이다 — 0을 돌려주면 "1 / 0 페이지"가 되고, 빈 목록에서도
 * 페이지 표시가 성립해야 한다.
 */
export function rankingPageCount(
  entryCount: number,
  pageSize: number = RANKING_PAGE_SIZE
): number {
  return Math.max(1, Math.ceil(entryCount / pageSize));
}

/**
 * `page`(0부터)에 해당하는 구간. **범위를 벗어난 page는 가장 가까운 유효 페이지로 당긴다.**
 *
 * 이 보정이 필요한 이유: 2페이지를 보다가 탭을 갈아타면 그 탭의 항목이 10건 이하일 수
 * 있는데, 그때 `page`를 그대로 쓰면 빈 화면이 나온다. 호출부에서 탭 전환 시 페이지를
 * 0으로 되돌리더라도, 응답이 늦게 오는 사이에 같은 상황이 생긴다.
 */
export function rankingPageSlice(
  entries: RankingEntry[],
  page: number,
  pageSize: number = RANKING_PAGE_SIZE
): RankingEntry[] {
  const lastPage = rankingPageCount(entries.length, pageSize) - 1;
  const safePage = Math.min(Math.max(0, page), lastPage);
  return entries.slice(safePage * pageSize, safePage * pageSize + pageSize);
}

/** 한국어 값만 뽑는다. **로케일과 무관한 키**를 만드는 데만 쓴다(아래 주석 참고). */
function koText(name: LocalizedName | null): string {
  const value = name?.ko;
  return typeof value === "string" ? value.trim() : "";
}

/**
 * 사람 단위 그룹 키. **이 함수가 이 작업의 핵심 함정이 앉은 자리다.**
 *
 * **`formatNickname`의 결과를 키로 쓰면 두 가지가 동시에 깨진다:**
 *
 * 1. **로케일마다 문자열이 달라진다.** "든든한 국밥 #0023"과 "Hearty Gookbap #0023"이
 *    같은 사람인데 언어를 토글하면 그룹이 다시 계산된다.
 * 2. **더 나쁜 것 — 서로 다른 사람이 같은 키가 될 수 있다.** `formatNickname`은 두 단어가
 *    모두 해당 로케일로 번역돼 있을 때만 그 언어를 쓰고, 하나라도 비면 **통째로 한국어로
 *    떨어뜨린다**(`nicknameParts.ts`의 폴백 규칙). 영어 화면에서 번역이 덜 된 두 사람이
 *    같은 한국어 문자열로 수렴할 수 있다.
 *
 * 그래서 키는 한국어 원문 + 번호로 만든다. 번호가 UNIQUE 제약에 포함되므로 같은 단어
 * 조합이라도 사람이 갈린다.
 *
 * **`JSON.stringify`로 묶는 이유**: 단순 문자열 이어붙이기는 구분자가 단어 안에 나타날 수
 * 있어 `"AB" + "C"`와 `"A" + "BC"`가 같은 키가 된다. 배열 직렬화는 그 경계가 데이터에
 * 침범당하지 않는다.
 *
 * **번호가 null인 행은 행마다 고유한 키를 받는다.** 번호가 없으면 서로 다른 무번호
 * 참가자를 구분할 근거가 아예 없으므로, 합치는 쪽이 아니라 **합치지 않는 쪽으로 실패한다**
 * (남의 기록을 내 것으로 합쳐 보여주는 것이 더 나쁘다). 부작용으로 무번호 참가자 한 명이
 * 여러 번 플레이하면 여러 줄로 나온다 — 스펙이 고른 방향이다(§2).
 */
function groupKey(row: RankingViewRow, index: number): string {
  return (
    nicknameKey({
      first: row.nickname_first ?? {},
      last: row.nickname_last ?? {},
      number: row.nickname_number ?? null,
    }) ?? JSON.stringify(["__no-number__", index])
  );
}

/**
 * `groupKey`와 **같은 규칙으로** 만든 사람 단위 키. 화면이 "이 줄이 내 줄인가"를
 * 맞춰보는 데 쓴다. 두 곳이 각자 키를 만들면 규칙이 갈리는 순간 남의 줄을 내 줄로
 * 강조하게 되므로 한 함수에서 나온다.
 *
 * **번호가 없으면 null이다** — 무번호끼리는 구분할 근거가 없어 `groupKey`가 행마다
 * 다른 키를 주므로, 여기서 키를 만들어 봐야 절대 맞지 않는다. 애초에 "맞출 수 없음"을
 * 돌려주는 편이 호출부에서 읽기 쉽다.
 */
export function nicknameKey(nickname: NicknameParts): string | null {
  const number = nickname.number?.trim();
  if (!number) return null;
  return JSON.stringify([koText(nickname.first), koText(nickname.last), number]);
}

/**
 * 같은 기록 중 어느 쪽을 남길지. **점수가 높은 쪽, 점수까지 같으면 `joined_time`이 이른 쪽.**
 *
 * 그룹 안에서도 동점 규칙을 적용하는 것이 요점이다. 그러지 않으면 그룹 대표가 순회 순서에
 * 따라 달라져 아래 전체 정렬이 흔들린다.
 */
function isBetter(candidate: RankingEntry, incumbent: RankingEntry): boolean {
  if (candidate.score !== incumbent.score) return candidate.score > incumbent.score;
  return candidate.joinedAt < incumbent.joinedAt;
}

export type RankingList = {
  entries: RankingEntry[];
  /** 표시 상한을 넘겨 잘라낸 것이 있는가. 화면이 그 사실을 알린다. */
  truncated: boolean;
};

/**
 * 뷰 행 목록을 순위표로 만든다.
 *
 * 한 사람이 여러 번 플레이한 기록이 **필터링 없이 전부** 오므로(샘플에서 12명이 51행,
 * 한 명은 34회) 그대로 나열하면 상위권이 한 사람으로 도배된다. 닉네임당 최고점 한 줄만 남긴다.
 *
 * **동점자는 `joined_time`이 이른 쪽이 위다** — 명세가 이 컬럼을 "동점자 발생 시 랭킹을
 * 판가름하기 위해 정렬 시 참조되는 시간"으로 정의한다. 먼저 도달한 사람이 이긴다.
 */
export function toRankingList(
  rows: RankingViewRow[],
  limit: number = RANKING_DISPLAY_LIMIT
): RankingList {
  const best = new Map<string, RankingEntry>();

  rows.forEach((row, index) => {
    // 점수·시각이 없는 행은 순위를 매길 근거가 없다. 0점으로 끼워넣으면 실제 참가자를
    // 밀어내므로 버린다. **파싱 실패도 같이 버린다** — NaN은 모든 비교에서 false가 되어
    // 동점 판정을 조용히 무력화한다(정렬이 순회 순서에 좌우된다).
    if (row.gookbap_score == null || !row.joined_time) return;
    const joinedAt = new Date(row.joined_time).getTime();
    if (Number.isNaN(joinedAt)) return;

    const entry: RankingEntry = {
      rank: 0, // 정렬 후에 매긴다.
      nickname: {
        first: row.nickname_first ?? {},
        last: row.nickname_last ?? {},
        number: row.nickname_number?.trim() || null,
      },
      score: row.gookbap_score,
      joinedTime: row.joined_time,
      joinedAt,
    };

    const key = groupKey(row, index);
    const incumbent = best.get(key);
    if (!incumbent || isBetter(entry, incumbent)) best.set(key, entry);
  });

  const sorted = [...best.values()].sort((a, b) =>
    b.score !== a.score ? b.score - a.score : a.joinedAt - b.joinedAt
  );

  return {
    entries: sorted.slice(0, limit).map((entry, index) => ({ ...entry, rank: index + 1 })),
    truncated: sorted.length > limit,
  };
}
