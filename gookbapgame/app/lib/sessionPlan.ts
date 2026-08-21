import type {
  GameMasterData,
  MasterBaseImage,
  MasterPart,
  MasterSlot,
} from "./gameMasterData.ts";
import type { ImageSlots } from "./generateUnified.ts";
import type { LocalizedName } from "./i18n/localizedName.ts";
import { orderBaseImageCandidates, shuffled } from "./baseImageOrder.ts";
import { clampDifferenceCount, resolveQuestionsCount } from "./gameSelection.ts";

/** 한 슬롯에 무엇을 올릴지 정해진 상태. 히트 폴리곤은 아직 없다(네트워크가 필요하다). */
export type PlannedSlot = {
  slotId: number;
  x: number;
  y: number;
  slotScale: number;
  leftPart: MasterPart;
  rightPart: MasterPart;
  categoryName: LocalizedName;
};

export type SessionSelection = {
  baseImageId: number;
  /** 배경 이름(부산 명소)의 jsonb 원본. 화면 캡션에 쓴다 — 해석은 클라이언트 몫이다. */
  baseImageTitle: LocalizedName;
  slots: PlannedSlot[];
  leftImageSlots: ImageSlots;
  rightImageSlots: ImageSlots;
};

/**
 * 좌표와 배율이 같은 슬롯은 한 자리로 친다. 대시보드에서 겹쳐 등록된 것이라
 * 그대로 두면 같은 자리에 두 번 출제된다.
 */
function dedupeSlots(slots: readonly MasterSlot[]): MasterSlot[] {
  return Array.from(
    new Map(slots.map((slot) => [`${slot.x},${slot.y},${slot.scale}`, slot])).values()
  );
}

/** 좌/우를 다르게 만들려면 파츠가 최소 2개 있어야 한다. */
function usableSlots(base: MasterBaseImage, master: GameMasterData): MasterSlot[] {
  return dedupeSlots(base.slots).filter(
    (slot) => (master.partsByCategory.get(slot.categoryId) ?? []).length >= 2
  );
}

/**
 * 한 레벨의 출제를 정한다. **네트워크를 타지 않는 순수 계산이다** —
 * 마스터 데이터는 `planAllGameSessions`가 RPC 한 번으로 받아 7레벨이 나눠 쓴다.
 *
 * `excludeBaseImageId`는 **직전 판에서 이 레벨이 쓴 배경**이다. 있으면 후보 순서에서
 * 뒤로 밀려 다른 배경이 우선 뽑히고, 대안이 없으면 그대로 다시 뽑힌다
 * (`baseImageOrder.ts`가 그 이유를 설명한다: 빼버리면 풀이 1장인 레벨에서 게임이
 * 시작되지 않는다).
 */
export function selectSessionPlan(
  master: GameMasterData,
  level: number,
  targetDiffCount: number,
  excludeBaseImageId?: number | null
): SessionSelection | null {
  const candidates = orderBaseImageCandidates(
    master.baseImages.filter((base) => base.level === level),
    excludeBaseImageId
  );

  const selected = candidates
    .map((base) => ({ base, slots: usableSlots(base, master) }))
    .find(({ slots }) => slots.length >= 1);

  if (!selected) return null;

  const { base, slots: validSlots } = selected;

  /*
   * **출제 개수는 이미지가 정한다.** `questions_count`가 대시보드에서 이미지마다
   * 설정하는 값이고, `targetDiffCount`(STAGE_CONFIG)는 그 값이 없을 때만 쓰는
   * 폴백이다(`gameSelection.ts` 주석 참고).
   */
  const desiredCount = resolveQuestionsCount(base.questionsCount, targetDiffCount);
  const numDifferences = clampDifferenceCount(desiredCount, validSlots.length);
  if (numDifferences < desiredCount) {
    console.warn(
      `[selectSessionPlan] level=${level}: 콘텐츠 슬롯(${validSlots.length}개)이 목표 차이 개수(${desiredCount})보다 적어 ${numDifferences}개로 축소함`
    );
  }

  // Fisher-Yates(`shuffled`)를 쓴다 — `sort(() => 0.5 - Math.random())`은 비교자가
  // 일관되지 않아 특정 조합이 훨씬 자주 나온다. 정답 위치의 다양성이 걸린 자리다.
  const diffIndices = new Set(
    shuffled([...Array(validSlots.length).keys()]).slice(0, numDifferences)
  );

  const leftImageSlots: ImageSlots = {};
  const rightImageSlots: ImageSlots = {};

  const slots = validSlots.map((slot, i) => {
    const slotParts = master.partsByCategory.get(slot.categoryId) ?? [];

    let leftPart: MasterPart;
    let rightPart: MasterPart;
    if (diffIndices.has(i)) {
      const picked = shuffled(slotParts);
      leftPart = picked[0];
      rightPart = picked[1];
    } else {
      leftPart = slotParts[Math.floor(Math.random() * slotParts.length)];
      rightPart = leftPart;
    }

    leftImageSlots[slot.categoryId] = leftPart.id;
    rightImageSlots[slot.categoryId] = rightPart.id;

    return {
      slotId: slot.id,
      x: slot.x,
      y: slot.y,
      slotScale: slot.scale,
      leftPart,
      rightPart,
      categoryName: master.categoryNames.get(slot.categoryId) ?? null,
    };
  });

  return { baseImageId: base.id, baseImageTitle: base.title, slots, leftImageSlots, rightImageSlots };
}
