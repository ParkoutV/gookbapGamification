/**
 * 시작 화면 배경의 시간대 판정. 설계 문서
 * `docs/superpowers/specs/2026-08-15-intro-visuals-and-prewarm-design.md` 3절.
 *
 * **순수 로직만 둔다** — DOM도 fetch도 없다. 컴포넌트 테스트 인프라가 없어서
 * 검사 가능한 자리는 여기뿐이다(AGENTS.md).
 */

/** 파일명과 1:1이다 — `public/images/bg/city_{stage}.webp`. */
export type DaylightStage = "dawn" | "morning" | "day" | "evening" | "night" | "midnight";

// 부산(35.18N, 129.08E) ISO 주차별 일출·일몰 (KST 분 단위, 자정 기준)
// docs/gen-daylight-table.py 로 생성. **연도 무관 — 매년 그대로 재사용한다.**
// 주차별 일출·일몰 차이는 연도 간 몇 분 수준이라 배경 전환 용도에는 영향이 없다.
// 검증: W01 일출 07:33 / 하지 무렵 05:10 / 동지 무렵 07:34
export const SUNRISE_MIN = [453, 454, 453, 451, 447, 442, 436, 429, 420, 412, 402, 392, 382, 372, 363, 353, 345, 336, 329, 323, 318, 314, 311, 310, 310, 311, 314, 317, 321, 326, 331, 336, 342, 347, 353, 358, 363, 368, 373, 378, 384, 389, 395, 402, 408, 415, 422, 429, 435, 441, 446, 450, 453];
export const SUNSET_MIN = [1042, 1048, 1054, 1061, 1068, 1075, 1082, 1089, 1096, 1102, 1108, 1114, 1120, 1125, 1131, 1136, 1142, 1148, 1154, 1159, 1165, 1170, 1175, 1178, 1181, 1183, 1183, 1182, 1180, 1176, 1171, 1165, 1158, 1150, 1142, 1132, 1122, 1112, 1102, 1092, 1082, 1072, 1064, 1056, 1048, 1043, 1038, 1035, 1033, 1033, 1034, 1037, 1041];

const KST = "Asia/Seoul";

/** 심야가 시작하는 시각(23:00). 일출·일몰과 달리 계절과 무관한 고정 경계다. */
const MIDNIGHT_START = 23 * 60;

/**
 * KST 기준 ISO 주차(1~53).
 *
 * **`rankingPeriod.ts`의 "`Z`를 붙이지 말라"는 경고는 여기 해당하지 않는다.** 그쪽은
 * `.gte()`에 넣을 **실제 시점(instant)** 이 필요해서 `+09:00`을 쓴다. 여기서 필요한 것은
 * 달력 칸(주차)을 세기 위한 **비교용 키**라, UTC 자정에 고정해두고 UTC getter로만
 * 계산하는 편이 정확하다 — 시간대가 두 번 개입할 여지가 없다.
 */
export function isoWeekKST(date: Date): number {
  // en-CA가 ISO 형식(YYYY-MM-DD)을 주는 로케일이라 파싱이 필요 없다(rankingPeriod.ts와 같은 판단).
  const ymd = date.toLocaleDateString("en-CA", { timeZone: KST });
  const d = new Date(`${ymd}T00:00:00Z`);
  // ISO 주차: 그 주의 목요일이 속한 해가 곧 그 주의 해다.
  const dayFromMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayFromMonday + 3);
  const thursday = d.getTime();
  const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  jan4.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + 3);
  return 1 + Math.round((thursday - jan4.getTime()) / 604800000);
}

/**
 * KST 기준 자정으로부터의 분(0~1439).
 *
 * **기기 시간대를 쓰지 말 것.** 매장이 부산 고정이라 해외 접속자에게 기기 시각으로
 * 배경을 고르면 엉뚱한 시간대가 뜬다 — `couponDates.ts`가 날짜에서 다룬 것과 같은 함정이다.
 *
 * `hour12: false`는 ICU 빌드에 따라 자정에 `"24"`를 주므로 `hourCycle: "h23"`을 쓴다.
 * 23:00이 실제 경계라 그 차이가 바로 드러난다.
 */
export function kstMinutesOfDay(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: KST,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

/** 주차로 표를 읽는다. **ISO 주차는 53까지 있다** — 색인이 넘치면 `undefined`가 NaN 비교로 조용히 번진다. */
function tableAt(table: readonly number[], week: number): number {
  return table[Math.min(Math.max(week, 1), table.length) - 1];
}

/**
 * 6단계 구분(설계 문서 3절의 표 그대로).
 *
 * | 단계 | 구간 |
 * |---|---|
 * | dawn | 일출 −60분 ~ 일출 |
 * | morning | 일출 ~ 일출 +3시간 |
 * | day | ~ 일몰 −90분 |
 * | evening | 일몰 ±90분 |
 * | night | 일몰 +90분 ~ 23:00 |
 * | midnight | 23:00 ~ 일출 −60분 |
 *
 * **midnight만 자정을 넘어 감긴다**(`[23:00, 24:00) ∪ [00:00, 일출−60)`). 나머지는
 * 오름차순 구간이라 순서대로 비교하면 되지만, 이 한 칸 때문에 감싸는 분기가 먼저 온다.
 */
export function stageForMinutes(minutes: number, week: number): DaylightStage {
  const sunrise = tableAt(SUNRISE_MIN, week);
  const sunset = tableAt(SUNSET_MIN, week);

  if (minutes >= MIDNIGHT_START || minutes < sunrise - 60) return "midnight";
  if (minutes < sunrise) return "dawn";
  if (minutes < sunrise + 180) return "morning";
  if (minutes < sunset - 90) return "day";
  if (minutes < sunset + 90) return "evening";
  return "night";
}

/** 지금(KST)의 시간대. */
export function stageForDate(date: Date): DaylightStage {
  return stageForMinutes(kstMinutesOfDay(date), isoWeekKST(date));
}

/**
 * 경계 부근에 접속했을 때 크로스페이드할 이전 단계. 경계에서 멀면 `null`이다.
 *
 * 요청서의 "이미지가 바뀌기로 한 시간대 즈음에 접속했을 때에는 5초의 fade"를
 * **접속 시점 판정**으로 해석한 것이다(설계 문서 3절). 게임 중에 시간이 흘러 경계를
 * 넘는 경우는 다루지 않는다.
 *
 * `windowMin`은 명세가 정하지 않아 5분으로 잡았다. 이 창 안에서만 이미지를 두 장 받는다 —
 * "현재 시간대 1장만 받는다"는 6장 프리로드를 금지하는 것이지 크로스페이드를 금지하는
 * 것이 아니다.
 */
export function previousStageAtBoundary(date: Date, windowMin = 5): DaylightStage | null {
  const week = isoWeekKST(date);
  const minutes = kstMinutesOfDay(date);
  const current = stageForMinutes(minutes, week);
  // 창 시작 시점의 단계. 자정을 거슬러 넘어가면 전날이지만, 표가 주차 단위라 하루
  // 차이로는 값이 바뀌지 않으므로 분만 감아주면 된다.
  const before = stageForMinutes((minutes - windowMin + 1440) % 1440, week);
  return before === current ? null : before;
}

/**
 * 배경 사진 하단에 까는 그라데이션. 푸터 글자가 사진 위에서도 읽히게 한다.
 *
 * 푸터는 `PixelPanel` 바깥이라 배경 사진에 그대로 노출되는 유일한 텍스트이고,
 * 개인정보처리방침 재열람의 유일한 통로다(AGENTS.md) — 가독성이 실제 손실로 이어진다.
 * 흰 글자로 뒤집고 이 그라데이션을 깔면 푸터 자리 국소 최악이 **7.22:1**이다(실측).
 *
 * ## 칩(사각형 배경)을 쓰지 않는 이유
 *
 * 처음에는 푸터에 반투명 칩을 뒀는데, `day`처럼 비교적 밝은 배경에서 **그 자리만
 * 어둡게 패인 것처럼 보였다**(2026-08-15 이란토 지적). 칩 색을 그 이미지의 색조로
 * 맞춰봐도 해결되지 않았다 — 경계가 뚜렷한 사각형이라 휘도차가 그대로 드러난다.
 *
 * α를 낮춰 이물감을 줄이려 해도 **트레이드오프를 벗어날 수 없었다**(실측):
 * α=0.35 → 대비 4.03(AA 미달) / 0.45 → 4.92 / 0.6 → 6.74, 그런데 `day`의 휘도차는
 * 0.079~0.120으로 어느 값에서도 "자연스러움"(<0.06)에 닿지 못했다.
 *
 * 그래서 **경계 자체를 없앴다.** 화면 아래에서 위로 사라지는 그라데이션은 사진에서
 * 흔한 처리라 이물감이 없고, 대비는 오히려 칩보다 낫다.
 *
 * **배경 이미지를 교체하면 다시 재야 한다.** 특히 밝은 이미지를 추가하면 "흰 글자가
 * 항상 이긴다"는 전제가 깨진다(지금은 6장이 모두 야경·실내 톤이다).
 * `docs/superpowers/specs/2026-08-15-intro-visuals-and-prewarm-design.md` 참고.
 */
export const FOOTER_SCRIM_ALPHA = 0.85;

/** 그라데이션이 덮는 높이(px). 이보다 위는 사진 그대로다. */
export const FOOTER_SCRIM_HEIGHT = 320;
