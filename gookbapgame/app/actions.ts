"use server";

import { supabase } from "./lib/db";
import { parseCouponType } from "./lib/couponType";
import { requestUnifiedImages, type ImageSlots } from "./lib/generateUnified";
import { zipPlansToSessions } from "./lib/sessionZip";
import {
  toGameMasterData,
  type GameMasterData,
  type MasterPart,
  type RawGameMasterData,
} from "./lib/gameMasterData";
import { selectSessionPlan } from "./lib/sessionPlan";
import {
  getPartSilhouette,
  unionSlotPolygon,
  type Point,
} from "./lib/hitPolygon";
import { getDiffSilhouette } from "./lib/diffSilhouette";
import { getOrIssueToken, hashToken } from "./lib/participantToken";
import { requestNicknameAssign } from "./lib/nicknameApi";
import { nicknameFromParticipantRows } from "./lib/existingNickname";
import type { Nickname, NicknameParts } from "./lib/nicknameParts";
import { generateNickname } from "./lib/nickname";
import type { LocalizedName } from "./lib/i18n/localizedName";
import { requestGatchaDraw } from "./lib/gatchaApi";
import { resolveInviteTrackId } from "./lib/inviteLink";
import {
  matchIssuedCoupon,
  sortByIssuedAt,
  toIssuedCoupon,
  withoutOnlineCoupons,
  type IssuedCouponRow,
} from "./lib/issuedCoupons";
import type { IssuedCoupon } from "./lib/issuedCoupons";
import { requestWebCouponAssign } from "./lib/webCouponApi";
import { sortByAssignedAt, toWebCoupons, type WebCouponRow } from "./lib/webCoupons";
import type { WebCoupon, WebCouponSettings } from "./lib/webCoupons";

/**
 * 화면들이 `actions`에서 가져다 쓰던 타입이라 여기서도 계속 내보낸다.
 *
 * **`export type { IssuedCoupon }`(중괄호만) 형태로 쓰지 말 것.** 그러면 번들에
 * 값 참조가 남아 런타임에 `ReferenceError: IssuedCoupon is not defined`로 터진다 —
 * `tsc --noEmit`도 `next build`도 잡지 못하고, 프로덕션에서 이 파일의 서버 액션이
 * **전부** 500이 된다(2026-08-07에 실제로 그랬다. 시작 화면의 `ensureParticipant`가
 * 죽어 닉네임이 빈 채로 떴다). `from`을 붙여 원본에서 직접 re-export해야 지워진다.
 */
export type { IssuedCoupon } from "./lib/issuedCoupons";
/** 같은 이유로 `from`을 붙여 원본에서 직접 re-export한다(위 주석 참고). */
export type { WebCoupon, WebCouponSettings } from "./lib/webCoupons";
import { rankingPeriodStart, type RankingPeriod } from "./lib/rankingPeriod";
import type { RankingViewRow } from "./lib/rankingRows";
import { toSurveyFetchResult, type SurveyFetchResult } from "./lib/surveyFetchResult";
import {
  buildSurveyResponseRows,
  type SurveyAnswerMap,
  type SurveyQuestion,
} from "./lib/surveyAnswers";

export type GameSlot = {
  slotId: number;
  x: number;
  y: number;
  slotScale: number;
  isDifference: boolean;
  leftHitPolygon: Point[] | null;
  rightHitPolygon: Point[] | null;
  /** part_categories.name의 jsonb 원본. 로케일 해석은 클라이언트에서 한다. */
  categoryName: LocalizedName;
};

export type GameSession = {
  level: number;
  leftSceneUrl: string;
  rightSceneUrl: string;
  slots: GameSlot[];
  /**
   * 이 판에 쓴 배경 이미지 id. **다음 판에서 같은 배경을 피하려고 돌려준다** —
   * `planAllGameSessions`는 서버 액션이라 직전 판을 기억하지 못하므로, 클라이언트가 들고
   * 있다가 `excludeBaseImageId`로 되돌려주는 구조다(`baseImageOrder.ts` 참고).
   */
  baseImageId: number;
};

async function computeSlotPolygons(
  leftPart: MasterPart,
  rightPart: MasterPart,
  slotScale: number
): Promise<{ leftHitPolygon: Point[] | null; rightHitPolygon: Point[] | null }> {
  const leftHull = await getPartSilhouette(leftPart.imageUrl);
  const rightHull =
    rightPart.id === leftPart.id ? leftHull : await getPartSilhouette(rightPart.imageUrl);

  const placementOf = (part: MasterPart) => ({
    offsetX: part.offsetX,
    offsetY: part.offsetY,
    partScale: part.scale,
    slotScale,
  });
  const toSource = (hull: Point[] | null, part: MasterPart) => ({
    hull,
    placement: placementOf(part),
  });

  // 차이 슬롯은 **실제로 달라진 자리**를 정답으로 쓴다(`getDiffSilhouette`). 파트
  // 실루엣을 쓰면 7단계 반찬상처럼 큰 파트에서 상 전체가 정답이 된다 — 바뀐 것은
  // 반찬 하나인데 판의 4분의 1이 정답 영역이었다(2026-08-19 실기).
  //
  // 못 찾으면(노이즈만 있거나 디코딩 실패) 양쪽 실루엣의 합집합으로 떨어진다.
  // **diff를 합집합에 더하지 말 것** — 넓어져서 정확도가 되레 떨어진다.
  //
  // 같은 파트인 슬롯(미출제)은 diff가 빈다. 애초에 부를 이유가 없고, 그쪽은
  // 실루엣 전체가 맞다 — "다른 물체를 눌렀다"를 잡는 오답 레이어이기 때문이다.
  const diffPolygon =
    rightPart.id === leftPart.id
      ? null
      : await getDiffSilhouette(
          { imageUrl: leftPart.imageUrl, placement: placementOf(leftPart) },
          { imageUrl: rightPart.imageUrl, placement: placementOf(rightPart) }
        );

  const polygon =
    diffPolygon ?? unionSlotPolygon(toSource(leftHull, leftPart), toSource(rightHull, rightPart));

  return { leftHitPolygon: polygon, rightHitPolygon: polygon };
}

/**
 * 한 레벨의 출제 명세. **합성 URL이 아직 없다** — 그것만 빼면 `GameSession`이다.
 *
 * 출제(배경·정답 슬롯·파츠 선택)는 전부 순수 계산이라 네트워크가 필요 없고, 예전
 * `fetchGameData`는 그 계산 끝에 자기 몫 2장을 곧바로 합성 요청했다. 7레벨을 병렬로
 * 돌리므로 요청이 14건 나갔다. 지금은 여기서 멈추고 `planAllGameSessions`가 14건을
 * **한 번에** 요청한다(2026-08-16 벌크 API 전환).
 */
type SessionPlan = {
  level: number;
  baseImageId: number;
  slots: GameSlot[];
  leftImageSlots: ImageSlots;
  rightImageSlots: ImageSlots;
};

/**
 * 게임 마스터 데이터(배경·슬롯·카테고리·파츠)를 **RPC 한 번**으로 받는다.
 *
 * 예전에는 `planGameSession`이 레벨마다 `base_images` → `image_slots` → `parts` →
 * `part_categories`를 따로 조회해, 7레벨이 병렬로 도는 동안 28번이 나갔다. 저쪽이
 * 같은 목적으로 만들어 둔 RPC가 있어(`gookbapanalyze/AGENTS.md`의 `base_images` 절 —
 * "게임 클라이언트의 최적화된 초기 로딩을 위해") 그것으로 대체한다.
 *
 * **`planAllGameSessions`가 한 번만 부르고 7레벨이 나눠 쓴다.** 레벨별로 부르면
 * 합성 요청을 벌크로 묶은 것과 같은 이유로 의미가 사라진다.
 *
 * 캐시를 두지 않는다 — 대시보드에서 이미지를 편집하면 슬롯 구성이 바뀌는데, 낡은
 * 마스터 데이터로 만든 조합은 저쪽 합성 API가 그리지 못한다(그쪽도 편집 저장 시
 * `unified_images` 캐시를 통째로 비운다).
 *
 * **`raw`를 함께 돌려주는 것이 요점이다.** 합성 API가 이 원본을 그대로 받아 자기 쪽
 * RPC 왕복을 건너뛴다(2026-08-17, 구자건). 도메인 타입(`master`)을 다시 직렬화해
 * 보내면 안 된다 — `z_index`처럼 이쪽 계산이 쓰지 않아 옮기지 않은 값이 빠져 저쪽의
 * 레이어 순서가 **에러 없이** 틀어진다.
 */
async function fetchGameMasterData(): Promise<{
  raw: RawGameMasterData;
  master: GameMasterData;
} | null> {
  const { data, error } = await supabase.rpc("get_game_master_data");
  if (error) {
    console.error("[fetchGameMasterData] get_game_master_data 실패:", error);
    return null;
  }

  const master = toGameMasterData(data);
  return master ? { raw: data as RawGameMasterData, master } : null;
}

/**
 * 한 레벨의 출제를 계획한다. **고르는 계산은 `sessionPlan.ts`에 있다** — 순수 함수라
 * 단위 테스트가 되고(`sessionPlan.test.ts`), 여기 남은 것은 히트 폴리곤 계산뿐이다.
 * 그쪽은 파트 이미지를 받아 sharp로 디코딩해야 해서 순수해질 수 없다.
 *
 * `excludeBaseImageId`는 **직전 판에서 이 레벨이 쓴 배경**이다. 있으면 후보 순서에서
 * 뒤로 밀려 다른 배경이 우선 뽑힌다 — 대안이 없으면 그대로 다시 뽑힌다
 * (`baseImageOrder.ts`가 그 이유를 설명한다: 빼버리면 풀이 1장인 레벨에서 게임이
 * 시작되지 않는다).
 */
async function planGameSession(
  master: GameMasterData,
  level: number,
  targetDiffCount: number,
  excludeBaseImageId?: number | null
): Promise<SessionPlan | null> {
  try {
    const selection = selectSessionPlan(master, level, targetDiffCount, excludeBaseImageId);
    if (!selection) {
      console.error(`[planGameSession] level=${level}: 쓸 수 있는 배경이 없다.`);
      return null;
    }

    const slots: GameSlot[] = await Promise.all(
      selection.slots.map(async (builder) => {
        const { leftHitPolygon, rightHitPolygon } = await computeSlotPolygons(
          builder.leftPart,
          builder.rightPart,
          builder.slotScale
        );

        return {
          slotId: builder.slotId,
          x: builder.x,
          y: builder.y,
          slotScale: builder.slotScale,
          isDifference: builder.leftPart.id !== builder.rightPart.id,
          leftHitPolygon,
          rightHitPolygon,
          categoryName: builder.categoryName,
        };
      })
    );

    return {
      level,
      baseImageId: selection.baseImageId,
      slots,
      leftImageSlots: selection.leftImageSlots,
      rightImageSlots: selection.rightImageSlots,
    };
  } catch (error) {
    console.error("Error in planGameSession:", error);
    return null;
  }
}

/**
 * 7레벨의 출제를 병렬로 계산한 뒤, 좌/우 14장을 **벌크 API 한 번**으로 합성한다.
 *
 * 서버 액션이 이 단위인 것이 요점이다. 레벨별로 쪼개면 액션이 7번 불려 합성 요청도
 * 7번으로 갈라지고, 벌크로 바꾼 의미가 사라진다.
 *
 * 반환 순서는 `STAGE_CONFIG` 순서 그대로다. 한 레벨이라도 실패하면 그 자리에 `null`을
 * 넣어 돌려주므로, 호출부(`fetchAllSessions`)가 어느 레벨이 비었는지 그대로 알 수 있다.
 */
export async function planAllGameSessions(
  levels: { level: number; diffCount: number }[],
  lastBaseImageIds: Readonly<Record<number, number>> = {}
): Promise<(GameSession | null)[]> {
  // **7레벨이 이 한 번의 조회를 나눠 쓴다.** 레벨마다 부르면 RPC로 묶은 의미가 없다.
  const masterData = await fetchGameMasterData();
  if (!masterData) {
    console.error("[planAllGameSessions] 마스터 데이터를 받지 못해 전 레벨을 포기한다.");
    return levels.map(() => null);
  }

  const plans = await Promise.all(
    levels.map((cfg) =>
      planGameSession(
        masterData.master,
        cfg.level,
        cfg.diffCount,
        lastBaseImageIds[cfg.level] ?? null
      )
    )
  );

  const apiUrl = process.env.GENERATE_UNIFIED_API_URL;
  if (!apiUrl) {
    console.error("Missing GENERATE_UNIFIED_API_URL environment variable.");
    return plans.map(() => null);
  }

  // 성사된 계획만 모아 좌/우 순서로 늘어놓는다. 실패한 레벨은 자리를 만들지 않으므로
  // 아래에서 `null`로 남는다.
  const ready = plans.filter((p): p is SessionPlan => p !== null);
  const combinations = ready.flatMap((p) => [
    { baseImageId: p.baseImageId, imageSlots: p.leftImageSlots },
    { baseImageId: p.baseImageId, imageSlots: p.rightImageSlots },
  ]);

  /*
   * **마스터 데이터를 함께 보낸다**(2026-08-17, 구자건). 저쪽은 이게 오면 자기 쪽
   * `get_game_master_data` 호출을 건너뛴다. **빠뜨려도 아무 일이 일어나지 않는다** —
   * 저쪽에 "없으면 스스로 RPC를 돌린다"는 폴백이 있어서 조용히 예전만큼 느려질 뿐
   * 화면도 테스트도 멀쩡하다. 이 인자를 지우지 말 것.
   *
   * 넘기는 것은 **RPC 응답 원본**이다. 도메인 타입을 다시 직렬화하면 `z_index`가 빠져
   * 저쪽 레이어 순서가 틀어진다(`fetchGameMasterData` 주석).
   */
  const result = await requestUnifiedImages(apiUrl, combinations, masterData.raw);
  if (!result.ok) {
    // **벌크는 전부 아니면 전무다.** 한 조합이 빠져도 여기서 전 레벨이 null이 되므로
    // 화면에는 늘 "1단계 …"로 뜬다(`fetchAllSessions`가 첫 null을 집는다). 실제로
    // 어느 배경이 실패했는지는 이 로그에만 있다.
    console.error(`[planAllGameSessions] generate-unified 벌크 호출 실패: ${result.error}`);
    return plans.map(() => null);
  }

  // `urls`는 요청 순서대로 복원돼 돌아온다(`requestUnifiedImages`가 키로 짝짓는다).
  // 되붙이는 계산은 `sessionZip.ts`에 순수 함수로 있다 — 이 함수는 Supabase를 타서
  // 단위 테스트가 안 되는데, 14개 URL을 7레벨에 되돌리는 그 줄이 가장 위험하기 때문이다.
  return zipPlansToSessions(plans, result.urls).map((zipped) =>
    zipped
      ? {
          level: zipped.level,
          leftSceneUrl: zipped.leftSceneUrl,
          rightSceneUrl: zipped.rightSceneUrl,
          slots: zipped.plan.slots,
          baseImageId: zipped.plan.baseImageId,
        }
      : null
  );
}

/**
 * `nickname`은 **문자열이 아니라 조립 전 재료다**(2026-08-12). 언어 선택은 화면이
 * 렌더 시점에 한다 — 여기서 확정하면 접속 후 언어 토글을 눌러도 닉네임만 한국어로
 * 남는다(서버 액션은 그때 다시 불리지 않는다). 자세한 배경은 `lib/nicknameParts.ts`.
 */
export type ParticipantResult = {
  nickname: Nickname;
  nicknameSynced: boolean;
};

async function resolveParticipantId(): Promise<string> {
  const token = await getOrIssueToken();
  const hash = hashToken(token);
  const hex32 = hash.slice(0, 32);
  return `${hex32.slice(0, 8)}-${hex32.slice(8, 12)}-${hex32.slice(12, 16)}-${hex32.slice(16, 20)}-${hex32.slice(20, 32)}`;
}

/**
 * 배정 API가 없거나 실패했을 때. **한국어 전용이다** — 개발·장애 경로이고,
 * 서버에 저장되지도 않아 방문할 때마다 바뀐다(`nicknameSynced: false`).
 */
function localFallback(): ParticipantResult {
  return { nickname: { text: generateNickname() }, nicknameSynced: false };
}

/**
 * 이미 배정된 닉네임을 조회한다. 없거나 조회에 실패하면 null(→ 호출부가 배정으로 넘어감).
 *
 * `participants` 직접 SELECT는 RLS로 막혀 있어 `get_participant` RPC를 써야 한다
 * (gookbapanalyze/AGENTS.md).
 */
async function lookupExistingNickname(participantId: string): Promise<NicknameParts | null> {
  const { data, error } = await supabase.rpc("get_participant", { p_id: participantId });
  if (error) {
    console.error("[lookupExistingNickname] get_participant 실패:", error);
    return null;
  }
  return nicknameFromParticipantRows(data);
}

async function assignNicknameOrFallback(participantId: string): Promise<ParticipantResult> {
  const apiUrl = process.env.NICKNAME_ASSIGN_API_URL;
  if (!apiUrl) {
    console.error("[assignNicknameOrFallback] NICKNAME_ASSIGN_API_URL 미설정, 로컬 폴백 사용");
    return localFallback();
  }

  const result = await requestNicknameAssign(apiUrl, participantId);
  if (!result.ok) {
    console.error("[assignNicknameOrFallback] 닉네임 API 실패:", result.error);
    return localFallback();
  }

  // 배정 응답도 2026-08-12부터 다국어 맵을 준다(요청서 반영). 조회 경로와 같은 형태라
  // 그대로 넘기면 되고, 조립·로케일 선택은 화면(formatNickname)이 한다.
  return { nickname: result.nickname, nicknameSynced: true };
}

async function ensureParticipantUnsafe(trackId: string | null): Promise<ParticipantResult> {
  const participantId = await resolveParticipantId();

  const { error: insertError } = await supabase
    .from("participants")
    .insert({ participant_id: participantId });

  if (insertError && insertError.code !== "23505") {
    console.error("[ensureParticipant] participants insert 실패:", insertError);
    return localFallback();
  }

  // insertError가 없으면 = 방금 새로 생성된 참여자(진짜 신규 방문).
  // 23505(중복키)면 = 이미 존재하는 참여자(재방문/새로고침) — 이 경우엔 신규가 아님.
  const isNewParticipant = !insertError;

  // track_logs에 직접 INSERT하지 않는다 — anon의 INSERT 권한이 삭제됐다
  // (gookbapanalyze/AGENTS.md, 2026-08-10 커밋 a4a6416). 반드시 add_track_log RPC를 쓴다.
  //
  // 중복 집계 방지는 서버가 한다: 30분 이내 활성 세션이 있으면 새 row를 만들지 않고
  // 기존 log_id를 돌려주므로, 새로고침을 연타해도 방문자 수가 부풀지 않는다.
  // 그래서 여기서 "신규 참여자인지" 같은 조건을 걸 필요가 없다.
  //
  // trackId가 null이어도 호출한다 — 문서 7번이 "없으면 null"을 명시한다.
  // (부작용: ?q= 없는 개발/QA 직접 접속도 방문자 수에 잡힌다.)
  //
  // 반환되는 log_id는 쓰지 않는다. update_track_log_action이 participant_id만
  // 받으므로 클라이언트가 log_id를 들고 있을 이유가 없다.
  //
  // 참여자의 연속성/최초 방문 판별은 여기가 아니라 participants가 담당한다
  // (쿠키 해시 기반 participant_id + PK 충돌 23505). 두 관심사는 분리돼 있다.
  const { error: trackLogError } = await supabase.rpc("add_track_log", {
    p_participant_id: participantId,
    p_track_id: trackId,
  });
  if (trackLogError) {
    console.error("[ensureParticipant] add_track_log 실패(무시, best-effort):", trackLogError);
  }

  // 재방문자에게 배정 API를 다시 호출하면 닉네임이 새로 뽑혀서 새로고침마다 바뀐다
  // (assign_random_nickname은 멱등하지 않음 — 2026-08-05 실제 배포에서 확인).
  // 그래서 재방문일 때는 배정 대신 이미 저장된 닉네임을 읽어온다.
  // 조회가 실패하거나 아직 닉네임이 없으면 아래 배정 경로로 떨어진다.
  if (!isNewParticipant) {
    const existing = await lookupExistingNickname(participantId);
    if (existing) return { nickname: existing, nicknameSynced: true };
  }

  return assignNicknameOrFallback(participantId);
}

export async function ensureParticipant(trackId: string | null): Promise<ParticipantResult> {
  try {
    return await ensureParticipantUnsafe(trackId);
  } catch (error) {
    console.error("[ensureParticipant] 예기치 못한 예외:", error);
    return localFallback();
  }
}

/**
 * KPI 2·4단계. 익명 유저는 track_logs를 직접 UPDATE할 수 없으므로
 * update_track_log_action RPC로 현재 세션의 로그를 갱신한다
 * (활성 세션이 없으면 서버가 새 세션을 만들어 기록한다).
 *
 * 실패는 삼킨다 — KPI 집계 실패가 게임 진행을 막아서는 안 된다.
 * participant_id는 httpOnly 쿠키에서 나오므로 클라이언트가 직접 부를 수 없다.
 */
async function recordTrackAction(action: "game_start" | "share_click"): Promise<void> {
  try {
    const participantId = await resolveParticipantId();
    const { error } = await supabase.rpc("update_track_log_action", {
      p_participant_id: participantId,
      p_action: action,
    });
    if (error) {
      console.error(`[recordTrackAction] ${action} 실패(무시, best-effort):`, error);
    }
  } catch (error) {
    console.error(`[recordTrackAction] ${action} 예기치 못한 예외:`, error);
  }
}

export async function recordGameStart(): Promise<void> {
  await recordTrackAction("game_start");
}

export async function recordShareClick(): Promise<void> {
  await recordTrackAction("share_click");
}

/**
 * 초대 링크에 실을 공유 트랙 id를 찾는다(KPI 5단계).
 *
 * 새 트랙을 만들지 않는다 — 현재 접속한 트랙의 지점(branch_id)에 이미
 * `is_shared = true`로 등록돼 있는 트랙을 골라 쓴다. 여러 개면 가장 먼저
 * 만들어진 것으로 고정한다(호출할 때마다 링크가 달라지면 안 되므로).
 *
 * tracks는 RLS가 `Everyone: SELECT`라 anon이 직접 읽을 수 있다(RPC 불필요).
 * 찾지 못하면 null — 호출부는 초대 버튼을 숨긴다. 현재 URL로 대체하면
 * is_shared=false인 매장 트랙이 실려 공유 유입이 잘못 집계된다.
 */
export async function fetchSharedTrackId(trackId: string | null): Promise<string | null> {
  // 지점을 특정할 수 없는 유입(온라인 광고, ?q= 없는 기본 URL, 등록되지 않은 트랙)은
  // '온라인' 지점의 공유 트랙으로 떨어진다. 이 폴백이 없으면 버튼이 아예 안 뜨는데,
  // 그러면 그 경로의 공유 유입 KPI를 통째로 포기하게 된다.
  const fallback = process.env.FALLBACK_SHARED_TRACK_ID ?? null;
  try {
    if (!trackId) return fallback;

    const { data: current, error: currentError } = await supabase
      .from("tracks")
      .select("branch_id")
      .eq("track_id", trackId)
      .maybeSingle();
    if (currentError || !current?.branch_id) {
      if (currentError) console.error("[fetchSharedTrackId] 현재 트랙 조회 실패:", currentError);
      return fallback;
    }

    const { data: shared, error: sharedError } = await supabase
      .from("tracks")
      .select("track_id")
      .eq("branch_id", current.branch_id)
      .eq("is_shared", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (sharedError) {
      console.error("[fetchSharedTrackId] 공유 트랙 조회 실패:", sharedError);
      return fallback;
    }
    // 해당 지점에 공유 트랙이 없으면(아직 안 만들었으면) 온라인으로 떨어뜨린다.
    return resolveInviteTrackId(shared?.track_id, fallback);
  } catch (error) {
    console.error("[fetchSharedTrackId] 예기치 못한 예외:", error);
    return fallback;
  }
}

export async function reassignNickname(): Promise<ParticipantResult> {
  try {
    const participantId = await resolveParticipantId();
    return await assignNicknameOrFallback(participantId);
  } catch (error) {
    console.error("[reassignNickname] 예기치 못한 예외:", error);
    return localFallback();
  }
}

/**
 * 설문 문항을 가져온다. 기본값은 쿠폰 받기 전 노출되는 Phase 1이고,
 * 게임 중 힌트 설문은 `phase: 0`으로 부른다.
 * survey_questions는 Everyone SELECT가 허용되어 있어 직접 조회해도 된다
 * (gookbapanalyze/AGENTS.md).
 *
 * **phase마다 형제 함수를 만들지 말 것.** 아래 `is_active` 함정 처리가 그 안에
 * 있어서, 복사해 가면 한쪽만 고쳐지는 순간 그 phase의 문항이 통째로 사라진다.
 *
 * 반환값이 배열이 아니라 SurveyFetchResult인 이유: 조회 실패와 "문항 0건"을
 * 호출부가 구분해야 하기 때문이다. 둘 다 []를 반환하던 이전 구현에서는
 * DB 장애가 조용한 설문 스킵으로 위장돼 원인 파악이 불가능했다.
 *
 * 비활성 문항은 제외하되, 조건은 `is_active = true`가 아니라
 * **`is_active`가 false가 아닌 것**이다. Postgres에서 `= true`는 NULL을 매칭하지
 * 않으므로, `is_active`가 NULL인 기존 row(컬럼 추가 이전에 만들어진 문항 등)가
 * 통째로 사라진다. 설문이 빈 목록으로 보이는 장애를 고치러 와서 오히려 영구적인
 * 빈 목록을 만들 수 있어, 명시적으로 false인 것만 제외한다.
 */
export async function fetchSurveyQuestions(phase: number = 1): Promise<SurveyFetchResult> {
  try {
    const { data, error } = await supabase
      .from("survey_questions")
      .select("question_id, question_type, question_text, options, is_required")
      .eq("survey_phase", phase)
      .not("is_active", "is", false)
      .order("order_index", { ascending: true });

    if (error) {
      console.error("[fetchSurveyQuestions] 조회 실패:", error);
    }
    return toSurveyFetchResult(data, error);
  } catch (error) {
    console.error("[fetchSurveyQuestions] 예기치 못한 예외:", error);
    return { ok: false, questions: [] };
  }
}

/**
 * `check_pending_survey` RPC의 원본 결과. **실패와 "남은 문항 없음"을 구분한다.**
 *
 * phase 0(힌트)은 이 구분이 필요 없어 `fetchPendingSurveyQuestionIds`를 그대로 쓰지만,
 * phase 1(쿠폰)은 빈 목록이 곧 "설문 건너뛰기"라 조회 실패를 빈 목록으로 뭉뚱그리면
 * **자격 없는 사람을 뽑기로 보내 서버가 403(SURVEY_REQUIRED)으로 거절한다.**
 */
export type PendingSurveyResult =
  | { ok: true; questionIds: string[] }
  | { ok: false; questionIds: [] };

/**
 * 미응답 문항 조회의 **원본 형태**. 실패 여부를 함께 돌려준다.
 *
 * `p_track_id`는 **null을 넘긴다.** track_id는 phase 2에서만 지점 판별에 쓰이므로
 * (그쪽 문서 주의사항) phase 0·1에는 의미가 없다 — 호출부가 트랙을 찾아 헤맬 필요가 없다.
 */
export async function fetchPendingSurvey(phase: number): Promise<PendingSurveyResult> {
  try {
    const participantId = await resolveParticipantId();
    const { data, error } = await supabase.rpc("check_pending_survey", {
      p_survey_phase: phase,
      p_participant_id: participantId,
      p_track_id: null,
    });

    if (error) {
      console.error("[fetchPendingSurvey] 조회 실패:", error);
      return { ok: false, questionIds: [] };
    }
    return {
      ok: true,
      questionIds: ((data ?? []) as { question_id?: string }[])
        .map((row) => row.question_id)
        .filter((id): id is string => typeof id === "string"),
    };
  } catch (error) {
    console.error("[fetchPendingSurvey] 예기치 못한 예외:", error);
    return { ok: false, questionIds: [] };
  }
}

/**
 * 아직 답하지 않은 문항의 `question_id` 목록. `check_pending_survey` RPC를 부른다.
 *
 * **이것만으로는 화면을 그릴 수 없다** — 문항 텍스트도 선택지도 오지 않는다
 * (gookbapanalyze/AGENTS.md의 반환 예시). `fetchSurveyQuestions(phase)`로 받은
 * 전체 행을 이 목록으로 걸러내는 용도다.
 *
 * **실패와 "남은 문항 없음"을 구분하지 않는다** — phase 0(힌트) 전용 편의 래퍼다.
 * 둘 다 빈 배열이고, 호출부는 어느 쪽이든 "전체에서 무작위로 재탕"이라는 같은 경로로
 * 떨어진다(phase 0은 중복 응답 허용).
 *
 * **phase 1에 이걸 쓰지 말 것.** 거기서는 빈 배열이 "설문 건너뛰기"를 뜻하므로 조회
 * 실패가 그대로 403이 된다 — `fetchPendingSurvey`를 직접 써서 `ok`를 볼 것.
 */
export async function fetchPendingSurveyQuestionIds(phase: number): Promise<string[]> {
  const result = await fetchPendingSurvey(phase);
  return result.questionIds;
}

export async function submitSurveyResponses(
  questions: SurveyQuestion[],
  answers: SurveyAnswerMap
): Promise<{ ok: boolean }> {
  try {
    const participantId = await resolveParticipantId();
    const rows = buildSurveyResponseRows(questions, answers);
    if (rows.length === 0) return { ok: false };

    // 중복 제출 방지를 여기서 SELECT로 하지 않는다. survey_responses는
    // Everyone INSERT만 열려 있고 SELECT 권한이 없어(gookbapanalyze/AGENTS.md),
    // RLS가 막으면 error 없이 빈 배열이 돌아와 가드가 항상 통과하는 죽은 코드가 된다.
    // 재제출 차단은 useCouponFlow의 hasSubmittedRef가 클라이언트에서 담당한다.
    const { error } = await supabase
      .from("survey_responses")
      .insert(rows.map((row) => ({ ...row, participant_id: participantId })));

    if (error) {
      console.error("[submitSurveyResponses] insert 실패:", error);
      return { ok: false };
    }
    return { ok: true };
  } catch (error) {
    console.error("[submitSurveyResponses] 예기치 못한 예외:", error);
    return { ok: false };
  }
}

export type DrawCouponResult =
  | { status: "won"; coupon: IssuedCoupon }
  /**
   * **온라인몰 전용 효과가 뽑혔다.** 저쪽이 `web_coupons` 한 장을 배정하고
   * `web_coupon_code`를 돌려준 경우다(`gatchaApi.ts`).
   *
   * **`wonButHidden`으로 떨어뜨리지 말 것.** 그 발급도 `issued_coupons`에 남지만
   * 우리는 그 행을 걷어내므로(`withoutOnlineCoupons`) 매장 쿠폰 목록에서는 영영
   * 못 찾는다 — 예전에는 그래서 "발급되었지만 표시할 수 없어요"라는 막다른 길이
   * 떴고, 카드 연출까지 통째로 건너뛰어 뽑기를 한 기억조차 남지 않았다
   * (2026-08-17 실기 제보).
   *
   * **필터를 푸는 것으로 고치지 말 것.** 스캐너가 받지 않는 QR 카드에 서버가 준
   * `is_used: true`로 '사용 완료' 도장이 찍히던 2026-08-15 사고가 되살아난다.
   * 온라인 당첨은 매장 쿠폰과 **다른 결과**로 다뤄야 한다.
   */
  | { status: "wonOnline"; code: string }
  /**
   * 발급은 됐는데 그 쿠폰을 `get_my_coupons`에서 찾지 못한 상태.
   *
   * `coupon_id`로 짝짓게 된 뒤로는 **읽기 실패의 신호**다(예전에는 온라인 쿠폰이
   * 뽑히기만 해도 여기로 떨어졌다 — 위 `wonOnline` 참고). 여기 오면 콘솔에
   * `coupon_id`가 남으므로 그것으로 DB를 짚어볼 수 있다.
   */
  | { status: "wonButHidden" }
  | { status: "miss" }
  /**
   * 서버가 조건을 보고 거절(기간 제한·플레이 부족·설문 미완료). 재시도 무의미.
   * `code`는 사유이며 지금은 소비처가 없다 — 배선만 깔아둔 것이다(gatchaApi.ts).
   */
  | { status: "rejected"; message: string; code?: string }
  /** 네트워크·설정 오류. 재시도 버튼을 보여줄 상황. */
  | { status: "error"; message: string };

/**
 * `coupon_effect_id` → 다국어 상품명. `coupon_effects`는 RLS가 Everyone: SELECT라
 * anon도 직접 읽을 수 있다(RPC 불필요).
 *
 * `coupon_type` 컬럼은 jsonb가 아니라 **text**라 다국어 맵이 JSON **문자열**로
 * 들어 있다 — Supabase가 파싱해주지 않으므로 `parseCouponType`으로 편다.
 *
 * 조회에 실패해도 던지지 않는다. 이름이 없으면 "—"로 보일 뿐이지만, 여기서 던지면
 * QR까지 사라져 쿠폰을 매장에서 쓸 수 없게 된다 — 이름보다 QR이 중요하다.
 */
async function fetchCouponNames(
  effectIds: string[]
): Promise<{ names: Map<string, LocalizedName>; onlineOnly: Set<string> }> {
  const names = new Map<string, LocalizedName>();
  /**
   * 온라인몰 전용 효과 id. 이 쿠폰들은 목록에서 걷어낸다 —
   * 근거는 `issuedCoupons.ts`의 `withoutOnlineCoupons` 주석에 있다.
   */
  const onlineOnly = new Set<string>();
  if (effectIds.length === 0) return { names, onlineOnly };

  const { data, error } = await supabase
    .from("coupon_effects")
    .select("coupon_effect_id, coupon_type, is_online_coupon")
    .in("coupon_effect_id", effectIds);

  if (error) {
    console.error("[fetchCouponNames] coupon_effects 조회 실패:", error);
    return { names, onlineOnly };
  }

  for (const row of (data ?? []) as {
    coupon_effect_id: string;
    coupon_type: string;
    is_online_coupon?: boolean;
  }[]) {
    names.set(row.coupon_effect_id, parseCouponType(row.coupon_type));
    // 컬럼이 없거나 null이면 매장 쿠폰으로 친다(fail open) — 이 플래그를 못 읽었다고
    // 멀쩡한 쿠폰이 목록에서 사라지는 쪽이 훨씬 나쁘다.
    if (row.is_online_coupon === true) onlineOnly.add(row.coupon_effect_id);
  }

  // Supabase의 SELECT RLS는 에러를 내지 않고 **행을 걸러낸다**(error: null, data: []).
  // 그래서 위의 error 분기로는 권한 문제를 잡을 수 없고, 화면 증상은 이 수정 이전과
  // 완전히 똑같아진다(이름 "—", 이모지 기본값). 이 로그가 없으면 배포 후에도
  // 어느 층에서 끊겼는지 구분할 수 없다.
  if (names.size < effectIds.length) {
    console.error(`[fetchCouponNames] 이름 누락 ${names.size}/${effectIds.length}`, effectIds);
  }
  return { names, onlineOnly };
}

/**
 * 내 쿠폰 목록. issued_coupons 직접 SELECT는 RLS로 막혀 있어 RPC가 필수다
 * (gookbapanalyze/AGENTS.md).
 */
export async function fetchMyCoupons(): Promise<IssuedCoupon[]> {
  try {
    const participantId = await resolveParticipantId();
    const { data, error } = await supabase.rpc("get_my_coupons", { p_id: participantId });
    if (error) {
      console.error("[fetchMyCoupons] get_my_coupons 실패:", error);
      return [];
    }

    const sorted = sortByIssuedAt((data ?? []) as IssuedCouponRow[]);

    // 상품명은 별도 조회다 — RPC 응답에 없다(issuedCoupons.ts의 IssuedCouponRow 주석).
    const { names, onlineOnly } = await fetchCouponNames([
      ...new Set(sorted.map((r) => r.coupon_effect_id)),
    ]);
    // 온라인몰 전용 효과는 목록에서 걷어낸다. **여기 한 곳에서 거른다** —
    // 화면마다 거르면 새 화면이 생길 때 빠뜨린다(`withoutOnlineCoupons` 주석).
    return withoutOnlineCoupons(sorted, onlineOnly).map((row) => toIssuedCoupon(row, names));
  } catch (error) {
    console.error("[fetchMyCoupons] 예기치 못한 예외:", error);
    return [];
  }
}

/**
 * 내 온라인몰 쿠폰 목록. `web_coupons` 직접 SELECT는 RLS로 막혀 있어 RPC가 필수다
 * (`gookbapanalyze/AGENTS.md`의 12번 절 — anon에게는 정책이 아예 없고 관리자 전용이다).
 *
 * **매장 쿠폰과 합치지 않는다.** 두 목록을 하나로 이어 붙이면 화면이 종류를 판정하려고
 * 필드 유무(`code`가 있나 `couponId`가 있나)를 보게 되는데, 그건 타입이 할 일이다.
 * 앨범이 두 배열을 따로 받아 각자 그린다.
 */
export async function fetchMyWebCoupons(): Promise<WebCoupon[]> {
  try {
    const participantId = await resolveParticipantId();
    const { data, error } = await supabase.rpc("get_my_web_coupons", { p_id: participantId });
    if (error) {
      console.error("[fetchMyWebCoupons] get_my_web_coupons 실패:", error);
      return [];
    }
    return sortByAssignedAt(toWebCoupons((data ?? []) as WebCouponRow[]));
  } catch (error) {
    console.error("[fetchMyWebCoupons] 예기치 못한 예외:", error);
    return [];
  }
}

/**
 * 온라인몰 쿠폰 문구(`web_coupon_settings`). 운영자가 대시보드에서 적는 값이며
 * **혜택 내용이 여기 문장으로 들어간다** — 할인율을 담는 숫자 컬럼은 없다.
 *
 * `Everyone: SELECT`라 직접 읽는다(RPC 불필요, `coupon_effects`와 같은 사정).
 * 단일 행이므로 `id = 1`을 집는다.
 *
 * **`coupon_effects.coupon_type`과 달리 `JSON.parse`가 필요 없다.** 그쪽은 컬럼 타입이
 * `text`라 다국어 맵이 JSON 문자열로 들어 있지만, 이 두 컬럼은 실제 `jsonb`라
 * Supabase가 객체로 돌려준다(2026-08-13 실물 확인).
 *
 * 조회 실패는 null이다 — 화면이 로케일 파일의 기본 문구로 떨어진다. 문구 하나 때문에
 * 쿠폰을 못 보여주는 쪽이 나쁘다.
 */
export async function fetchWebCouponSettings(): Promise<WebCouponSettings | null> {
  try {
    const { data, error } = await supabase
      .from("web_coupon_settings")
      .select("title, description")
      .eq("id", 1)
      .maybeSingle();
    if (error) {
      console.error("[fetchWebCouponSettings] 조회 실패:", error);
      return null;
    }
    return (data as WebCouponSettings | null) ?? null;
  } catch (error) {
    console.error("[fetchWebCouponSettings] 예기치 못한 예외:", error);
    return null;
  }
}

/**
 * 뽑기 횟수 제한 설정. 튜토리얼에 "1일 3회까지" 같은 규칙을 고지하는 데 쓴다
 * (2026-08-14, 이란토 — "왜 설문도 안 했는데 또 뽑히지"라는 제보가 규칙을 화면
 * 어디에서도 알려주지 않은 데서 왔다).
 *
 * **횟수를 하드코딩하지 말 것.** 운영자가 대시보드에서 바꾸는 값이라(`gatcha_settings`,
 * `Everyone: SELECT`라 anon이 직접 읽는다 — `coupon_effects`·`web_coupon_settings`와
 * 같은 패턴이며 RPC가 필요 없다) 화면이 DB를 따라가야 한다.
 *
 * **`limit_type`에 따라 판정 기준이 실제로 다르다**(저쪽 `api/gatcha/draw/route.ts` 실물
 * 확인). `days`면 KST 자정 기준이라 "1일 3회"·"오늘"이 맞고, `hours`면
 * `now - N시간`의 롤링 윈도우라 "오늘"이라는 말 자체가 틀린다. 문구를 한쪽으로
 * 고정하지 말 것 — `gatchaLimitNotice`가 이 값을 보고 가른다.
 *
 * **남은 횟수는 여기서 알 수 없다.** 그건 `gatcha_logs`를 세야 하는데 그 테이블은
 * anon에게 INSERT만 열려 있다(SELECT는 Admin 전용). draw 응답에도 잔여가 없다 —
 * "2/3 남음" 같은 표시를 하려면 저쪽에 RPC를 요청해야 한다.
 */
export type GatchaLimitSettings = {
  limitType: string;
  limitN: number;
  limitM: number;
};

export async function fetchGatchaLimit(): Promise<GatchaLimitSettings | null> {
  try {
    const { data, error } = await supabase
      .from("gatcha_settings")
      .select("limit_type, limit_n, limit_m")
      .eq("id", 1)
      .maybeSingle();
    if (error) {
      console.error("[fetchGatchaLimit] 조회 실패:", error);
      return null;
    }
    if (!data) return null;
    // 값이 깨져 있으면 안내를 띄우지 않는다 — 틀린 횟수를 고지하는 것보다 낫다.
    const limitN = Number(data.limit_n);
    const limitM = Number(data.limit_m);
    if (!Number.isFinite(limitN) || !Number.isFinite(limitM) || limitM <= 0) return null;
    return { limitType: String(data.limit_type), limitN, limitM };
  } catch (error) {
    console.error("[fetchGatchaLimit] 예기치 못한 예외:", error);
    return null;
  }
}

/**
 * 온라인몰 쿠폰 발급. 설문(phase 1) 최초 응답자에게 100% 확정 지급된다.
 *
 * **자격 판정은 전부 서버가 한다.** `/api/web-coupons/assign`이 설문 완료 여부를
 * 검증하고 미배정 코드를 원자적으로 집어준다 — 클라이언트가 "설문했으니 받을 수 있다"고
 * 판단해서 부르는 것이 아니라, **일단 부르고 서버 판정을 따른다.**
 *
 * `drawCoupon`과 달리 **중복 호출이 안전하다.** 이미 받은 사람에게 서버가 무엇을
 * 돌려주는지(같은 코드인지 거절인지)는 실기로 확인되지 않았지만, 어느 쪽이든
 * 화면이 하는 일은 "목록을 다시 읽는다"로 같다. 그래서 앨범 진입 시 보완 발급을
 * 걸 수 있다(아래 `ensureWebCoupon`).
 *
 * 로컬 폴백을 만들지 말 것 — `drawCoupon`과 같은 이유다. 코드는 서버 `web_coupons`에
 * 실재해야만 온라인몰에서 등록된다.
 */
export async function assignWebCoupon(): Promise<{ ok: boolean }> {
  const apiUrl = process.env.WEB_COUPON_ASSIGN_API_URL;
  if (!apiUrl) {
    console.error("[assignWebCoupon] WEB_COUPON_ASSIGN_API_URL 미설정");
    return { ok: false };
  }

  try {
    const participantId = await resolveParticipantId();
    const result = await requestWebCouponAssign(apiUrl, participantId);
    if (!result.ok) {
      /* 거절(4xx)은 정상 경로다 — 설문 미완료이거나 재고가 없다. 실패를 삼키는
         이유는 KPI 액션들과 같다: 온라인몰 쿠폰을 못 받는 것이 게임 진행이나
         매장 쿠폰 발급을 막아서는 안 된다. */
      console[result.rejected ? "warn" : "error"](
        `[assignWebCoupon] 발급 실패(rejected=${result.rejected}):`,
        result.error
      );
      return { ok: false };
    }
    return { ok: true };
  } catch (error) {
    console.error("[assignWebCoupon] 예기치 못한 예외:", error);
    return { ok: false };
  }
}

/**
 * 온라인몰 쿠폰을 확보한 뒤 목록을 돌려준다.
 *
 * **설문 직후 발급이 실패한 사람을 위한 보완 경로다.** `useCouponFlow`의
 * `submitAnswers`는 이미 제출한 사람이면 **서버를 부르지 않고 곧장 true를 리턴하므로**
 * (localStorage 기반 재제출 차단), 거기서 한 번 실패하면 다시 시도할 기회가 영영 없다.
 * 그래서 앨범을 열 때 목록이 비어 있으면 한 번 더 부른다.
 *
 * 자격 없는 사람이 눌러도 **서버가 403으로 거절**하므로 안전하다. 그 판정을 여기서
 * 흉내내지 말 것 — 설문 완료 여부의 진실은 `survey_responses`이고 localStorage가 아니다.
 */
export async function ensureWebCoupons(): Promise<WebCoupon[]> {
  const existing = await fetchMyWebCoupons();
  if (existing.length > 0) return existing;

  const assigned = await assignWebCoupon();
  if (!assigned.ok) return existing;
  return fetchMyWebCoupons();
}

/**
 * 룰렛 1회 실행. gookbapanalyze의 /api/gatcha/draw가 쿨타임·설문 완료를 검증하고
 * issued_coupons에 INSERT까지 수행한다.
 *
 * 로컬 폴백을 만들지 말 것. 닉네임과 달리 쿠폰은 서버가 DB에 기록해야만 유효하며,
 * 클라이언트가 지어낸 쿠폰은 매장에서 스캔되지 않는다.
 */
export async function drawCoupon(): Promise<DrawCouponResult> {
  const apiUrl = process.env.GATCHA_DRAW_API_URL;
  if (!apiUrl) {
    console.error("[drawCoupon] GATCHA_DRAW_API_URL 미설정");
    return { status: "error", message: "GATCHA_DRAW_API_URL이 설정되지 않았습니다." };
  }

  try {
    const participantId = await resolveParticipantId();
    const result = await requestGatchaDraw(apiUrl, participantId);

    if (!result.ok) {
      // code는 있을 때만 싣는다 — undefined를 넣으면 값 없는 키가 생긴다(gatchaApi.ts).
      return result.rejected
        ? { status: "rejected", message: result.error, ...(result.code && { code: result.code }) }
        : { status: "error", message: result.error };
    }

    if (!result.won) return { status: "miss" };

    // 온라인몰 전용 효과가 뽑힌 경우. **목록을 뒤지지 않는다** — 그 발급은
    // `withoutOnlineCoupons`에 걸려 매장 쿠폰 목록에 애초에 나타나지 않는다.
    if (result.webCouponCode) {
      return { status: "wonOnline", code: result.webCouponCode };
    }

    // 표시는 여전히 `get_my_coupons`가 담당한다 — draw 응답의 이름·날짜를 화면에
    // 쓰면 거절 복구 경로와 값이 갈려 "두 번째 진실"이 생긴다(`gatchaApi.ts`).
    // 응답에서 가져오는 것은 **어느 행인지를 가리키는 id 하나뿐**이다.
    const coupons = await fetchMyCoupons();
    const issued = matchIssuedCoupon(coupons, result.couponId, Date.now());
    if (!issued) {
      // 여기 오면 발급은 됐는데 그 행을 읽지 못한 것이다. id를 남겨야 DB에서
      // 짚을 수 있다 — 이 로그가 없으면 화면 증상만으로는 원인을 못 가른다.
      console.error(
        `[drawCoupon] 발급된 쿠폰을 목록에서 찾지 못했다 (coupon_id=${result.couponId ?? "없음"}, 목록 ${coupons.length}건)`
      );
      return { status: "wonButHidden" };
    }

    return { status: "won", coupon: issued };
  } catch (error) {
    console.error("[drawCoupon] 예기치 못한 예외:", error);
    return {
      status: "error",
      message: error instanceof Error ? error.message : "알 수 없는 오류",
    };
  }
}

/**
 * 게임 완주 시 점수를 기록한다. game_score_logs는 Anon INSERT가 허용되어 있다.
 *
 * 이 기록이 없으면 /api/gatcha/draw가 찾는 최고 점수가 0이 되어 모든 플레이어가
 * 최저 gatcha_cases 구간으로 뽑히게 된다 — 쿠폰 확률 설계가 통째로 무력화된다.
 *
 * best-effort다. 실패해도 결과 화면 흐름을 막지 않는다.
 */
export async function submitGameScore(gookbapScore: number): Promise<void> {
  try {
    const participantId = await resolveParticipantId();
    const { error } = await supabase.from("game_score_logs").insert({
      participant_id: participantId,
      gookbap_score: gookbapScore,
      joined_time: new Date().toISOString(),
    });
    if (error) console.error("[submitGameScore] insert 실패(무시, best-effort):", error);
  } catch (error) {
    console.error("[submitGameScore] 예기치 못한 예외:", error);
  }
}

/**
 * 랭킹 조회 결과. **조회 실패와 "기록 0건"을 구분한다** — `SurveyFetchResult`와 같은
 * 이유다. 둘 다 빈 배열을 돌려주면 DB 장애가 "오늘 아무도 안 함"으로 위장된다.
 */
export type RankingFetchResult = {
  /** false면 조회 자체가 실패한 것. 기록이 0건인 정상 응답과 다르다. */
  ok: boolean;
  rows: RankingViewRow[];
  /**
   * PostgREST 행 상한에 걸려 응답이 잘렸는가.
   *
   * 로컬 실측(2026-08-13): 상한은 **1000행**이고 `Content-Range: 0-999/1215`로 돌아온다 —
   * **HTTP 200이고 error도 null이다.** 잘렸다는 신호는 `count`와 응답 길이의 차이뿐이다.
   * 프로덕션 상한은 다를 수 있으므로 값을 상수로 박지 않고 그 차이로 판정한다.
   */
  truncated: boolean;
};

/**
 * 랭킹 뷰 조회. **RPC가 아니라 뷰 직접 조회다**(analyze/AGENTS.md).
 *
 * ## 기간 필터를 서버로 내려보내는 것이 요점이다
 *
 * 뷰는 **플레이 한 번당 한 행**이 쌓이고(샘플에서 12명이 51행), PostgREST에는 응답 행수
 * 상한이 있다. 닉네임당 최고점을 구하려면 **모든 행이 필요하므로** 잘린 응답으로 계산한
 * 랭킹은 **오류 없이** 틀린다. `.gte()`로 서버에서 거르면 daily/weekly/monthly는 공짜로
 * 해결된다.
 *
 * `total`은 그럴 수 없어서 `count: "exact"`로 전체 행수를 함께 받아 잘림을 **감지해서
 * 화면에 알린다.** 조용히 자르지 않는다.
 *
 * ## `gookbap_score` 내림차순 정렬을 서버에 맡긴다
 *
 * 상한이 `ORDER BY` **뒤에** 걸리는 것을 로컬에서 확인했다(2026-08-13 실측: 1215행 중
 * 1000행이 돌아오는데 그 안에 전체 최고점 1999가 들어 있었다). 그래서 잘려도 돌아온
 * 행들이 전역 상위권이고 상위 20위 표시는 맞는다 — 잘림 안내는 정직함을 위한 것이지
 * 표시를 포기하는 것이 아니다. 정렬을 클라이언트로 옮기면 이 성질이 사라진다.
 *
 * 기간 탭도 같은 정렬을 붙인다 — 손님이 몰린 하루가 상한을 넘길 수 있다.
 */
/**
 * 내 최고 점수. 기록이 없거나 조회에 실패하면 null이다.
 *
 * **순위는 함께 돌려주지 않는다**(2026-08-13, 이란토). `ranking_view`에 `participant_id`가
 * 없어서 랭킹 목록에서 내 줄을 확실히 특정할 수 없다 — 닉네임으로 맞춰볼 수는 있지만,
 * 두 단어 중 하나만 번역된 프리셋이 통째로 한국어로 폴백하는 규칙 때문에 **서로 다른
 * 사람이 같은 문자열이 될 수 있다**(`rankingRows.ts`의 그룹 키 주석과 같은 사정이다).
 * 틀린 줄을 "내 기록"으로 강조하는 쪽이 아무것도 안 하는 것보다 나쁘다.
 *
 * `game_score_logs`는 직접 SELECT가 막혀 있어 RPC를 써야 한다(analyze/AGENTS.md).
 * 이 RPC는 **내 기록만** 돌려주므로 `participant_id`가 밖으로 새지 않는다.
 *
 * 여기서는 `best_score`가 아니라 `gookbap_score`를 본다 — 랭킹과 **같은 컬럼이어야**
 * "내 점수"와 목록의 점수가 같은 척도가 된다(`rankingRows.ts`의 컬럼 주석 참고).
 */
export async function fetchMyBestScore(): Promise<number | null> {
  try {
    const participantId = await resolveParticipantId();
    const { data, error } = await supabase.rpc("get_my_score_logs", { p_id: participantId });
    if (error) {
      console.error("[fetchMyBestScore] get_my_score_logs 실패:", error);
      return null;
    }

    const scores = ((data ?? []) as { gookbap_score: number | null }[])
      .map((row) => row.gookbap_score)
      .filter((score): score is number => typeof score === "number");

    return scores.length === 0 ? null : Math.max(...scores);
  } catch (error) {
    console.error("[fetchMyBestScore] 예기치 못한 예외:", error);
    return null;
  }
}

export async function fetchRanking(period: RankingPeriod): Promise<RankingFetchResult> {
  try {
    let query = supabase
      .from("ranking_view")
      .select("nickname_first, nickname_last, nickname_number, gookbap_score, joined_time", {
        count: "exact",
      })
      /*
       * **`nullsFirst: false`가 빠지면 조용히 랭킹이 틀어진다.** Postgres는 DESC 정렬에서
       * NULL을 **앞에** 놓는다(로컬에서 직접 확인). `gookbap_score`가 null인 행은
       * `toRankingList`가 버리는데, 그 행들이 응답의 앞자리를 차지하면 **행 상한 안에서
       * 실제 상위권이 밀려나** 순위가 비거나 틀린 채로 그려진다 — 잘림은 감지되지만
       * 감지만으로는 고칠 수 없는 자리다.
       *
       * 로컬 스텁 컬럼은 `not null`이라 이 경로가 로컬에서는 재현되지 않는다. 프로덕션
       * 뷰가 null을 낼 수 있는지 확인되지 않았으므로, null이 없으면 공짜이고 있으면
       * 사고를 막는 이 한 줄을 넣어 둔다.
       */
      .order("gookbap_score", { ascending: false, nullsFirst: false });

    const start = rankingPeriodStart(period);
    if (start) query = query.gte("joined_time", start.toISOString());

    const { data, error, count } = await query;
    if (error) {
      console.error("[fetchRanking] ranking_view 조회 실패:", error);
      return { ok: false, rows: [], truncated: false };
    }

    const rows = (data ?? []) as RankingViewRow[];
    // count가 null이면(집계 실패) 잘렸는지 알 수 없다 — 모르는 것을 "안 잘렸다"로
    // 단정하지 않고 안내를 띄우는 쪽이 안전하지만, 그러면 정상 상황에서도 늘 뜬다.
    // count는 같은 응답 헤더에서 오므로 error 없이 null인 경우가 사실상 없어,
    // 여기서는 비교 가능할 때만 판정한다.
    const truncated = count != null && count > rows.length;
    if (truncated) {
      console.warn(`[fetchRanking] 응답이 잘렸다 — ${rows.length}/${count}행 (period=${period})`);
    }
    return { ok: true, rows, truncated };
  } catch (error) {
    console.error("[fetchRanking] 예기치 못한 예외:", error);
    return { ok: false, rows: [], truncated: false };
  }
}
