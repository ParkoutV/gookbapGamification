"use client";

import { useEffect, useRef } from "react";
import PixelPanel from "./PixelPanel";
import { useLocale } from "../lib/i18n/LocaleContext";
import { gameEndLabel, GameEndReason } from "../lib/gameEnd";
import { playSfx, SFX } from "../lib/sfx";

interface GameEndScreenProps {
  reason: GameEndReason;
  onNext: () => void;
}

/**
 * 게임 종료 연출. GAME OVER(시간 초과·오답 소진) / CLEAR!(완주)를 띄우고 **멈춘다** —
 * 자동으로 결과표로 넘기지 않고, 문구 바로 아래의 '결과 확인' 버튼을 눌러야 넘어간다
 * (2026-08-11, 이란토).
 *
 * **화면을 덮지 않는다**(2026-08-11 실기 확인). 예전에는 바깥 div가 bg-bg라 게임판이
 * 통째로 사라졌는데, 지금은 오버레이가 투명하고 창(PixelPanel)만 불투명해서 방금
 * 플레이한 게임판이 뒤에 그대로 남는다. 카운트다운과 같은 구조다.
 *
 * 라벨은 foundCount로 역산하지 않는다. 어느 경로로 끝났는지는 호출부가 이미 알고
 * 있고(page.tsx가 onStageClear/onForceAdvance를 별개 prop으로 넘긴다), 그 사실이
 * endReason으로 여기까지 온다.
 *
 * 결과 멜로디를 낸다(CLEAR!는 game_clear, GAME OVER는 game_over. 2026-08-12 추가).
 * 결과표의 coindrop은 그대로 결과표에 남는다 — 그건 "결과가 나왔다"는 신호라 자리가
 * 다르다.
 *
 * 그래픽 애셋을 새로 만들지 않는다 — 픽셀 폰트(Galmuri11) + 그림자 + 기울임으로
 * 카운트다운과 같은 `.game-cue`를 쓴다.
 *
 * **두 라벨의 애니메이션이 다르다**(2026-08-11, 이란토). CLEAR!는 글자 단위로
 * 오른쪽에서 하나씩 들어온 뒤 letter별로 어긋나게 들썩이고, GAME OVER는 통째로
 * 페이드인한 뒤 5px씩 둥둥 뜬다. 분기는 여기 한 곳(cleared 불리언)이고 나머지 —
 * 창·버튼·라벨 선택 — 은 전부 공유하므로 컴포넌트를 나누지 않았다. 나누면 창
 * 마크업이 두 벌이 되고 한쪽만 고쳐지는 쪽이 더 위험하다.
 */
export default function GameEndScreen({ reason, onNext }: GameEndScreenProps) {
  const { t } = useLocale();
  const label = gameEndLabel(reason);
  const cleared = reason === "cleared";
  const letters = [...label];

  /*
   * 결과 멜로디. 마운트할 때 한 번만 낸다.
   *
   * **ref 가드가 필요하다** — 의존성이 빈 이펙트는 개발 모드(StrictMode)에서 두 번
   * 실행되고, 그러면 멜로디가 겹쳐서 울린다. 짧은 효과음은 겹쳐도 티가 안 나지만
   * 이건 1~3초짜리 멜로디라 바로 들린다.
   */
  const playedRef = useRef(false);
  useEffect(() => {
    if (playedRef.current) return;
    playedRef.current = true;
    playSfx(cleared ? SFX.gameClear : SFX.gameOver);
  }, [cleared]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <PixelPanel size="card" className="max-w-sm w-full mx-4 text-center">
        <div className="game-cue-window">
          {cleared ? (
            /*
             * 글자를 쪼개면 스크린리더가 "C, L, E, A, R"처럼 낱자로 읽는다.
             * 쪼갠 쪽은 aria-hidden으로 통째로 감추고, 읽히는 것은 옆에 둔
             * sr-only 원문 하나뿐이다. 라이브 리전(aria-live)은 그 원문에 건다 —
             * 장식용 span 더미에 걸면 글자가 들어올 때마다 재차 읽힌다.
             */
            <>
              <span className="sr-only" aria-live="assertive">
                {label}
              </span>
              {/* CLEAR!는 START보다 넓어(3.721em vs 3.391em) --wide를 쓴다. */}
              <span
                className="game-cue game-cue--wide game-cue--letters"
                style={{ fontFamily: "var(--font-pixel)" }}
                aria-hidden="true"
              >
                {letters.map((ch, i) => (
                  <span
                    key={i}
                    className="game-cue__letter"
                    style={
                      {
                        // 등장이 **오른쪽에서** 시작해야 하므로 역순 인덱스다.
                        // 정순으로 넣으면 방향이 조용히 뒤집힌다.
                        "--i": letters.length - 1 - i,
                        "--n": letters.length,
                      } as React.CSSProperties
                    }
                  >
                    {/* 공백은 inline-block 안에서 접히므로 nbsp로 바꾼다.
                        지금 라벨엔 공백이 없지만 로케일이 바뀌면 생길 수 있다. */}
                    {ch === " " ? " " : ch}
                  </span>
                ))}
              </span>
            </>
          ) : (
            /* GAME OVER는 9자라 기본 84px로는 창을 넘는다 — --long이 그 몫이다.
               CLEAR!는 위 분기라 여기 오지 않는다(붙일 이유가 없다). */
            <span
              className="game-cue game-cue--fade game-cue--long"
              style={{ fontFamily: "var(--font-pixel)" }}
              aria-live="assertive"
            >
              {label}
            </span>
          )}
        </div>

        {/* 문구 바로 밑. 예전에는 absolute bottom-12로 화면 하단에 떨어져 있었는데,
            창 안으로 들어오면서 문구와 한 덩어리로 읽히는 자리가 됐다. */}
        <button
          onClick={onNext}
          className="pixel-mask-btn-solid mt-6 w-full py-3 px-6 bg-accent text-accent-ink font-bold transition-opacity active:scale-95"
        >
          {t("gameEnd.nextButton")}
        </button>
      </PixelPanel>
    </div>
  );
}
