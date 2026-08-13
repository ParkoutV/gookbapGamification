"use client";

import { useEffect, useState } from "react";
import PixelPanel from "./PixelPanel";
import { useLocale } from "../lib/i18n/LocaleContext";
import { formatNickname } from "../lib/nicknameParts";
import { fetchRanking } from "../actions";
import { RANKING_PERIODS, type RankingPeriod } from "../lib/rankingPeriod";
import { toRankingList, RANKING_DISPLAY_LIMIT, type RankingEntry } from "../lib/rankingRows";

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
 * ## 내 기록 강조는 하지 않는다
 *
 * `ranking_view`에 `participant_id`가 없어서(노출되면 남의 쿠폰을 가로챌 수 있다)
 * "내 순위"를 확실히 특정할 수 없다. 닉네임으로 맞춰볼 수는 있지만 **틀린 줄을 내
 * 것으로 강조하는 쪽이 안 하는 것보다 나쁘다**(2026-08-13, 이란토).
 */
export default function RankingScreen({ onClose }: { onClose: () => void }) {
  const { locale, t } = useLocale();
  const [period, setPeriod] = useState<RankingPeriod>("daily");

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

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh bg-bg text-ink p-6">
      <PixelPanel size="card" title={t("window.brand")} className="max-w-sm w-full">
        <h1 className="text-2xl font-extrabold mb-4 text-ink text-center">{t("ranking.title")}</h1>

        {/* 탭 4개. **320px에서 넘치지 않아야 한다** — `flex-1` + `min-w-0`으로 폭을 균등
            분배하고 `text-xs px-1`로 안쪽 여백을 줄였다(2026-08-13 실측: 320px에서 가로
            넘침 0, 글자 잘림 0).

            영어("This Month")는 칸 안에서 **두 줄로 감긴다**(높이 32px → 48px). 네 칸이
            같이 커지므로 줄만 늘고 넘치지는 않아, 줄바꿈을 막는 대신 그대로 뒀다 —
            `whitespace-nowrap`을 걸면 그때부터 실제로 넘친다.

            `PixelPanel size="btn"`을 쓰지 않는다: 그쪽은 베벨 테두리가 칸마다 붙어
            네 개를 나란히 두면 폭 예산을 먹고, 선택 상태를 표현할 자리도 없다. */}
        <div className="flex gap-1 mb-4">
          {RANKING_PERIODS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setPeriod(tab)}
              aria-pressed={period === tab}
              className={`pixel-mask-btn-solid flex-1 min-w-0 py-2 px-1 text-xs font-bold transition-opacity active:scale-95 ${
                period === tab ? "bg-accent text-accent-ink" : "bg-surface text-ink"
              }`}
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
            <ol className="flex flex-col gap-1 mb-4">
              {current.entries.map((entry) => (
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
