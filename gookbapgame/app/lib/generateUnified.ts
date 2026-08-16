export type ImageSlots = Record<number, number>;

export type UnifiedCombination = {
  baseImageId: number;
  imageSlots: ImageSlots;
};

export type GenerateUnifiedResult =
  | { ok: true; urls: string[] }
  | { ok: false; error: string };

/**
 * 응답 매칭용 키. **순서로 짝지으면 안 된다** — 저쪽(`gookbapanalyze`의
 * `/api/generate-unified`)은 캐시 적중분을 먼저 `results`에 넣고 새로 합성한 것을
 * 나중에 이어붙이므로, 캐시가 일부만 더워진 상태에서 **요청 순서와 응답 순서가
 * 어긋난다.** 인덱스로 짝지으면 3단계 왼쪽 그림에 5단계 장면이 들어가는데,
 * 에러 없이 조용히 틀리고 캐시가 비었거나 꽉 찬 로컬 테스트에서는 재현되지 않는다.
 *
 * 저쪽이 슬롯 키를 정렬하고 값을 `toString()`으로 문자열화해서 돌려주므로
 * (route.ts의 `sortedSlotsJson`), 이쪽도 같은 방식으로 만들어야 양쪽 키가 맞는다.
 */
function combinationKey(baseImageId: number | string, imageSlots: Record<string, unknown>): string {
  const slots = Object.keys(imageSlots)
    .sort()
    .map((k) => `${k}:${String(imageSlots[k])}`)
    .join(",");
  return `${Number(baseImageId)}|${slots}`;
}

/**
 * 조합 여러 건을 **한 번의 POST**로 합성 요청한다(벌크 API, 2026-08-16 백엔드 요청).
 * 7레벨 × 좌/우 = 14건이 요청 하나로 나간다 — 예전에는 14번을 각각 보냈고,
 * 저쪽은 요청마다 `get_game_master_data` RPC와 캐시 조회를 새로 돌렸다.
 *
 * 반환 `urls`는 **입력 `combinations`와 같은 순서**다(위 키 매칭으로 복원한다).
 */
export async function requestUnifiedImages(
  apiUrl: string,
  combinations: UnifiedCombination[]
): Promise<GenerateUnifiedResult> {
  if (combinations.length === 0) return { ok: true, urls: [] };

  let res: Response;
  try {
    res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ combinations }),
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unknown fetch error" };
  }

  let body: any;
  try {
    body = await res.json();
  } catch {
    return { ok: false, error: `Invalid JSON response (status ${res.status})` };
  }

  if (!res.ok || body?.success !== true || !Array.isArray(body?.results)) {
    const message = typeof body?.error === "string" ? body.error : `Unexpected response (status ${res.status})`;
    return { ok: false, error: message };
  }

  const urlByKey = new Map<string, string>();
  for (const row of body.results as any[]) {
    if (!row || typeof row.url !== "string") continue;
    urlByKey.set(combinationKey(row.baseImageId, row.imageSlots ?? {}), row.url);
  }

  const urls: string[] = [];
  for (const comb of combinations) {
    const url = urlByKey.get(combinationKey(comb.baseImageId, comb.imageSlots));
    // 저쪽은 합성에 실패한 조합을 **조용히 빼고** `success: true`를 준다
    // (route.ts의 `if (!res.error) results.push(res)`). 14건 요청에 12건이 와도
    // 성공으로 보이므로, 빠진 것을 여기서 실패로 바꾸지 않으면 `undefined`가
    // 그대로 `leftSceneUrl`이 된다.
    if (typeof url !== "string") {
      return { ok: false, error: `Missing result for baseImageId=${comb.baseImageId}` };
    }
    urls.push(url);
  }

  return { ok: true, urls };
}
