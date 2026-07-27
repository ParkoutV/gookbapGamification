import { NextRequest } from "next/server";
import { supabase } from "@/app/lib/db";
import { composeScene, ScenePart } from "@/app/lib/composeScene";
import { fetchImageBuffer } from "@/app/lib/fetchImageBuffer";

export async function GET(request: NextRequest) {
  const baseImageId = request.nextUrl.searchParams.get("base");
  const partsParam = request.nextUrl.searchParams.get("parts");

  if (!baseImageId || !partsParam) {
    return new Response("Missing base or parts query parameter", { status: 400 });
  }

  const slotPartPairs = partsParam.split(",").map((pair) => {
    const [slotId, partId] = pair.split(":").map(Number);
    return { slotId, partId };
  });

  if (slotPartPairs.some((p) => Number.isNaN(p.slotId) || Number.isNaN(p.partId))) {
    return new Response("Invalid parts format", { status: 400 });
  }

  const { data: baseImage, error: baseErr } = await supabase
    .from("base_images")
    .select("image_url")
    .eq("id", Number(baseImageId))
    .single();

  if (baseErr || !baseImage) {
    return new Response("Base image not found", { status: 404 });
  }

  // 같은 슬롯/파츠가 여러 쌍에서 재사용될 수 있으므로(예: 두 슬롯이 같은 category의
  // 같은 파츠를 가리키는 경우), 요청 개수와 결과 개수를 비교하지 않고 Set으로
  // "요청한 ID가 전부 결과에 존재하는지"만 확인한다 — 길이 비교는 중복 ID가 있을 때
  // .in()이 distinct 없이 매칭 행만 반환해 오탐 404를 낼 수 있다.
  const slotIds = [...new Set(slotPartPairs.map((p) => p.slotId))];
  const { data: slots, error: slotsErr } = await supabase
    .from("image_slots")
    .select("*")
    .in("id", slotIds);

  const foundSlotIds = new Set((slots ?? []).map((s) => s.id));
  if (slotsErr || !slots || slotIds.some((id) => !foundSlotIds.has(id))) {
    return new Response("One or more slots not found", { status: 404 });
  }

  const partIds = [...new Set(slotPartPairs.map((p) => p.partId))];
  const { data: partRows, error: partsErr } = await supabase
    .from("parts")
    .select("*")
    .in("id", partIds);

  const foundPartIds = new Set((partRows ?? []).map((p) => p.id));
  if (partsErr || !partRows || partIds.some((id) => !foundPartIds.has(id))) {
    return new Response("One or more parts not found", { status: 404 });
  }

  try {
    const baseImageBuffer = await fetchImageBuffer(
      baseImage.image_url,
      `base_image(${baseImageId})`
    );

    const sceneParts: ScenePart[] = await Promise.all(
      slotPartPairs.map(async ({ slotId, partId }) => {
        const slot = slots.find((s) => s.id === slotId)!;
        const part = partRows.find((p) => p.id === partId)!;
        const imageBuffer = await fetchImageBuffer(
          part.image_url,
          `part(slot=${slotId}, part=${partId})`
        );

        return {
          slotId,
          x: slot.x_coordinate,
          y: slot.y_coordinate,
          slotScale: slot.scale ?? 1.0,
          offsetX: part.offset_x ?? 0,
          offsetY: part.offset_y ?? 0,
          partScale: part.scale ?? 1.0,
          imageBuffer,
          zIndex: slot.z_index ?? 1,
        };
      })
    );

    const composed = await composeScene(baseImageBuffer, sceneParts);

    return new Response(new Uint8Array(composed), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown image composition error";
    console.error(`[/api/scene] Failed to compose scene (base=${baseImageId}):`, message);
    return new Response(`Failed to compose scene: ${message}`, { status: 502 });
  }
}
