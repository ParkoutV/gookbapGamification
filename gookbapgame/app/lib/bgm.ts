/**
 * BGM 재생. **효과음(`sfx.ts`)과 완전히 다른 경로를 쓴다.**
 *
 * ## 왜 Web Audio가 아니라 HTMLAudioElement인가
 *
 * `sfx.ts`는 `decodeAudioData`로 압축을 풀어 AudioBuffer로 상주시킨다. 0.15~3초짜리
 * 효과음이라 전부 합쳐 166KB면 되지만, **BGM은 58초·64초짜리라 디코드하면 각각
 * 20MB·21MB의 PCM이 메모리에 남는다**(44.1kHz × 2ch × 4B 기준). 모바일에서 41MB를
 * 상주시킬 이유가 없다. `<audio>`는 스트리밍이라 그런 비용이 없다.
 *
 * **이것은 2026-08-12의 Web Audio 전환(`2858766`)에 대한 되돌림이 아니다.**
 * 그 커밋이 `<audio>`를 버린 이유는 두 가지였다 —
 * (1) `volume` 대입이 iOS에서 무시된다, (2) 재생마다 디코더를 다시 태워 지연이 붙는다.
 * 둘 다 **짧은 효과음을 반복 재생**할 때의 문제다. BGM은 한 번 틀어놓고 두는 것이라
 * 재생 지연이 의미가 없고, 음량은 아래처럼 에셋에 구워서 해결한다.
 * `sfx.ts`를 `<audio>`로 되돌리는 것은 여전히 금지다.
 *
 * ## 음량 0.5는 코드가 아니라 에셋에 있다
 *
 * **`audio.volume = 0.5`을 쓰지 말 것 — iOS에서 조용히 무시된다.** 대신
 * `docs/build-sfx.sh`가 `-af volume=0.5`로 -6dB를 구워 넣는다. 매장에서 여러 대가
 * 동시에 울리는 상황이라 BGM이 효과음과 같은 크기면 시끄럽다(2026-08-12, 이란토).
 * 비율을 바꾸려면 스크립트를 다시 돌린다.
 *
 * ## 음소거는 sfx와 한 스위치다
 *
 * BGM은 마스터 GainNode를 거치지 않으므로(`<audio>`가 그래프 밖이다) `setSfxMuted`의
 * 게인 조작만으로는 멎지 않는다. 그래서 `sfx.ts`가 이 모듈의 `applyBgmMuted`를 부른다.
 * **음소거 처리를 컴포넌트에 흩지 말 것** — 토글이 여러 곳에 있어서(시작 화면,
 * 게임 화면) 한 곳이라도 빠지면 소리가 남는다.
 */

export const BGM = {
  /** 첫 화면을 비롯한 모든 화면. */
  main: "bgm_main",
  /** 게임 시작부터 종료까지. */
  game: "bgm_game",
} as const;

export type BgmName = (typeof BGM)[keyof typeof BGM];

let el: HTMLAudioElement | null = null;
/** 지금 틀려고 하는 곡. `el.src`와 달리 로드 전에도 값이 있다. */
let current: BgmName | null = null;

/**
 * `<audio>`는 하나만 만들어 돌려쓴다. 곡마다 만들면 게임이 끝나고 메인이 돌아올 때
 * 이전 요소가 살아남아 두 곡이 겹친다.
 */
function getEl(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (el) return el;
  try {
    el = new Audio();
    el.loop = true;
    /* 자동재생 정책상 어차피 제스처 전에는 못 트므로 미리 받아둘 이유가 없다.
       매장에서 모바일 데이터로 받는 상황이라 낭비를 줄인다. */
    el.preload = "none";
    return el;
  } catch {
    el = null;
    return null;
  }
}

/**
 * BGM 전환. 이미 같은 곡이 재생 중이면 아무것도 하지 않는다 —
 * 리렌더마다 불려도 처음부터 다시 시작되지 않아야 한다.
 *
 * 다른 곡이면 **처음부터** 재생한다(2026-08-12, 이란토). 게임을 마치고 메인으로
 * 돌아올 때 이어듣기가 아니라 재시작이다.
 *
 * 음소거 상태에서도 `current`는 갱신한다. 그래야 음소거를 푸는 순간
 * `applyBgmMuted`가 무엇을 틀어야 하는지 안다.
 */
export function playBgm(name: BgmName, muted: boolean): void {
  const audio = getEl();
  if (!audio) return;

  if (current !== name) {
    current = name;
    audio.src = `/sfx/${name}.m4a`;
    audio.load();
  }

  if (muted) {
    audio.pause();
    return;
  }

  /* play()는 프라미스를 돌려주고, 제스처 전에는 거부된다(NotAllowedError).
     정상 동작이므로 삼킨다 — 다음 사용자 조작에서 다시 시도된다. */
  void audio.play().catch(() => {});
}

/**
 * 첫 사용자 제스처에서 부른다. 자동재생 정책에 막혀 시작되지 못한 BGM을 깨운다.
 *
 * **멱등하다** — 이미 재생 중이면(`paused`가 false) 아무것도 하지 않으므로 매
 * pointerdown마다 불려도 곡이 처음으로 돌아가지 않는다. 아직 곡이 정해지지 않았거나
 * (`current`가 null) 음소거면 조용히 넘어간다.
 */
export function resumeBgm(muted: boolean): void {
  if (muted || !el || !current || !el.paused) return;
  void el.play().catch(() => {});
}

/** 화면을 벗어날 때 등. `current`를 비워 다음 `playBgm`이 처음부터 틀게 한다. */
export function stopBgm(): void {
  current = null;
  if (el) {
    el.pause();
    el.removeAttribute("src");
  }
}

/**
 * 음소거 토글이 BGM에도 닿게 한다. `sfx.ts`의 `setSfxMuted`가 부른다.
 *
 * 끌 때는 pause만 한다 — 위치를 유지해야 다시 켰을 때 이어진다. 곡을 바꾸는 것이
 * 아니므로 `current`는 건드리지 않는다.
 */
export function applyBgmMuted(muted: boolean): void {
  if (!el || !current) return;
  if (muted) {
    el.pause();
    return;
  }
  void el.play().catch(() => {});
}
