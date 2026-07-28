export type ImageSlots = Record<number, number>;

export type GenerateUnifiedResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export async function requestUnifiedImage(
  apiUrl: string,
  baseImageId: number,
  imageSlots: ImageSlots
): Promise<GenerateUnifiedResult> {
  let res: Response;
  try {
    res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseImageId, imageSlots }),
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

  if (!res.ok || body?.success !== true || typeof body?.url !== "string") {
    const message = typeof body?.error === "string" ? body.error : `Unexpected response (status ${res.status})`;
    return { ok: false, error: message };
  }

  return { ok: true, url: body.url };
}
