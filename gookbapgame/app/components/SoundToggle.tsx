"use client";

import { useEffect, useState } from "react";
import { useLocale } from "../lib/i18n/LocaleContext";
import { isSfxMuted, setSfxMuted, playSfx, SFX } from "../lib/sfx";

export default function SoundToggle() {
  const { t } = useLocale();
  // 서버 렌더에서는 localStorage를 읽을 수 없으므로 항상 "켜짐"으로 시작하고,
  // 마운트 후에 실제 값으로 맞춘다. useState 초기화 함수로는 대체할 수 없다 —
  // 그건 서버에서도 실행되어 hydration 불일치를 만든다.
  //
  // eslint의 react-hooks/set-state-in-effect가 이 패턴을 잡지만, 외부 상태
  // (localStorage)를 React로 들여오는 정당한 용법이다. page.tsx의 showTerm·
  // showDrawEntry도 같은 이유로 같은 모양이다.
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 위 주석 참고
    setMuted(isSfxMuted());
  }, []);

  const toggle = () => {
    const next = !muted;
    setMuted(next);
    setSfxMuted(next);
    // 켜는 쪽으로 바꿨을 때만 소리를 낸다 — 끄면서 소리가 나면 앞뒤가 안 맞는다.
    //
    // useButtonClickSfx가 있는데도 여기서 따로 부르는 이유: 그쪽은 pointerdown에
    // 반응하는데 그 시점에는 아직 음소거가 풀리기 전이라 재생이 막힌다. 소리를 켠
    // 직후 아무 소리도 안 나면 켜졌는지 알 수 없으므로, 이 한 번은 직접 낸다.
    if (!next) playSfx(SFX.click);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={t(muted ? "sound.unmuteAria" : "sound.muteAria")}
      aria-pressed={muted}
      className="icon-round-btn w-9 h-9 flex items-center justify-center rounded-full border border-wood bg-surface/90 text-lg"
    >
      <span aria-hidden="true">{muted ? "🔇" : "🔊"}</span>
    </button>
  );
}
