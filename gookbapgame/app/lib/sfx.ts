/**
 * 효과음 재생. **Web Audio API**를 쓴다.
 *
 * 예전에는 HTMLAudioElement였는데 iOS Safari에서 두 가지가 깨졌다(2026-08-12, 실기 제보):
 * 1. 버튼 클릭음이 일정하게 늦게 났다. `currentTime = 0` → `play()`가 매번 디코더를
 *    다시 태우기 때문이다. 미리 디코드해둔 AudioBuffer를 `start()`하면 지연이 없다.
 * 2. 시작 버튼을 누르면 엉뚱한 효과음이 2~3개 동시에 났다. 잠금 해제용으로
 *    `volume = 0` 무음 재생을 6개 파일에 돌렸는데, **iOS의 `HTMLMediaElement.volume`은
 *    읽기 전용이라 대입이 조용히 무시된다** — 무음이 아니라 전부 제 볼륨으로 울렸다.
 *    긴 파일(coupon_lose, coupon, coindrop)만 귀에 걸려 "무작위"로 보였다.
 *    GainNode의 `gain`은 iOS에서도 정상적으로 쓰이므로 음량 제어는 그쪽으로 옮겼다.
 *    **volume 대입으로 되돌리지 말 것.** 데스크톱에서는 둘 다 재현되지 않는다.
 *
 * 포맷은 m4a(AAC)로 통일했다. 원본은 opus였지만 **iOS Safari가 .ogg 컨테이너를
 * 재생하지 못한다** — 모바일 웹 게임이라 그쪽이 못 들으면 의미가 없다.
 * 원본 opus는 기획 폴더에 그대로 있고, 변환은 `docs/build-sfx.sh` 참고.
 */

// 확장자를 붙인다 — node의 테스트 러너(`--experimental-strip-types`)는 확장자 없는
// 상대 경로를 해석하지 못해 `sfx.test.ts`가 통째로 죽는다. 번들러는 양쪽 다 받는다.
import { applyBgmMuted } from "./bgm.ts";

export const SFX = {
  /** 쿠폰 당첨 */
  coupon: "coupon",
  /** 꽝 */
  couponLose: "coupon_lose",
  /** 정답을 맞혔을 때 */
  pencilSuccess: "pencil_success",
  /** 오답을 짚었을 때 */
  pencilFailed: "pencil_failed",
  /**
   * 일반 버튼. 90s 데스크톱 컨셉에 맞춘 마우스 클릭음이다.
   *
   * 자동으로 붙는다 — `useButtonClickSfx`가 문서 전체의 버튼 눌림을 잡아
   * 이 소리를 낸다. 버튼마다 호출부를 심을 필요가 없다.
   *
   * 예전에는 `touch`(0.31s)가 이 자리였는데 실제로는 세 곳에서만 불려서
   * 대부분의 버튼이 소리가 없었다. click(0.15s)이 그 역할을 대신한다
   * (2026-08-11, 이란토).
   */
  click: "click",
  /** 게임이 끝나고 결과표가 뜰 때. 만점(1953)이 아닌 모든 점수에서 난다. */
  coindrop: "coindrop",
  /**
   * 1953 만점자 전용 축하음. **coindrop에 얹는 게 아니라 대신 난다**
   * (2026-08-19, 이란토). 둘을 겹치면 4초짜리 축하음 위에 동전 소리가 얹혀
   * 어느 쪽도 제대로 들리지 않는다.
   */
  gratulate: "gratulate",
  /** 카운트다운 3·2·1에서 한 번씩. */
  countReady: "count_ready",
  /** 카운트다운의 START! */
  countStart: "count_start",
  /** 종료 화면의 CLEAR! 멜로디. */
  gameClear: "game_clear",
  /** 종료 화면의 GAME OVER 멜로디. */
  gameOver: "game_over",
} as const;

export type SfxName = (typeof SFX)[keyof typeof SFX];

const MUTED_KEY = "gookbapgame_sfx_muted";

let ctx: AudioContext | null = null;
let gain: GainNode | null = null;

/**
 * AudioContext는 **모듈 최상위에서 만들지 않는다.** 서버 렌더와 node 테스트에는
 * window도 AudioContext도 없어서 import 시점에 던진다.
 *
 * 제스처 밖에서 만들어도 된다 — 그때는 suspended 상태로 생기고, decodeAudioData는
 * suspended 상태에서도 동작한다. 실제 재생 직전에 `playSfx`가 resume한다.
 */
function getCtx(): { ctx: AudioContext; gain: GainNode } | null {
  if (typeof window === "undefined") return null;
  if (ctx && gain) return { ctx, gain };

  const Ctor =
    typeof AudioContext !== "undefined"
      ? AudioContext
      : (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;

  try {
    ctx = new Ctor();
    gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.value = isSfxMuted() ? 0 : 1;
    return { ctx, gain };
  } catch {
    // 소리는 진행에 필수가 아니다. 만들지 못하면 조용히 포기한다.
    ctx = null;
    gain = null;
    return null;
  }
}

/** 디코드된 버퍼. 이름당 하나면 된다 — 재생마다 BufferSource를 새로 만들기 때문. */
const buffers = new Map<SfxName, AudioBuffer>();
/** 진행 중인 로드. 같은 파일을 두 번 받지 않도록 프라미스를 재사용한다. */
const loading = new Map<SfxName, Promise<void>>();

function load(name: SfxName): Promise<void> {
  const existing = loading.get(name);
  if (existing) return existing;

  const audio = getCtx();
  if (!audio) return Promise.resolve();

  const promise = fetch(`/sfx/${name}.m4a`)
    .then((res) => res.arrayBuffer())
    .then((raw) => audio.ctx.decodeAudioData(raw))
    .then((decoded) => void buffers.set(name, decoded))
    .catch(() => {
      // 네트워크·디코드 실패. 다음 재생 때 다시 시도할 수 있도록 표시를 지운다.
      loading.delete(name);
    });

  loading.set(name, promise);
  return promise;
}

/**
 * 효과음을 미리 받아 디코드한다(BGM 제외 전부 합쳐 180KB — 절반이 gratulate다).
 *
 * **첫 버튼을 누르기 한참 전에 끝나 있어야 한다.** decodeAudioData가 비동기라
 * 버퍼가 없으면 그 재생은 조용히 건너뛰어진다. 그래서 시작 버튼이 아니라
 * `useButtonClickSfx`의 마운트 시점에 부른다 — 첫 pointerdown이 시작 버튼이라는
 * 보장이 없다(언어 선택, 약관 팝업, 소리 토글, 친구 초대하기가 모두 앞설 수 있다).
 */
export function preloadSfx(): void {
  for (const name of Object.values(SFX)) load(name);
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
  // 끄는 순간 이미 재생 중이던 소리도 함께 멎는다 — 모든 재생이 이 게인을 거친다.
  // 여기서 context를 새로 만들지는 않는다(음소거 조작만으로 오디오를 깨울 이유가 없다).
  if (gain) gain.gain.value = muted ? 0 : 1;

  // **BGM은 이 게인을 거치지 않는다.** `<audio>`라 그래프 밖이기 때문에 따로 알려야
  // 한다(`bgm.ts` 주석 참고). 토글은 화면마다 있으므로 컴포넌트가 아니라 여기서
  // 처리해야 한 곳이라도 빠지는 일이 없다.
  applyBgmMuted(muted);
}

/**
 * 숫자가 한 칸 올라갈 때 나는 아주 짧은 "틱". **파일이 없다 — 그 자리에서 합성한다.**
 *
 * 결과표의 카운트업은 1초 남짓 동안 수십 번 울려야 해서, 30ms짜리 음원을 만들어
 * 반복 재생하는 것보다 오실레이터 하나를 띄웠다 죽이는 편이 싸고 (fetch도 디코드도
 * 없다) 음높이를 항목마다 바꿀 수 있다. square는 90s 데스크톱 톤에 맞춘 것.
 *
 * 음량은 `playSfx`와 같은 마스터 게인을 거치므로 음소거 토글이 그대로 먹는다.
 */
export function playTick(freq = 880): void {
  if (isSfxMuted()) return;

  const audio = getCtx();
  // 제스처 전(suspended)이면 조용히 포기한다. 여기서 resume을 걸면 틱마다
  // 프라미스가 쌓이는데, 어차피 이 화면 전에 다른 소리가 context를 깨워둔다.
  if (!audio || audio.ctx.state !== "running") return;

  try {
    const t = audio.ctx.currentTime;
    const osc = audio.ctx.createOscillator();
    const env = audio.ctx.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    // 감쇠는 exponential이라 0을 못 받는다. 0.0001이 사실상 무음.
    env.gain.setValueAtTime(0.06, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    osc.connect(env).connect(audio.gain);
    osc.start(t);
    osc.stop(t + 0.035);
  } catch {
    // 재생 실패는 삼킨다.
  }
}

/**
 * 효과음 재생. 실패해도 절대 던지지 않는다 — 소리가 안 나는 것은 게임 진행을
 * 막을 이유가 없고, 자동재생 정책 때문에 첫 제스처 전에는 거부되는 게 정상이다.
 *
 * 같은 소리가 겹쳐도 된다(정답을 빠르게 연속으로 맞히는 경우). BufferSource는
 * 일회용이라 매번 새로 만들며, 재생이 끝나면 알아서 수거된다.
 */
export function playSfx(name: SfxName): void {
  if (isSfxMuted()) return;

  const audio = getCtx();
  if (!audio) return;

  const buffer = buffers.get(name);
  if (!buffer) {
    // 아직 디코드 전이다. 이번 소리는 포기하고 로드만 걸어둔다 —
    // 뒤늦게 재생하면 누른 시점과 어긋나 오히려 이상하다.
    load(name);
    return;
  }

  const fire = () => {
    try {
      const source = audio.ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(audio.gain);
      source.start();
    } catch {
      // 재생 실패는 삼킨다.
    }
  };

  // 프리로드가 제스처 밖에서 context를 만들기 때문에(마운트 시점) 첫 재생 때는
  // 거의 항상 suspended다. **resume()은 비동기이므로 기다렸다가 start해야 한다** —
  // suspended 상태에서 start()를 걸면 재생이 스케줄만 되고 소리가 나지 않는다.
  // 이걸 놓쳐서 데스크톱에서 효과음이 통째로 안 났다(2026-08-12).
  if (audio.ctx.state === "suspended") {
    audio.ctx.resume().then(fire).catch(() => {});
    return;
  }

  fire();
}
