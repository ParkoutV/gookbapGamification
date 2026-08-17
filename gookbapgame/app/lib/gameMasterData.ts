import type { LocalizedName } from "./i18n/localizedName.ts";

export type MasterSlot = {
  id: number;
  categoryId: number;
  x: number;
  y: number;
  scale: number;
};

export type MasterPart = {
  id: number;
  categoryId: number;
  imageUrl: string;
  offsetX: number;
  offsetY: number;
  scale: number;
};

export type MasterBaseImage = {
  id: number;
  level: number;
  questionsCount: number | null;
  slots: MasterSlot[];
};

export type GameMasterData = {
  baseImages: MasterBaseImage[];
  partsByCategory: Map<number, MasterPart[]>;
  categoryNames: Map<number, LocalizedName>;
};

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toSlot(row: Record<string, unknown>): MasterSlot | null {
  const id = num(row.id);
  const categoryId = num(row.category_id);
  const x = num(row.x_coordinate);
  const y = num(row.y_coordinate);
  if (id === null || categoryId === null || x === null || y === null) return null;
  return { id, categoryId, x, y, scale: num(row.scale) ?? 1 };
}

function toBaseImage(row: Record<string, unknown>): MasterBaseImage | null {
  const id = num(row.id);
  const level = num(row.level);
  if (id === null || level === null) return null;

  const slots = asRows(row.slots)
    .map(toSlot)
    .filter((slot): slot is MasterSlot => slot !== null);

  return { id, level, questionsCount: num(row.questions_count), slots };
}

function toPart(row: Record<string, unknown>, categoryId: number): MasterPart | null {
  const id = num(row.id);
  const imageUrl = row.image_url;
  if (id === null || typeof imageUrl !== "string" || imageUrl === "") return null;
  return {
    id,
    categoryId,
    imageUrl,
    offsetX: num(row.offset_x) ?? 0,
    offsetY: num(row.offset_y) ?? 0,
    scale: num(row.scale) ?? 1,
  };
}

function asRows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null)
    : [];
}

export function toGameMasterData(raw: unknown): GameMasterData | null {
  if (typeof raw !== "object" || raw === null) return null;
  const root = raw as Record<string, unknown>;

  const baseRows = asRows(root.base_images);
  const baseImages = baseRows
    .map(toBaseImage)
    .filter((base): base is MasterBaseImage => base !== null);

  if (baseImages.length === 0) {
    /*
     * **원본 건수가 진단을 가른다.** RPC가 `SECURITY INVOKER`면 anon이 실행은 해도
     * RLS에 걸려 빈 구조가 `error: null`로 돌아올 수 있다 — 그때는 원본이 0건이고
     * 권한 문제다. 0건이 아닌데 하나도 못 쓰면 컬럼(형태) 문제다. 두 경우의 화면
     * 증상이 똑같아서(전 레벨 "불러올 수 없습니다") 이 숫자가 유일한 단서다.
     */
    console.error(
      `[toGameMasterData] 쓸 수 있는 base_images가 없다(원본 ${baseRows.length}건) — ` +
        (baseRows.length === 0
          ? "RPC가 빈 결과를 줬다. anon 실행 권한·RLS를 의심할 것."
          : "id·level 컬럼이 빠졌다. RPC 반환 형태를 의심할 것.")
    );
    return null;
  }

  /*
   * **이 로그가 유일한 신호다.** `questions_count`가 오지 않으면 출제 개수가
   * `STAGE_CONFIG` 폴백으로 조용히 넘어가, 대시보드에서 3개로 맞춰도 7단계가
   * 7문항으로 나오던 옛 버그가 그대로 되살아난다(`gameSelection.ts` 주석 참고).
   * 화면은 멀쩡해 보이고 예외도 나지 않는다.
   */
  const missingCount = baseRows.filter((row) => !("questions_count" in row)).length;
  if (missingCount > 0) {
    console.error(
      `[toGameMasterData] base_images ${baseRows.length}건 중 ${missingCount}건에 questions_count가 없다 — 출제 개수가 STAGE_CONFIG 폴백으로 떨어진다. RPC 반환 컬럼을 확인할 것.`
    );
  }

  const partsByCategory = new Map<number, MasterPart[]>();
  const categoryNames = new Map<number, LocalizedName>();

  for (const category of asRows(root.categories)) {
    const categoryId = num(category.id);
    if (categoryId === null) continue;

    categoryNames.set(categoryId, (category.name ?? null) as LocalizedName);

    const parts = asRows(category.parts)
      .map((part) => toPart(part, categoryId))
      .filter((part): part is MasterPart => part !== null);
    partsByCategory.set(categoryId, parts);
  }

  return { baseImages, partsByCategory, categoryNames };
}
