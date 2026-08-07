/**
 * 효과음 재생. HTMLAudioElement를 쓴다 — Web Audio API는 이 정도 용도에 과하고,
 * 짧은 효과음 6개에 AudioContext 생명주기 관리를 얹을 이유가 없다.
 *
 * 포맷은 m4a(AAC)로 통일했다. 원본은 opus였지만 **iOS Safari가 .ogg 컨테이너를
 * 재생하지 못한다** — 모바일 웹 게임이라 그쪽이 못 들으면 의미가 없다.
 * 원본 opus는 기획 폴더에 그대로 있고, 변환은 `docs/build-sfx.sh` 참고.
 */

export const SFX = {
  /** 쿠폰 당첨 */
  coupon: "coupon",
  /** 꽝 */
  couponLose: "coupon_lose",
  /** 정답을 맞혔을 때 */
  pencilSuccess: "pencil_success",
  /** 오답을 짚었을 때 */
  pencilFailed: "pencil_failed",
  /** 일반 버튼 */
  touch: "touch",
  /** 게임이 끝나고 결과표가 뜰 때. 점수와 무관하게 항상 재생한다. */
  coindrop: "coindrop",
} as const;

export type SfxName = (typeof SFX)[keyof typeof SFX];

const MUTED_KEY = "gookbapgame_sfx_muted";

/**
 * 같은 소리를 연달아 재생할 수 있어야 한다(정답을 빠르게 연속으로 맞히는 경우).
 * 재생 중인 엘리먼트의 currentTime을 0으로 되돌리는 방식이라 엘리먼트는 이름당 하나면 된다.
 */
const cache = new Map<SfxName, HTMLAudioElement>();

function getAudio(name: SfxName): HTMLAudioElement | null {
  // window는 있는데 Audio는 없는 환경이 있다(테스트 스텁, 일부 임베디드 웹뷰).
  // 여기서 걸러내지 않으면 new Audio()가 던져 호출부까지 예외가 올라간다.
  if (typeof window === "undefined" || typeof Audio === "undefined") return null;

  const cached = cache.get(name);
  if (cached) return cached;

  try {
    const audio = new Audio(`/sfx/${name}.m4a`);
    audio.preload = "auto";
    cache.set(name, audio);
    return audio;
  } catch {
    // 소리는 진행에 필수가 아니다. 만들지 못하면 조용히 포기한다.
    return null;
  }
}

export function isSfxMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(MUTED_KEY) === "1";
  } catch {
    // 사파리 프라이빗 모드 등에서 localStorage 접근이 던질 수 있다. 소리는 켜둔다.
    return false;
  }
}

export function setSfxMuted(muted: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MUTED_KEY, muted ? "1" : "0");
  } catch {
    // 저장에 실패해도 이번 세션의 재생은 아래에서 막는다.
  }
  // 끄는 순간 이미 재생 중이던 소리는 즉시 멈춘다.
  if (muted) pauseAll();
}

function pauseAll(): void {
  for (const audio of cache.values()) {
    audio.pause();
    audio.currentTime = 0;
  }
}

/**
 * 효과음 재생. 실패해도 절대 던지지 않는다 — 소리가 안 나는 것은 게임 진행을
 * 막을 이유가 없고, 자동재생 정책 때문에 첫 제스처 전에는 거부되는 게 정상이다.
 */
export function playSfx(name: SfxName): void {
  if (isSfxMuted()) return;

  const audio = getAudio(name);
  if (!audio) return;

  // 이미 재생 중이면 처음부터 다시. 정답을 연속으로 맞힐 때 소리가 씹히지 않는다.
  audio.currentTime = 0;
  const promise = audio.play();

  // play()는 브라우저에 따라 Promise를 반환하지 않기도 한다.
  if (promise && typeof promise.catch === "function") {
    promise.catch(() => {
      // NotAllowedError(제스처 전 자동재생 차단)가 대부분이다. 조용히 넘긴다.
    });
  }
}

/**
 * 오디오 잠금 해제. iOS·Android는 사용자 제스처 없이 재생을 막으므로,
 * 첫 탭에서 무음 재생을 한 번 시도해 이후 재생이 통과하도록 만든다.
 * 게임 시작 버튼처럼 확실한 제스처 지점에서 한 번 부르면 된다.
 */
export function unlockSfx(): void {
  if (typeof window === "undefined") return;

  for (const name of Object.values(SFX)) {
    const audio = getAudio(name);
    if (!audio) continue;
    // 볼륨을 0으로 두고 재생·정지하면 소리 없이 잠금만 풀린다.
    const originalVolume = audio.volume;
    audio.volume = 0;
    const promise = audio.play();
    const restore = () => {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = originalVolume;
    };
    if (promise && typeof promise.then === "function") {
      promise.then(restore).catch(restore);
    } else {
      restore();
    }
  }
}
