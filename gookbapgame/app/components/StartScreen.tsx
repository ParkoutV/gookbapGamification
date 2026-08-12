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
  onGoToDraw?: () => void;
  trackId: string | null;
}

export default function StartScreen({
  nickname,
  onRegenerateNickname,
  isRegeneratingNickname,
  onStart,
  onOpenTutorial,
  onGoToDraw,
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
    <div className="flex flex-col items-center justify-center min-h-dvh bg-bg text-ink p-6">
      <PixelPanel size="card" title={t("window.brand")} className="max-w-md w-full text-center">
        <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: "var(--font-pixel)" }}>
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
        {onGoToDraw && (
          <button
            onClick={onGoToDraw}
            className="block w-fit mx-auto mb-4 text-sm text-muted underline underline-offset-4 bg-transparent border-0 p-0"
          >
            {t("start.goToDrawButton")}
          </button>
        )}
        <div className="grid grid-cols-1 gap-2 w-full">
          <PixelPanel size="btn">
            <button type="button" className="w-full font-bold text-ink text-sm">{t("start.myResult")}</button>
          </PixelPanel>
          <PixelPanel size="btn">
            <button type="button" className="w-full font-bold text-ink text-sm">{t("start.ranking")}</button>
          </PixelPanel>
          <PixelPanel size="btn">
            <button type="button" onClick={onOpenTutorial} className="w-full font-bold text-ink text-sm">
              {t("tutorial.openButton")}
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
