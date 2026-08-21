import type { LocalizedName } from "./i18n/localizedName.ts";

/**
 * `get_game_master_data` RPC가 **실제로 돌려주는 형태**. 2026-08-17에 구자건(그 함수를
 * 만든 사람)이 직접 적어준 것이라 이 저장소에서 가장 믿을 만한 명세다.
 *
 * **`parts`에 `category_id`가 없다** — 파츠가 카테고리 밑에 중첩돼 있어 중복 키를 두지
 * 않았다. 평탄화한 배열에 `p.category_id === slot.category_id` 필터를 얹으면
 * `undefined === n`이 되어 유효 슬롯이 0개가 되고 전 레벨이 조용히 죽는다.
 * `toGameMasterData`가 부모 카테고리의 `id`를 채워 넣는 이유다.
 *
 * `z_index`는 이쪽 계산에 쓰지 않지만 **합성 API가 레이어 순서에 쓴다.** 그래서
 * 도메인 타입으로 옮긴 값이 아니라 **RPC 응답 원본을 그대로** 저쪽에 넘겨야 한다
 * (`planAllGameSessions` 참고).
 */
export type RawGameMasterData = {
  base_images: {
    id: number;
    level: number;
    title: Record<string, string>;
    image_url: string;
    questions_count: number;
    slots: {
      id: number;
      category_id: number;
      x_coordinate: number;
      y_coordinate: number;
      z_index: number;
      scale: number;
    }[];
  }[];
  categories: {
    id: number;
    name: Record<string, string>;
    parts: {
      id: number;
      name: Record<string, string>;
      image_url: string;
      offset_x: number;
      offset_y: number;
      scale: number;
    }[];
  }[];
};

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
  /**
   * 배경 이미지의 이름(부산 명소). `base_images.title`의 jsonb 원본이며 **로케일
   * 해석은 클라이언트에서 한다** — `PlannedSlot.categoryName`과 같은 이유다.
   * 서버에서 확정하면 접속 후 언어 토글을 눌러도 캡션만 옛 언어로 남는다.
   */
  title: LocalizedName;
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

  return {
    id,
    level,
    questionsCount: num(row.questions_count),
    title: (row.title ?? null) as LocalizedName,
    slots,
  };
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

  /*
   * **캡션이 조용히 비는 두 가지 경로를 가른다.**
   *
   * 화면 증상은 하나다 — 인화지 아래 빈 줄. 하지만 원인이 둘이고 대응이 정반대다.
   *
   * 1) `title`이 아예 없다: 대시보드에서 **아직 이름을 안 채운 배경**일 수 있다.
   *    정상 운영 중에도 나오는 상태라 `warn`이다. 롤아웃 중에 일부만 이름이 있으면
   *    매 게임 로드마다 찍히므로, 이것을 `error`로 두면 로그가 곧 무시된다.
   * 2) `title`은 있는데 **로케일 키가 하나도 안 맞는다**(`ko-KR` 같은 지역 코드).
   *    `resolveLocalizedName`이 요청 → en → ko를 모두 놓쳐 `—`로 떨어지므로 이름을
   *    채워 넣어도 영영 안 뜬다. 이쪽은 계약이 어긋난 것이라 `error`다.
   *
   * (2)를 (1)의 개수로 잡을 수 없다는 것이 요점이다 — 그 경우 `title`은 "있으므로"
   * 개수가 0이고 **아무 로그도 남지 않는다.** 저쪽 문서에는 있는데 실물에는 없던
   * `ranking_view.nickname_number`(2026-08-13)가 같은 종류의 사고였다.
   */
  const titled = baseRows.filter((row) => row.title !== null && row.title !== undefined);
  const untitled = baseRows.length - titled.length;
  if (untitled > 0) {
    console.warn(
      `[toGameMasterData] base_images ${baseRows.length}건 중 ${untitled}건에 title이 없다 — 그 배경은 인화지 캡션이 빈다.`
    );
  }

  const CAPTION_LOCALES = ["ko", "en", "ja", "zh"];
  const unusableTitle = titled.filter((row) => {
    const title = row.title as Record<string, unknown>;
    if (typeof title !== "object") return true;
    return !CAPTION_LOCALES.some((key) => typeof title[key] === "string" && title[key] !== "");
  });
  if (unusableTitle.length > 0) {
    console.error(
      `[toGameMasterData] title이 있는데 쓸 수 있는 로케일 키가 없는 배경 ${unusableTitle.length}건 — ` +
        `키: ${JSON.stringify(Object.keys(unusableTitle[0].title as object))}. ` +
        `${JSON.stringify(CAPTION_LOCALES)} 중 하나여야 캡션이 뜬다.`
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
