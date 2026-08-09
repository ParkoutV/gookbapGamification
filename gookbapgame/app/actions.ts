"use server";

import { supabase } from "./lib/db";
import { parseCouponType } from "./lib/couponType";
import { clampDifferenceCount, resolveQuestionsCount } from "./lib/gameSelection";
import { requestUnifiedImage, type ImageSlots } from "./lib/generateUnified";
import { getPartSilhouette, mapSilhouetteToSlot, type Point } from "./lib/hitPolygon";
import { getOrIssueToken, hashToken } from "./lib/participantToken";
import { requestNicknameAssign } from "./lib/nicknameApi";
import { nicknameFromParticipantRows } from "./lib/existingNickname";
import { generateNickname } from "./lib/nickname";
import type { LocalizedName } from "./lib/i18n/localizedName";
import { requestGatchaDraw } from "./lib/gatchaApi";
import { sortByIssuedAt, toIssuedCoupon, type IssuedCouponRow } from "./lib/issuedCoupons";
import type { IssuedCoupon } from "./lib/issuedCoupons";

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

  const leftHitPolygon = leftHull
    ? mapSilhouetteToSlot(leftHull, {
        offsetX: leftPart.offset_x,
        offsetY: leftPart.offset_y,
        partScale: leftPart.scale,
        slotScale,
      })
    : null;

  const rightHitPolygon = rightHull
    ? mapSilhouetteToSlot(rightHull, {
        offsetX: rightPart.offset_x,
        offsetY: rightPart.offset_y,
        partScale: rightPart.scale,
        slotScale,
      })
    : null;

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

export type ParticipantResult = {
  nickname: string;
  nicknameSynced: boolean;
};

async function resolveParticipantId(): Promise<string> {
  const token = await getOrIssueToken();
  const hash = hashToken(token);
  const hex32 = hash.slice(0, 32);
  return `${hex32.slice(0, 8)}-${hex32.slice(8, 12)}-${hex32.slice(12, 16)}-${hex32.slice(16, 20)}-${hex32.slice(20, 32)}`;
}

function localFallback(): ParticipantResult {
  return { nickname: generateNickname(), nicknameSynced: false };
}

/**
 * 이미 배정된 닉네임을 조회한다. 없거나 조회에 실패하면 null(→ 호출부가 배정으로 넘어감).
 *
 * `participants` 직접 SELECT는 RLS로 막혀 있어 `get_participant` RPC를 써야 한다
 * (gookbapanalyze/AGENTS.md).
 */
async function lookupExistingNickname(participantId: string): Promise<string | null> {
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

  // track_logs는 접속할 때마다 새 row로 남긴다(2026-08-09, 구자건 정책 —
  // 사이트 실시간 추적 목적). 재방문/새로고침마다 쌓이는 것이 의도된 동작이다.
  //
  // 예전에는 신규 참여자일 때만 기록했는데, 그 근거로 적혀 있던
  // "(participant_id, track_id)당 row 1개를 가정하는 game_start_count UPDATE"는
  // 실재하지 않는 제약이었다 — update_track_log_action은 p_log_id로 특정 row를
  // 직접 겨냥하므로 row가 몇 개든 깨지지 않는다.
  //
  // 참여자의 연속성/최초 방문 판별은 여기가 아니라 participants가 담당한다
  // (쿠키 해시 기반 participant_id + PK 충돌 23505). 두 관심사는 분리돼 있다.
  if (trackId) {
    const { error: trackLogError } = await supabase
      .from("track_logs")
      .insert([{ participant_id: participantId, track_id: trackId }]);
    if (trackLogError) {
      console.error("[ensureParticipant] track_logs insert 실패(무시, best-effort):", trackLogError);
    }
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
 * 쿠폰 받기 전 노출되는 Phase 1 설문 문항을 가져온다.
 * survey_questions는 Everyone SELECT가 허용되어 있어 직접 조회해도 된다
 * (gookbapanalyze/AGENTS.md).
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
export async function fetchSurveyQuestions(): Promise<SurveyFetchResult> {
  try {
    const { data, error } = await supabase
      .from("survey_questions")
      .select("question_id, question_type, question_text, options, is_required")
      .eq("survey_phase", 1)
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
  /** 서버가 조건을 보고 거절(쿨타임 등). 재시도 무의미. */
  | { status: "rejected"; message: string }
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
      return result.rejected
        ? { status: "rejected", message: result.error }
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
