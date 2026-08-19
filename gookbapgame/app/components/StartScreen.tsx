"use client";

import { useCallback, useEffect, useState } from "react";
import PixelPanel from "./PixelPanel";
import { useLocale } from "../lib/i18n/LocaleContext";
import { formatNickname, type Nickname } from "../lib/nicknameParts";
import { fetchSharedTrackId, recordShareClick } from "../actions";
import { buildInviteMessage, buildInviteUrl } from "../lib/inviteLink";

interface StartScreenProps {
  /** 조립 전 재료다. 문자열로 만드는 것은 이 화면의 몫 — `formatNickname` 참고. */
  nickname: Nickname;
  onRegenerateNickname: () => void;
  isRegeneratingNickname: boolean;
  onStart: () => void;
  onOpenTutorial: () => void;
  onOpenRanking: () => void;
  onOpenMyCoupons: () => void;
  /**
   * 뽑기 기회가 남았는가. '내 쿠폰' 버튼에 red-dot을 찍는 데만 쓴다 —
   * **뽑기 진입 자체는 쿠폰 목록 안에 있다**(2026-08-13, 이란토).
   */
  hasPendingDraw: boolean;
  trackId: string | null;
  /** 약관·개인정보처리방침·쿠폰안내 창을 연다. 아래 푸터 주석 참고. */
  onOpenLegal: () => void;
}

export default function StartScreen({
  nickname,
  onRegenerateNickname,
  isRegeneratingNickname,
  onStart,
  onOpenTutorial,
  onOpenRanking,
  onOpenMyCoupons,
  hasPendingDraw,
  trackId,
  onOpenLegal,
}: StartScreenProps) {
  const { t, locale } = useLocale();

  // 초대 링크는 **미리** 만들어 둔다. 클릭 핸들러 안에서 트랙을 조회한 뒤
  // clipboard.writeText를 부르면, iOS Safari가 사용자 제스처와 끊긴 것으로 보고
  // 거부한다(useCardImageSave의 navigator.share와 같은 제약).
  // 링크만 state로 들고, 문구 조립은 렌더 중에 한다 — 로케일을 바꿨다고
  // 트랙을 다시 조회할 이유는 없다.
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteFeedback, setInviteFeedback] = useState<"copied" | "failed" | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchSharedTrackId(trackId).then((sharedTrackId) => {
      if (cancelled || !sharedTrackId) return;
      setInviteUrl(buildInviteUrl(window.location.href, sharedTrackId));
    });
    return () => {
      cancelled = true;
    };
  }, [trackId]);

  const inviteMessage = inviteUrl ? buildInviteMessage(t("start.invitePromo"), inviteUrl) : null;

  const handleInvite = useCallback(() => {
    if (!inviteMessage) return;
    // await 없이 곧바로 쓴다(위 useEffect 주석 참고).
    navigator.clipboard
      .writeText(inviteMessage)
      .then(() => setInviteFeedback("copied"))
      .catch((error) => {
        console.error("[StartScreen] 초대 링크 복사 실패:", error);
        setInviteFeedback("failed");
      });
    // KPI 4단계. 실패해도 게임 진행을 막지 않는다.
    void recordShareClick();
  }, [inviteMessage]);

  return (
    // footer를 바닥에 붙이는 것은 `justify-center`가 아니라 auto margin이다
    // (2026-08-19, 이란토 제보). 예전에는 루트가 `justify-center`라 패널과 footer가
    // **한 묶음으로** 세로 가운데에 모였다 — 세로가 빠듯한 모바일에서는 내용이 화면을
    // 꽉 채워 footer가 하단에 붙은 것처럼 보였지만, 데스크톱처럼 높이가 남으면 묶음째
    // 가운데로 올라와 footer가 화면 한복판에 떴다. `justify-center`를 되살리지 말 것 —
    // auto margin과 겹치면 auto가 이겨서 코드만 헷갈려진다.
    <div className="flex flex-col items-center min-h-dvh text-ink p-6">
      <PixelPanel size="card" title={t("window.brand")} className="my-auto max-w-md w-full text-center">
        {/* `break-keep`(word-break: keep-all)이 없으면 어절 중간에서 끊긴다 —
            "도전! 1953 틀 / 린그림찾기"처럼(2026-08-14, 320·390px 실측). 한국어는
            단어 사이 공백이 CJK 줄바꿈 규칙에 밀려 브라우저가 아무 글자에서나 끊는다.
            `text-wrap: balance`·`pretty` 둘 다 이걸 막지 못한다(실측). 제목이 길어
            두 줄이 되는 것 자체는 정상이며, 줄 수가 아니라 **끊기는 위치**가 문제다. */}
        <h1
          className="text-3xl font-bold mb-2 break-keep"
          style={{ fontFamily: "var(--font-pixel)" }}
        >
          {t("start.title")}
        </h1>
        <div className="flex items-center justify-center gap-2 mb-8">
          <span className="text-ink">
            {t("start.welcome", { nickname: formatNickname(nickname, locale) })}
          </span>
          <button
            type="button"
            onClick={onRegenerateNickname}
            disabled={isRegeneratingNickname}
            aria-label={t("start.regenerateNicknameAria")}
            className="text-xl disabled:opacity-40"
          >
            🔄
          </button>
        </div>
        <button
          onClick={onStart}
          className="pixel-mask-btn-solid w-full py-4 px-6 bg-accent text-accent-ink text-xl font-bold transition-opacity active:scale-95 mb-4"
        >
          {t("start.playButton")}
        </button>
        {/* 2열 배치(2026-08-13, 이란토):
              게임 시작
              튜토리얼 | 랭킹
              내 쿠폰 | 친구 초대하기

            **'쿠폰 뽑으러 가기'가 여기 없다.** 예전에는 뽑기 기회가 남았을 때만 '게임
            시작' 아래에 링크로 떴는데, 이제 '내 쿠폰' 안에서 처리하고 여기서는 그 버튼에
            red-dot만 찍는다 — 첫 화면에 조건부로 나타나고 사라지는 항목이 있으면 레이아웃이
            흔들리고, 뽑기와 쿠폰 목록은 같은 자리에 있는 편이 자연스럽다.

            **초대 버튼이 없으면 빈 칸을 남긴다.** 공유 트랙을 못 찾으면 버튼을 띄우지
            않는데(아래 주석), 그때 '내 쿠폰'이 두 칸을 차지하며 늘어나면 위 두 줄과
            폭이 어긋나 보인다. */}
        <div className="grid grid-cols-2 gap-2 w-full">
          <PixelPanel size="btn">
            <button type="button" onClick={onOpenTutorial} className="w-full font-bold text-ink text-sm">
              {t("tutorial.openButton")}
            </button>
          </PixelPanel>
          <PixelPanel size="btn">
            <button type="button" onClick={onOpenRanking} className="w-full font-bold text-ink text-sm">
              {t("start.ranking")}
            </button>
          </PixelPanel>
          <PixelPanel size="btn">
            {/* red-dot은 뽑기 기회가 남았을 때만(`hasPendingDraw`). 목록 안에 뽑기 진입이
                있다는 것을 첫 화면에서 알리는 유일한 신호라, 이것이 없으면 기회가 남은
                줄도 모른 채 지나간다. `relative`는 점의 기준이다.

                **점을 버튼 경계 밖으로 내보내지 말 것.** `-right-0.5`로 걸쳐 놓았다가
                320px에서 버튼이 2px 넘쳤다(2026-08-13 실측). 바깥 `PixelPanel`이 베벨을
                들고 있어 그 위에 점이 올라타면 잘리기도 한다. `right-0`으로 안쪽에 붙인다. */}
            <button
              type="button"
              onClick={onOpenMyCoupons}
              className="relative w-full font-bold text-ink text-sm"
            >
              {t("coupon.myCouponsButton")}
              {hasPendingDraw && (
                <span
                  aria-hidden="true"
                  className="absolute top-0 right-0 w-2 h-2 rounded-full bg-error"
                />
              )}
              {/* 점은 장식이므로 스크린리더에는 문장으로 알린다. */}
              {hasPendingDraw && <span className="sr-only"> {t("start.drawAvailableNotice")}</span>}
            </button>
          </PixelPanel>
          {/* 공유 트랙을 찾지 못하면 버튼 자체를 띄우지 않는다 — 현재 URL로 대체하면
              is_shared=false인 매장 트랙이 실려 공유 유입이 잘못 집계된다. */}
          {inviteMessage && (
            <PixelPanel size="btn">
              <button
                type="button"
                onClick={handleInvite}
                className="w-full font-bold text-ink text-sm"
              >
                {t("start.inviteButton")}
              </button>
            </PixelPanel>
          )}
        </div>
        {inviteFeedback && (
          <p className="mt-2 text-xs text-muted" role="status">
            {t(inviteFeedback === "copied" ? "start.inviteCopied" : "start.inviteFailed")}
          </p>
        )}
      </PixelPanel>

      {/* 푸터. **패널 바깥, 패널 바로 아래다** — 뷰포트 바닥에 fixed로 붙이면 이 화면의
          `justify-center` 세로 중앙 정렬과 싸우게 된다(2026-08-14, 이란토).

          **최초 고지 이후 법률 문서를 다시 볼 수 있는 유일한 진입점이라** 링크를
          copyright와 함께 둔다. 개인정보처리방침은 언제든 열람할 수 있어야 하는데,
          첫 실행에만 뜨는 팝업으로 끝내면 그 통로가 없다.

          **회사명은 로케일 파일이 아니라 여기 하드코딩한다.** 4개 파일에 같은 값이
          들어가면 언젠가 어긋난다 — `LOCALE_LABELS`와 `GAME OVER`/`CLEAR!` 리터럴을
          로케일에서 뺀 것과 같은 근거다(AGENTS.md 연출 글자 절). 상호는 번역 대상이
          아니고, 표기는 회사 문서를 따라 '(주)웨이브앤바이브'다. */}
      {/* **글자를 흰색으로 둔다.** 푸터는 `PixelPanel` 바깥이라 배경 사진에 그대로
          노출되는 유일한 텍스트이고, 이제 배경은 (게임 중을 빼면) 항상 깔린다.
          `text-muted`(#5A6570)를 그대로 두면 `city_midnight` 위에서 **2.02:1**까지
          떨어진다 — 개인정보처리방침 재열람의 유일한 통로라(AGENTS.md) 실제 손실이다.

          **회색을 유지한 채로는 못 고친다.** #5A6570의 휘도가 배경들과 `--bg` 사이에
          끼어 있어 배경을 밝히면 대비가 단조 증가하지 않고 글자 휘도를 통과한다
          (α=0.3 → 1.03 / 0.5 → 1.47 / 0.7 → 2.15). 어둡게 하는 방향에서만 흰 글자의
          대비가 단조 증가한다.

          가독성은 배경 레이어 하단의 그라데이션이 만든다(`DaylightBackground`) —
          푸터 자리 국소 최악 **7.22:1**로 AA를 넘는다. 사각형 칩을 얹는 안은
          `day`처럼 밝은 배경에서 그 자리만 패인 것처럼 보여 버렸다(2026-08-15 이란토). */}
      <footer className="mt-auto pt-4 flex flex-col items-center gap-1 text-center">
        <button
          type="button"
          onClick={onOpenLegal}
          className="text-xs text-white underline underline-offset-2"
        >
          {t("legal.openButton")}
        </button>
        <p className="text-[0.65rem] text-white">
          Copyright © 2026 (주)웨이브앤바이브
        </p>
      </footer>
    </div>
  );
}
