"use server";

import { supabase } from "./lib/db";
import { parseCouponType } from "./lib/couponType";
import { clampDifferenceCount, resolveQuestionsCount } from "./lib/gameSelection";
import { requestUnifiedImage, type ImageSlots } from "./lib/generateUnified";
import {
  getPartSilhouette,
  mapSilhouetteToSlot,
  pickPolygonSource,
  type Point,
} from "./lib/hitPolygon";
import { getOrIssueToken, hashToken } from "./lib/participantToken";
import { requestNicknameAssign } from "./lib/nicknameApi";
import { nicknameFromParticipantRows } from "./lib/existingNickname";
import type { Nickname, NicknameParts } from "./lib/nicknameParts";
import { generateNickname } from "./lib/nickname";
import type { LocalizedName } from "./lib/i18n/localizedName";
import { requestGatchaDraw } from "./lib/gatchaApi";
import { resolveInviteTrackId } from "./lib/inviteLink";
import { sortByIssuedAt, toIssuedCoupon, type IssuedCouponRow } from "./lib/issuedCoupons";
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
};

type PartRow = {
  id: number;
  image_url: string;
  offset_x: number;
  offset_y: number;
  scale: number;
};

async function computeSlotPolygons(
  leftPart: PartRow,
  rightPart: PartRow,
  slotScale: number
): Promise<{ leftHitPolygon: Point[] | null; rightHitPolygon: Point[] | null }> {
  const leftHull = await getPartSilhouette(leftPart.image_url);
  const rightHull =
    rightPart.id === leftPart.id ? leftHull : await getPartSilhouette(rightPart.image_url);

  // 투명 파트(= "없는 쪽")는 실루엣이 null이다. 규칙과 이유는 `pickPolygonSource`에.
  const leftSource = pickPolygonSource(leftHull, rightHull, leftPart, rightPart);
  const rightSource = pickPolygonSource(rightHull, leftHull, rightPart, leftPart);

  const toPolygon = (source: typeof leftSource) =>
    source
      ? mapSilhouetteToSlot(source.hull, {
          offsetX: source.placement.offset_x,
          offsetY: source.placement.offset_y,
          partScale: source.placement.scale,
          slotScale,
        })
      : null;

  const leftHitPolygon = toPolygon(leftSource);
  const rightHitPolygon = toPolygon(rightSource);

  return { leftHitPolygon, rightHitPolygon };
}

export async function fetchGameData(
  level: number,
  targetDiffCount: number
): Promise<GameSession | null> {
  try {
    // 1. Fetch base_images registered for this stage's level and shuffle them
    const { data: baseImages, error: baseErr } = await supabase
      .from("base_images")
      .select("*")
      .eq("level", level);

    if (baseErr || !baseImages || baseImages.length === 0) {
      console.error(`Failed to fetch base_images for level=${level}:`, baseErr);
      return null;
    }

    const shuffledBaseImages = [...baseImages].sort(() => 0.5 - Math.random());

    let selectedBaseImage = null;
    let validSlots: any[] = [];
    let validParts: any[] = [];

    // 2. Find the first base_image that meets the minimum requirements
    for (const base of shuffledBaseImages) {
      const { data: slots, error: slotsErr } = await supabase
        .from("image_slots")
        .select("*")
        .eq("base_image_id", base.id);

      if (slotsErr || !slots || slots.length === 0) continue;

      const categoryIds = slots.map((s) => s.category_id);

      const { data: parts, error: partsErr } = await supabase
        .from("parts")
        .select("*")
        .in("category_id", categoryIds);

      if (partsErr || !parts || parts.length === 0) continue;

      const dedupedSlots = Array.from(
        new Map(
          slots.map((slot) => [`${slot.x_coordinate},${slot.y_coordinate},${slot.scale}`, slot])
        ).values()
      );

      const currentValidSlots = dedupedSlots.filter((slot) => {
        const slotParts = parts.filter((p) => p.category_id === slot.category_id);
        return slotParts.length >= 2;
      });

      if (currentValidSlots.length >= 1) {
        selectedBaseImage = base;
        validSlots = currentValidSlots;
        validParts = parts;
        break;
      }
    }

    if (!selectedBaseImage || validSlots.length === 0) {
      console.error("No valid base image found with at least 1 valid slot.");
      return null;
    }

    // 힌트 클립보드에 표시할 카테고리명. 이 조회가 실패해도 게임 진행은 막지 않고,
    // 해당 슬롯의 categoryName을 null로 두어 클라이언트가 플레이스홀더를 그리게 한다.
    const usedCategoryIds = Array.from(new Set(validSlots.map((s) => s.category_id)));
    const { data: categoryRows, error: categoriesErr } = await supabase
      .from("part_categories")
      .select("id,name")
      .in("id", usedCategoryIds);

    if (categoriesErr) {
      console.warn("[fetchGameData] part_categories 조회 실패 — 힌트에 카테고리명이 비게 된다:", categoriesErr);
    }

    if (!categoriesErr && (categoryRows ?? []).length < usedCategoryIds.length) {
      console.warn(
        `[fetchGameData] part_categories ${usedCategoryIds.length}건 중 ${(categoryRows ?? []).length}건만 조회됨 — anon SELECT 권한/RLS 정책을 확인할 것`
      );
    }

    const categoryNameById = new Map<number, LocalizedName>(
      (categoryRows ?? []).map((row) => [row.id as number, row.name as LocalizedName])
    );

    // 3. Determine differences — **출제 개수는 이미지가 정한다.**
    // `base_images.questions_count`가 대시보드에서 이미지마다 설정하는 값이고
    // (기본값 3, DB 트리거가 image_slots 개수 이하임을 보장), 어느 레벨에 나올지도
    // 이미지의 `level`이 정한다. 그래서 같은 레벨이라도 뽑힌 이미지에 따라 개수가
    // 다를 수 있다 — 이것이 의도된 설계다(2026-08-07, 이란토).
    //
    // `targetDiffCount`(STAGE_CONFIG)는 그 값이 없을 때만 쓰는 폴백이다. 예전에는
    // 이쪽이 유일한 기준이라 대시보드에서 3개로 설정해도 레벨 7이 항상 7문항으로
    // 나왔다.
    const desiredCount = resolveQuestionsCount(selectedBaseImage.questions_count, targetDiffCount);

    const N = validSlots.length;
    const numDifferences = clampDifferenceCount(desiredCount, N);
    if (numDifferences < desiredCount) {
      console.warn(
        `[fetchGameData] level=${level}: 콘텐츠 슬롯(${N}개)이 목표 차이 개수(${desiredCount})보다 적어 ${numDifferences}개로 축소함`
      );
    }

    const diffIndices = [...Array(N).keys()].sort(() => 0.5 - Math.random()).slice(0, numDifferences);

    const leftImageSlots: ImageSlots = {};
    const rightImageSlots: ImageSlots = {};

    const slotBuilders: {
      slotId: number;
      x: number;
      y: number;
      slotScale: number;
      leftPart: PartRow;
      rightPart: PartRow;
      categoryName: LocalizedName;
    }[] = [];

    for (let i = 0; i < N; i++) {
      const slot = validSlots[i];
      const slotParts = validParts.filter((p) => p.category_id === slot.category_id);

      const isDifference = diffIndices.includes(i);
      let leftPart: PartRow;
      let rightPart: PartRow;

      if (isDifference && slotParts.length >= 2) {
        const shuffledSlotParts = [...slotParts].sort(() => 0.5 - Math.random());
        leftPart = shuffledSlotParts[0];
        rightPart = shuffledSlotParts[1];
      } else {
        const randomPart = slotParts[Math.floor(Math.random() * slotParts.length)];
        leftPart = randomPart;
        rightPart = randomPart;
      }

      slotBuilders.push({
        slotId: slot.id,
        x: slot.x_coordinate,
        y: slot.y_coordinate,
        slotScale: slot.scale ?? 1.0,
        leftPart,
        rightPart,
        categoryName: categoryNameById.get(slot.category_id) ?? null,
      });

      leftImageSlots[slot.category_id] = leftPart.id;
      rightImageSlots[slot.category_id] = rightPart.id;
    }

    const slots: GameSlot[] = await Promise.all(
      slotBuilders.map(async (builder) => {
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

    const baseImageId = selectedBaseImage.id;

    const apiUrl = process.env.GENERATE_UNIFIED_API_URL;
    if (!apiUrl) {
      console.error("Missing GENERATE_UNIFIED_API_URL environment variable.");
      return null;
    }

    const [leftResult, rightResult] = await Promise.all([
      requestUnifiedImage(apiUrl, baseImageId, leftImageSlots),
      requestUnifiedImage(apiUrl, baseImageId, rightImageSlots),
    ]);

    if (!leftResult.ok || !rightResult.ok) {
      console.error(
        `[fetchGameData] generate-unified 호출 실패 (base=${baseImageId}): left=${
          leftResult.ok ? "ok" : leftResult.error
        }, right=${rightResult.ok ? "ok" : rightResult.error}`
      );
      return null;
    }

    return {
      level,
      leftSceneUrl: leftResult.url,
      rightSceneUrl: rightResult.url,
      slots,
    };
  } catch (error) {
    console.error("Error in fetchGameData:", error);
    return null;
  }
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
 * 아직 답하지 않은 문항의 `question_id` 목록. `check_pending_survey` RPC를 부른다.
 *
 * **이것만으로는 화면을 그릴 수 없다** — 문항 텍스트도 선택지도 오지 않는다
 * (gookbapanalyze/AGENTS.md의 반환 예시). `fetchSurveyQuestions(phase)`로 받은
 * 전체 행을 이 목록으로 걸러내는 용도다.
 *
 * `p_track_id`는 **null을 넘긴다.** track_id는 phase 2에서만 지점 판별에 쓰이므로
 * (그쪽 문서 주의사항) phase 0에는 의미가 없다 — 호출부가 트랙을 찾아 헤맬 필요가 없다.
 *
 * **실패와 "남은 문항 없음"을 구분하지 않는다.** 둘 다 빈 배열이고, 호출부는 어느
 * 쪽이든 "전체에서 무작위로 재탕"이라는 같은 경로로 떨어진다(phase 0은 중복 응답
 * 허용). 여기에 `ok` 플래그를 붙이면 소비처 없는 분기만 늘어난다.
 */
export async function fetchPendingSurveyQuestionIds(phase: number): Promise<string[]> {
  try {
    const participantId = await resolveParticipantId();
    const { data, error } = await supabase.rpc("check_pending_survey", {
      p_survey_phase: phase,
      p_participant_id: participantId,
      p_track_id: null,
    });

    if (error) {
      console.error("[fetchPendingSurveyQuestionIds] 조회 실패:", error);
      return [];
    }
    return ((data ?? []) as { question_id?: string }[])
      .map((row) => row.question_id)
      .filter((id): id is string => typeof id === "string");
  } catch (error) {
    console.error("[fetchPendingSurveyQuestionIds] 예기치 못한 예외:", error);
    return [];
  }
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
  /** 발급은 됐는데 get_my_coupons로 읽지 못한 상태. 설계 문서 미해결 항목 1번. */
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
async function fetchCouponNames(effectIds: string[]): Promise<Map<string, LocalizedName>> {
  const names = new Map<string, LocalizedName>();
  if (effectIds.length === 0) return names;

  const { data, error } = await supabase
    .from("coupon_effects")
    .select("coupon_effect_id, coupon_type")
    .in("coupon_effect_id", effectIds);

  if (error) {
    console.error("[fetchCouponNames] coupon_effects 조회 실패:", error);
    return names;
  }

  for (const row of (data ?? []) as { coupon_effect_id: string; coupon_type: string }[]) {
    names.set(row.coupon_effect_id, parseCouponType(row.coupon_type));
  }

  // Supabase의 SELECT RLS는 에러를 내지 않고 **행을 걸러낸다**(error: null, data: []).
  // 그래서 위의 error 분기로는 권한 문제를 잡을 수 없고, 화면 증상은 이 수정 이전과
  // 완전히 똑같아진다(이름 "—", 이모지 기본값). 이 로그가 없으면 배포 후에도
  // 어느 층에서 끊겼는지 구분할 수 없다.
  if (names.size < effectIds.length) {
    console.error(`[fetchCouponNames] 이름 누락 ${names.size}/${effectIds.length}`, effectIds);
  }
  return names;
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
    const names = await fetchCouponNames([...new Set(sorted.map((r) => r.coupon_effect_id))]);
    return sorted.map((row) => toIssuedCoupon(row, names));
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

    // draw 응답에는 coupon_id가 없다(insert에 .select()가 없음).
    // 방금 발급된 쿠폰의 id는 get_my_coupons로 다시 읽어서 얻는다.
    const coupons = await fetchMyCoupons();
    const latest = coupons[0];
    if (!latest) return { status: "wonButHidden" };

    return { status: "won", coupon: latest };
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
