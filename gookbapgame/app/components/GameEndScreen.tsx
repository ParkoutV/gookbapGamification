"use client";

import { useLocale } from "../lib/i18n/LocaleContext";
import { gameEndLabelKey, GameEndReason } from "../lib/gameEnd";

interface GameEndScreenProps {
  reason: GameEndReason;
  onNext: () => void;
}

/**
 * 게임 종료 연출. GAME OVER(시간 초과·오답 소진) / CLEAR(완주)를 띄우고 **멈춘다** —
 * 자동으로 결과표로 넘기지 않고, 하단 중앙의 '결과 확인' 버튼을 눌러야 넘어간다
 * (2026-08-11, 이란토).
 *
 * 라벨은 foundCount로 역산하지 않는다. 어느 경로로 끝났는지는 호출부가 이미 알고
 * 있고(page.tsx가 onStageClear/onForceAdvance를 별개 prop으로 넘긴다), 그 사실이
 * endReason으로 여기까지 온다.
 *
 * 소리는 내지 않는다. 결과표의 coindrop은 "결과가 나왔다"는 신호라 결과표에 붙어
 * 있어야 하고, 새 효과음을 추가하는 것은 요청 범위 밖이다.
 *
 * 그래픽 애셋을 새로 만들지 않는다 — 픽셀 폰트(Galmuri11) + 그림자 + 기울임으로
 * 카운트다운과 같은 `.game-cue`를 쓴다.
 */
export default function GameEndScreen({ reason, onNext }: GameEndScreenProps) {
  const { t } = useLocale();

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-bg px-6">
      <span
        className="game-cue"
        style={{ fontFamily: "var(--font-pixel)" }}
        aria-live="assertive"
      >
        {t(gameEndLabelKey(reason))}
      </span>

      {/* 하단 중앙. 연출 문구와 겹치지 않게 화면 아래에 고정한다. */}
      <button
        onClick={onNext}
        className="pixel-mask-btn-solid absolute bottom-12 py-3 px-8 bg-accent text-accent-ink font-bold transition-opacity active:scale-95"
      >
        {t("gameEnd.nextButton")}
      </button>
    </div>
  );
}
