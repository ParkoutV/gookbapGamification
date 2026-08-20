"use client";

import { useCallback, useEffect, useState } from "react";
import PixelPanel from "./PixelPanel";
import CreditsScreen from "./CreditsScreen";
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
}: StartScreenProps) {
  const { t, locale } = useLocale();

  // 초대 링크는 **미리** 만들어 둔다. 클릭 핸들러 안에서 트랙을 조회한 뒤
  // clipboard.writeText를 부르면, iOS Safari가 사용자 제스처와 끊긴 것으로 보고
  // 거부한다(useCardImageSave의 navigator.share와 같은 제약).
  // 링크만 state로 들고, 문구 조립은 렌더 중에 한다 — 로케일을 바꿨다고
  // 트랙을 다시 조회할 이유는 없다.
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteFeedback, setInviteFeedback] = useState<"copied" | "failed" | null>(null);

  // 크레딧 상태는 page.tsx로 올리지 않는다 — 여는 곳도 닫는 곳도 이 화면뿐이고,
  // 다른 phase에서는 열릴 일이 없다(법률 고지가 루트에 있는 것은 최초 실행 게이트라서다).
  const [showCredits, setShowCredits] = useState(false);

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
    // **footer는 이 화면에 없다** — `page.tsx`가 렌더한다(2026-08-20, `SiteFooter`).
    // 여기 있던 시절에 세 번 자리를 옮겼고, 그 이력이 지금도 유효한 함정이라 남긴다
    // (흐름 밖 absolute + 패널만 `justify-center`라는 결론은 `SiteFooter`가 물려받았다):
    // 1. 루트 `justify-center` + 흐름 footer → 패널과 footer가 **한 묶음으로** 가운데
    //    모여, 높이가 남는 데스크톱에서 footer가 화면 한복판에 떴다.
    // 2. 패널 `my-auto` + footer `mt-auto` → footer는 바닥에 붙었지만, auto 마진이
    //    셋(패널 위·아래, footer 위)이라 남는 높이가 **3등분**된다. 패널이 절반이
    //    아니라 1/3 지점에 앉아 위로 밀려 올라간 것이 그 증상이다.
    // footer를 흐름에서 빼면 패널이 뷰포트 정중앙에 온다. 기준은 뷰포트가 아니라
    // 이 루트 요소(`relative`)라, 내용이 길어져 루트가 늘어나면 footer도 그 바닥으로
    // 따라 내려간다 — `fixed`였다면 긴 내용 위에 겹쳐 떠서 2026-08-14에 걷어냈던
    // 그 문제가 되살아난다. **`fixed`로 바꾸지 말 것.**
    // ponytail: 패널 높이가 (뷰포트 - footer 높이 약 46px)를 넘는 좁은 기기에서는
    // footer가 패널 아래쪽에 겹칠 수 있다. 실제로 겹치면 흐름 배치로 되돌리고
    // 위 2번 대신 "패널을 감싼 `flex-1` 영역 안에서 가운데" 방식을 쓸 것
    // (그러면 footer 높이의 절반만큼만 위로 치우친다).
    <div className="relative flex flex-col items-center justify-center min-h-dvh text-ink p-6 pb-[var(--footer-space)]">
      {/* 크레딧 진입. 좌상단 툴바(page.tsx)와 대칭인 우상단 끝이고, 같은 `z-[60]`이다.
          이 게임의 주 동선이 아니라 일부러 작게 둔다. */}
      {/* 높이는 `PixelPanel`의 `.pixel-frame-inner--btn`(상하 .7rem)이 정한다 —
          버튼의 py만 줄여봐야 꿈쩍도 안 한다. 이 자리에서만 그 패딩을 눌러 낮춘다. */}
      <div className="fixed top-2 right-2 z-[60] [&_.pixel-frame-inner]:!py-1">
        <PixelPanel size="btn">
          <button
            type="button"
            onClick={() => setShowCredits(true)}
            className="px-1.5 py-0.5 text-[0.6rem] font-bold text-ink leading-tight"
          >
            만든 사람들
          </button>
        </PixelPanel>
      </div>
      {showCredits && <CreditsScreen onClose={() => setShowCredits(false)} />}

      <PixelPanel size="card" title={t("window.brand")} className="max-w-md w-full text-center">
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

    </div>
  );
}
