"use server";

import { supabase } from "./lib/db";
import { clampDifferenceCount } from "./lib/gameSelection";
import { requestUnifiedImage, type ImageSlots } from "./lib/generateUnified";
import { getPartSilhouette, mapSilhouetteToSlot, type Point } from "./lib/hitPolygon";
import { getOrIssueToken, hashToken } from "./lib/participantToken";
import { requestNicknameAssign } from "./lib/nicknameApi";
import { generateNickname } from "./lib/nickname";

export type GameSlot = {
  slotId: number;
  x: number;
  y: number;
  slotScale: number;
  isDifference: boolean;
  leftHitPolygon: Point[] | null;
  rightHitPolygon: Point[] | null;
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

    // 3. Determine differences — GDD 7.2가 정한 스테이지별 고정 목표치를 우선하되,
    // 콘텐츠(유효 슬롯)가 그보다 적으면 있는 만큼만 차이로 지정한다(조용히 스킵하지 않음).
    const N = validSlots.length;
    const numDifferences = clampDifferenceCount(targetDiffCount, N);
    if (numDifferences < targetDiffCount) {
      console.warn(
        `[fetchGameData] level=${level}: 콘텐츠 슬롯(${N}개)이 목표 차이 개수(${targetDiffCount})보다 적어 ${numDifferences}개로 축소함`
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
  return hashToken(token);
}

async function assignNicknameOrFallback(participantId: string): Promise<ParticipantResult> {
  const apiUrl = process.env.NICKNAME_ASSIGN_API_URL;
  if (!apiUrl) {
    console.error("[assignNicknameOrFallback] NICKNAME_ASSIGN_API_URL 미설정, 로컬 폴백 사용");
    return { nickname: generateNickname(), nicknameSynced: false };
  }

  const result = await requestNicknameAssign(apiUrl, participantId);
  if (!result.ok) {
    console.error("[assignNicknameOrFallback] 닉네임 API 실패:", result.error);
    return { nickname: generateNickname(), nicknameSynced: false };
  }
  return { nickname: result.nickname, nicknameSynced: true };
}

export async function ensureParticipant(trackId: string | null): Promise<ParticipantResult> {
  const participantId = await resolveParticipantId();

  const { error: upsertError } = await supabase
    .from("participants")
    .upsert({ participant_id: participantId }, { onConflict: "participant_id", ignoreDuplicates: true });

  if (upsertError) {
    console.error("[ensureParticipant] participants upsert 실패:", upsertError);
    return { nickname: generateNickname(), nicknameSynced: false };
  }

  if (trackId) {
    const { error: trackLogError } = await supabase
      .from("track_logs")
      .insert([{ participant_id: participantId, track_id: trackId }]);
    if (trackLogError) {
      console.error("[ensureParticipant] track_logs insert 실패(무시, best-effort):", trackLogError);
    }
  }

  return assignNicknameOrFallback(participantId);
}

export async function reassignNickname(): Promise<ParticipantResult> {
  const participantId = await resolveParticipantId();
  return assignNicknameOrFallback(participantId);
}
