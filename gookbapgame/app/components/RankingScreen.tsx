"use client";

import { useEffect, useState } from "react";
import PixelPanel from "./PixelPanel";
import { useLocale } from "../lib/i18n/LocaleContext";
import { formatNickname } from "../lib/nicknameParts";
import { fetchMyBestScore, fetchRanking } from "../actions";
import { RANKING_PERIODS, type RankingPeriod } from "../lib/rankingPeriod";
import {
  toRankingList,
  rankingPageCount,
  rankingPageSlice,
  RANKING_DISPLAY_LIMIT,
  type RankingEntry,
} from "../lib/rankingRows";

/**
 * 랭킹 화면. 탭 4개(오늘/이번 주/이번 달/전체)를 가로로 두고 상위 순위를 보여준다.
 *
 * ## 집계는 이 컴포넌트가 하지 않는다
 *
 * 기간 필터는 **서버로 내려보내고**(`fetchRanking`), 닉네임당 최고점 한 줄로 줄이는
 * 것은 순수 함수(`toRankingList`)가 한다. 둘 다 여기 인라인하면 테스트할 수 없고,
 * 특히 기간 경계는 틀려도 **오류가 나지 않고 조용히 9시간이 사라지는** 자리다
 * (`rankingPeriod.ts`의 `kstMidnight` 주석).
 *
 * ## 표시 닉네임은 `formatNickname`, 그룹 키는 그것을 쓰지 않는다
 *
 * 표시는 로케일을 따라야 하지만 **그룹 키로는 절대 쓸 수 없다** — 로케일마다 문자열이
 * 달라지고, 더 나쁘게는 번역이 덜 된 서로 다른 사람이 같은 한국어 문자열로 수렴한다
 * (`rankingRows.ts`의 `groupKey` 주석). 그래서 키는 순수 함수가 한국어 원문 + 번호로
 * 만들고, 이 컴포넌트는 표시만 담당한다.
 *
 * ## 내 점수는 보여주고, 내 **순위**는 보여주지 않는다
 *
 * 제목 아래에 내 최고점만 띄운다(2026-08-13, 이란토). `ranking_view`에 `participant_id`가
 * 없어서(노출되면 남의 쿠폰을 가로챌 수 있다) 목록에서 내 줄을 확실히 특정할 수 없다 —
 * 닉네임으로 맞춰볼 수는 있지만 **틀린 줄을 내 것으로 강조하는 쪽이 안 하는 것보다
 * 나쁘다.** 점수는 `get_my_score_logs`가 내 기록만 주므로 정확하다(`fetchMyBestScore`).
 */
export default function RankingScreen({ onClose }: { onClose: () => void }) {
  const { locale, t } = useLocale();
  const [period, setPeriod] = useState<RankingPeriod>("daily");
  /** 0부터. 탭을 갈아탈 때 0으로 되돌린다 — 2페이지를 보다 옮기면 빈 화면이 된다. */
  const [page, setPage] = useState(0);
  /** 내 최고점. null은 "기록 없음"과 "조회 실패"를 함께 뜻한다 — 둘 다 안 띄우면 되므로
   *  구분할 필요가 없다(목록의 빈/실패 구분과 사정이 다르다). */
  const [myBest, setMyBest] = useState<number | null>(null);

  /*
   * 조회 결과를 **어느 탭의 것인지와 함께** 한 덩어리로 들고 있다.
   *
   * 상태를 쪼개지 않는 이유가 두 가지다.
   *
   * 1. **`loading`을 state로 두면 이펙트 안에서 동기 setState를 해야 한다** — 그러면
   *    렌더가 연쇄로 돌고(`react-hooks/set-state-in-effect`), 이 저장소에 이미 많은
   *    그 경고를 하나 더 늘린다. `loaded.period !== period`가 곧 "아직 안 온 것"이므로
   *    파생값으로 충분하다.
   * 2. **쪼개면 탭을 갈아탈 때 이전 탭의 순위가 한 프레임 남는다.** 목록·안내 문구가
   *    각자 state면 새 응답이 오기 전까지 옛 값이 그려지므로, 느린 회선에서 '오늘' 탭에
   *    '전체' 순위가 잠깐 뜬다 — 조용히 틀린 화면이다.
   *
   * `ok`를 담아 **빈 목록과 조회 실패를 구분한다.** 같은 문구를 쓰면 DB 장애가 "오늘
   * 아무도 안 함"으로 위장된다(설문 조회에서 얻은 교훈, `surveyFetchResult.ts`).
   */
  const [loaded, setLoaded] = useState<{
    period: RankingPeriod;
    ok: boolean;
    entries: RankingEntry[];
    /** 표시 상한(상위 20위)을 넘겼는가. */
    truncated: boolean;
    /** 서버 응답 자체가 PostgREST 행 상한에 걸려 잘렸는가. 위와 다른 사정이라 문구도 다르다. */
    partial: boolean;
  } | null>(null);

  /* 내 최고점은 탭과 무관하므로 한 번만 받는다 — 탭을 갈아탈 때마다 다시 부를 이유가 없다. */
  useEffect(() => {
    let cancelled = false;
    void fetchMyBestScore().then((score) => {
      if (!cancelled) setMyBest(score);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void fetchRanking(period).then((result) => {
      // 탭을 빨리 갈아타면 앞선 요청이 늦게 돌아와 다른 탭의 결과를 덮어쓴다.
      if (cancelled) return;

      const list = toRankingList(result.rows);
      setLoaded({
        period,
        ok: result.ok,
        entries: list.entries,
        truncated: list.truncated,
        partial: result.truncated,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [period]);

  // 지금 탭의 결과가 아직 없으면 로딩이다(위 주석 1번).
  const current = loaded?.period === period ? loaded : null;

  /* 페이지 계산은 순수 함수에 맡긴다 — `rankingPageSlice`가 범위를 벗어난 page를 보정해서,
     응답이 늦게 오는 사이에 탭이 바뀌어도 빈 화면이 나오지 않는다. */
  const pageCount = rankingPageCount(current?.entries.length ?? 0);
  const pageEntries = current ? rankingPageSlice(current.entries, page) : [];

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh bg-bg text-ink p-6">
      <PixelPanel size="card" title={t("window.brand")} className="max-w-sm w-full">
        {/* 제목과 내 점수를 한 덩어리로 묶어 아래 여백을 한 곳에서 준다 — 내 점수 줄이
            없을 때(기록 없음·조회 실패) 제목 마진을 따로 손볼 필요가 없다. */}
        <div className="mb-4">
          <h1 className="text-2xl font-extrabold text-ink text-center">{t("ranking.title")}</h1>

          {/* 내 최고점. **순위는 붙이지 않는다**(위 컴포넌트 주석 참고).
              기록이 없거나 조회에 실패하면 줄 자체를 띄우지 않는다 — "0점"으로 보여주면
              0점을 낸 것처럼 읽힌다. */}
          {myBest != null && (
            <p className="text-sm text-muted text-center mt-1">
              {t("ranking.myBestScore", { score: myBest.toLocaleString(locale) })}
            </p>
          )}
        </div>

        {/* 탭은 **기간 3개 + '전체' 한 줄**로 나눈다(2026-08-14). 넷을 한 줄에 두면
            320px에서 칸이 54px뿐이라 "최근 30일"이 "최근 30 / 일"로 접히고, flex 행
            높이는 함께 오르므로 **네 칸이 모두** 32px → 48px이 된다. 셋만 두면 칸이
            73px가 되어 전부 한 줄에 앉는다(320px 실측).

            **문구를 줄여 해결하지 말 것** — "7일/30일"로 줄이면 한 줄에 들어가지만
            롤링 윈도우라는 뜻이 흐려진다. 탭 이름과 집계 기준은 함께 움직여야 한다
            (`rankingPeriod.ts` 참고).

            **`whitespace-nowrap`으로 막지도 말 것** — 접힘은 사라지지만 그때부터
            실제로 가로가 넘친다. 폭을 만들어 주는 것이 유일한 해결이다.

            이 배치로 **네 로케일 모두 한 줄 32px**이 된다(320px 실측). en은 "Last"를
            떼어 `7 Days`/`30 Days`로 줄인 결과다 — 옆에 `Today`·`All Time`이 있어
            기간이라는 것이 문맥으로 읽힌다. 라벨을 늘리면 그 로케일만 두 줄이 되고
            같은 줄의 세 칸이 함께 커진다.

            `flex-1` + `min-w-0`으로 폭을 균등 분배하고 `text-xs px-1`로 안쪽 여백을
            줄인 것은 그대로다(2026-08-13 실측: 320px에서 가로 넘침 0, 글자 잘림 0).

            '전체'가 아래 줄인 것은 오늘 → 7일 → 30일 → 전체로 **기간이 커지는 순서**를
            지키기 위해서다. 기본 선택이 '오늘'이라 그것이 첫 줄에 있어야 한다.

            `PixelPanel size="btn"`을 쓰지 않는다: 그쪽은 베벨 테두리가 칸마다 붙어
            나란히 두면 폭 예산을 먹고, 선택 상태를 표현할 자리도 없다. */}
        <div className="flex flex-wrap gap-1 mb-4">
          {RANKING_PERIODS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => {
                setPeriod(tab);
                // 2페이지를 보다 옮기면 항목이 10건 이하인 탭에서 빈 화면이 된다.
                // (`rankingPageSlice`도 범위를 보정하지만 표시 번호까지 맞으려면 여기서 리셋한다.)
                setPage(0);
              }}
              aria-pressed={period === tab}
              className={`pixel-mask-btn-solid flex-1 min-w-0 py-2 px-1 text-xs font-bold transition-opacity active:scale-95 ${
                // 'total'만 `basis-full`로 줄을 통째로 차지한다. flex-wrap만으로는
                // 넷이 한 줄에 다 들어가 버려(각 54px) 접힘이 그대로 남는다.
                tab === "total" ? "basis-full" : ""
              } ${period === tab ? "bg-accent text-accent-ink" : "bg-surface text-ink"}`}
            >
              {t(`ranking.tab.${tab}`)}
            </button>
          ))}
        </div>

        {!current && <p className="text-muted text-center py-8">{t("ranking.loading")}</p>}

        {/* 조회 실패. 빈 목록과 다른 문구다(위 loaded 주석). */}
        {current && !current.ok && (
          <p className="text-error text-center py-8 text-sm">{t("ranking.loadFailed")}</p>
        )}

        {current?.ok && current.entries.length === 0 && (
          <p className="text-muted text-center py-8">{t("ranking.empty")}</p>
        )}

        {current?.ok && current.entries.length > 0 && (
          <>
            {/* 등수·점수는 자리가 정해져 있고 닉네임만 늘어난다.

                **고정 열은 좁게 잡는다.** 등수·점수에 넉넉한 폭(w-8/w-16 + gap-2)을 주면
                320px에서 닉네임 칸이 101px로 줄어든다. 지금 값으로 133px, 375px에서는
                203px다. 등수는 두 자리(표시 상한이 20위), 점수는 `1,953`까지 들어간다.

                **닉네임 칸만 좌우로 스크롤한다**(2026-08-13, 이란토). 처음에는 `truncate`로
                한 줄에 밀어넣었는데, 프로덕션 닉네임 프리셋의 영어 표기가 **평균 23자,
                최대 33자**여서(이란토가 뜬 샘플 50건 실측) 320px에서 여덟 줄이 잘렸다.
                랭킹은 "누가 몇 위인가"를 읽는 화면이라 이름이 잘리면 목적을 잃는다.
                `title` 속성은 대안이 못 된다 — **모바일에는 hover가 없다.**

                - **목록 전체를 스크롤하지 않는다.** 표를 옆으로 밀면 등수·점수 열도 함께
                  나가서 순위를 대조할 수 없다. 스크롤은 닉네임 칸 안에서만 일어난다.
                - **두 줄로 흘리지도 않는다.** 줄마다 높이가 갈려 목록이 들쭉날쭉해지고,
                  고정 높이로 막으면 이번엔 세 줄짜리가 잘린다.
                - `whitespace-nowrap`이 없으면 flex 자식이 줄바꿈해서 스크롤이 생기지 않는다.
                  스크롤바는 감춘다 — 줄마다 하나씩 생기면 목록이 지저분해진다(잘린 것이
                  있다는 신호는 글자가 칸 끝에 붙어 있는 것으로 충분하다). */}
            <div className="flex gap-1.5 pb-1 mb-1 border-b border-ink/20 text-xs text-muted">
              <span className="w-6 text-center shrink-0">{t("ranking.rankHeader")}</span>
              <span className="flex-1 min-w-0">{t("ranking.nicknameHeader")}</span>
              <span className="w-11 text-right shrink-0">{t("ranking.scoreHeader")}</span>
            </div>
            {/* 목록 높이를 고정한다. 마지막 페이지가 10건 미만이면 패널이 줄어들어 아래
                페이지 버튼과 '닫기'가 위로 튀는데, 페이지를 넘길 때마다 버튼이 움직이면
                연속으로 누르기 어렵다. 한 줄 20px + gap 4px × 9 = 236px. */}
            <ol className="flex flex-col gap-1 mb-3 h-[236px]">
              {pageEntries.map((entry) => (
                <li
                  key={`${entry.rank}-${entry.joinedTime}`}
                  className="flex gap-1.5 items-center text-sm"
                >
                  <span className="w-6 text-center font-bold text-accent shrink-0">
                    {entry.rank}
                  </span>
                  <span className="flex-1 min-w-0 text-ink whitespace-nowrap overflow-x-auto ranking-nickname">
                    {formatNickname(entry.nickname, locale)}
                  </span>
                  <span className="w-11 text-right font-bold text-ink tabular-nums shrink-0">
                    {entry.score.toLocaleString(locale)}
                  </span>
                </li>
              ))}
            </ol>

            {/* 페이지 이전-다음(2026-08-13, 이란토). 한 페이지 10위씩 최대 20위까지.
                **페이지가 하나면 버튼째로 감춘다** — 누를 수 없는 버튼을 두 개 두면
                목록이 더 있는 것처럼 보인다. */}
            {pageCount > 1 && (
              <div className="flex items-center justify-center gap-3 mb-3">
                <button
                  type="button"
                  onClick={() => setPage((prev) => Math.max(0, prev - 1))}
                  disabled={page <= 0}
                  aria-label={t("ranking.prevPageAria")}
                  className="pixel-mask-btn-solid py-1 px-3 bg-surface text-ink font-bold text-sm transition-opacity active:scale-95 disabled:opacity-40"
                >
                  {"<"}
                </button>
                <span className="text-xs text-muted tabular-nums">
                  {t("ranking.pageIndicator", {
                    current: String(page + 1),
                    total: String(pageCount),
                  })}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((prev) => Math.min(pageCount - 1, prev + 1))}
                  disabled={page >= pageCount - 1}
                  aria-label={t("ranking.nextPageAria")}
                  className="pixel-mask-btn-solid py-1 px-3 bg-surface text-ink font-bold text-sm transition-opacity active:scale-95 disabled:opacity-40"
                >
                  {">"}
                </button>
              </div>
            )}

            {/* **조용히 잘라내지 않는다.** 안내가 없으면 "전체가 이만큼"으로 읽힌다.
                두 안내는 사정이 다르다 — 위는 우리가 20위까지만 그린 것이고, 아래는
                서버 응답 자체가 행 상한에 걸린 것이다(`fetchRanking` 주석). */}
            {current.truncated && (
              <p className="text-muted text-xs text-center mb-2">
                {t("ranking.limitNotice", { limit: String(RANKING_DISPLAY_LIMIT) })}
              </p>
            )}
            {current.partial && (
              <p className="text-muted text-xs text-center mb-2">{t("ranking.partialNotice")}</p>
            )}
          </>
        )}

        <button
          onClick={onClose}
          className="pixel-mask-btn-solid w-full py-3 px-6 bg-accent text-accent-ink font-bold transition-opacity active:scale-95"
        >
          {t("ranking.closeButton")}
        </button>
      </PixelPanel>
    </div>
  );
}
