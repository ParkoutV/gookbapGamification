import { test } from "node:test";
import assert from "node:assert/strict";
import { toGameMasterData } from "./gameMasterData.ts";

/** `get_game_master_data`가 돌려주는 형태를 흉내낸 최소 원본. */
const rawSample = () => ({
  base_images: [
    {
      id: 1,
      level: 3,
      questions_count: 5,
      title: { ko: "해운대 해수욕장", en: "Haeundae Beach" },
      slots: [
        { id: 11, category_id: 100, x_coordinate: 10, y_coordinate: 20, scale: 1.5 },
        { id: 12, category_id: 200, x_coordinate: 30, y_coordinate: 40, scale: 1 },
      ],
    },
  ],
  categories: [
    {
      id: 100,
      name: { ko: "간판", en: "Sign" },
      parts: [
        { id: 1001, category_id: 100, image_url: "a.png", offset_x: 1, offset_y: 2, scale: 0.9 },
      ],
    },
  ],
});

test("배경·슬롯을 도메인 타입으로 옮긴다", () => {
  const master = toGameMasterData(rawSample());

  assert.ok(master);
  assert.equal(master.baseImages.length, 1);

  const base = master.baseImages[0];
  assert.equal(base.id, 1);
  assert.equal(base.level, 3);
  assert.equal(base.questionsCount, 5);
  assert.deepEqual(base.slots[0], {
    id: 11,
    categoryId: 100,
    x: 10,
    y: 20,
    scale: 1.5,
  });
});

/*
 * 캡션(인화지 하단 장소 이름)의 원천이다. **jsonb 원본 그대로** 실어야 한다 —
 * 여기서 로케일을 확정하면 접속 후 언어를 바꿔도 캡션만 옛 언어로 남는다.
 */
test("배경 제목을 다국어 맵 그대로 싣는다", () => {
  const master = toGameMasterData(rawSample());

  assert.deepEqual(master?.baseImages[0].title, {
    ko: "해운대 해수욕장",
    en: "Haeundae Beach",
  });
});

test("파츠를 카테고리별로 모으고 카테고리명을 함께 싣는다", () => {
  const master = toGameMasterData(rawSample());

  assert.ok(master);
  assert.deepEqual(master.partsByCategory.get(100), [
    { id: 1001, categoryId: 100, imageUrl: "a.png", offsetX: 1, offsetY: 2, scale: 0.9 },
  ]);
  assert.deepEqual(master.categoryNames.get(100), { ko: "간판", en: "Sign" });
});

/*
 * `scale`이 비면 1로 채운다 — 렌더링 기본값이 1.0이라 "없음"과 "1"은 같은 그림이다.
 * **`selectSessionPlan`의 좌표 중복 제거가 이 값을 키로 쓰므로** 여기서 정규화하지
 * 않으면 같은 자리·같은 배율인 슬롯 둘이 서로 다른 것으로 남아 같은 자리에 두 번
 * 출제된다(이전 구현이 그랬다).
 */
test("slot.scale이 없으면 1로 채운다", () => {
  const raw = rawSample();
  delete (raw.base_images[0].slots[0] as Record<string, unknown>).scale;

  const master = toGameMasterData(raw);

  assert.equal(master?.baseImages[0].slots[0].scale, 1);
});

/** `console.error`를 가로채 메시지를 모은다. */
function captureErrors<T>(run: () => T): { result: T; errors: string[] } {
  const errors: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => errors.push(args.map(String).join(" "));
  try {
    return { result: run(), errors };
  } finally {
    console.error = original;
  }
}

/*
 * **조용히 넘어가면 안 되는 자리다.** `questions_count`가 오지 않으면
 * `resolveQuestionsCount`가 `STAGE_CONFIG` 폴백으로 떨어지는데, 그건 대시보드에서
 * 3개로 설정해도 7단계가 7문항으로 나오던 2026-08-07 이전의 버그 그대로다.
 * 에러도 나지 않고 화면도 멀쩡해 보이므로 로그가 유일한 신호다.
 */
test("questions_count가 없으면 null로 두고 에러를 남긴다", () => {
  const raw = rawSample();
  delete (raw.base_images[0] as Record<string, unknown>).questions_count;

  const { result: master, errors } = captureErrors(() => toGameMasterData(raw));

  assert.ok(master);
  assert.equal(master.baseImages[0].questionsCount, null, "배경 자체는 버리지 않는다");
  assert.equal(errors.length, 1);
  assert.match(errors[0], /questions_count/);
});

/*
 * **경로 둘을 갈라 둔 이유가 여기 있다.** 이름을 아직 안 채운 배경은 운영 중에도
 * 나오는 상태라 `warn`이고, 키 규칙이 어긋난 것은 이름을 채워도 영영 안 뜨므로
 * `error`다. 후자를 전자의 개수로 잡을 수 없다 — 그때 `title`은 "있다".
 */
function captureWarnings<T>(run: () => T): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const originalError = console.error;
  const originalWarn = console.warn;
  console.error = (...args: unknown[]) => errors.push(args.map(String).join(" "));
  console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(" "));
  try {
    run();
    return { errors, warnings };
  } finally {
    console.error = originalError;
    console.warn = originalWarn;
  }
}

test("title이 없는 배경은 warn — 아직 이름을 안 채운 것일 수 있다", () => {
  const raw = rawSample();
  delete (raw.base_images[0] as Record<string, unknown>).title;

  const { errors, warnings } = captureWarnings(() => toGameMasterData(raw));

  assert.equal(errors.length, 0, "정상 운영 중에도 나오는 상태를 error로 두면 로그가 무시된다");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /title/);
});

/*
 * `ko-KR`처럼 지역 코드가 붙으면 `resolveLocalizedName`의 폴백 체인(요청 → en → ko)이
 * 전부 빗나가 `—`가 된다. **`title`은 있으므로 위 warn에는 안 걸린다** — 이 검사가
 * 없으면 전 배경의 캡션이 아무 흔적 없이 빈다.
 */
test("title의 로케일 키가 어긋나면 error", () => {
  const raw = rawSample();
  (raw.base_images[0] as Record<string, unknown>).title = { "ko-KR": "해운대" };

  const { errors } = captureWarnings(() => toGameMasterData(raw));

  assert.equal(errors.length, 1);
  assert.match(errors[0], /ko-KR/, "실제 키를 보여주지 않으면 무엇을 고쳐야 할지 모른다");
});

/*
 * `level`은 폴백이 없다 — 없으면 어느 단계에 낼 배경인지 알 수 없다. 한 건이 비는
 * 것은 데이터 문제지만 **전부 비면 RPC 형태가 다른 것**이므로, 조용히 빈 목록을
 * 돌려주지 않고 null로 떨어뜨려 호출부가 알게 한다.
 */
test("level이 없는 배경은 버리고, 하나도 남지 않으면 null이다", () => {
  const raw = rawSample();
  delete (raw.base_images[0] as Record<string, unknown>).level;

  const { result: master, errors } = captureErrors(() => toGameMasterData(raw));

  assert.equal(master, null);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /base_images/);
});
