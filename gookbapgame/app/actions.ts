"use server";

import { supabase } from "./lib/db";

export type GamePart = {
  slotId: number;
  x: number;
  y: number;
  leftPartUrl: string;
  rightPartUrl: string;
  isDifference: boolean;
};

export type GameSession = {
  baseImageUrl: string;
  parts: GamePart[];
};

export async function fetchGameData(): Promise<GameSession | null> {
  try {
    // 1. Fetch a random base_image
    const { data: baseImages, error: baseErr } = await supabase
      .from("base_images")
      .select("*");

    if (baseErr || !baseImages || baseImages.length === 0) {
      console.error("Failed to fetch base_images:", baseErr);
      return null;
    }

    const randomBaseImage = baseImages[Math.floor(Math.random() * baseImages.length)];

    // 2. Fetch image_slots for this base_image
    const { data: slots, error: slotsErr } = await supabase
      .from("image_slots")
      .select("*")
      .eq("base_image_id", randomBaseImage.id);

    if (slotsErr || !slots || slots.length < 3) {
      console.error("Failed to fetch enough image_slots. Need at least 3.");
      return null;
    }

    // Pick 3 random slots (if there are more than 3)
    const shuffledSlots = [...slots].sort(() => 0.5 - Math.random()).slice(0, 3);
    const categoryIds = shuffledSlots.map(s => s.category_id);

    // 3. Fetch parts for these categories
    const { data: parts, error: partsErr } = await supabase
      .from("parts")
      .select("*")
      .in("category_id", categoryIds);

    if (partsErr || !parts || parts.length === 0) {
      console.error("Failed to fetch parts.");
      return null;
    }

    // 4. Determine 2 differences, 1 same
    const diffIndices = [0, 1, 2].sort(() => 0.5 - Math.random()).slice(0, 2);

    const gameParts: GamePart[] = [];

    for (let i = 0; i < 3; i++) {
      const slot = shuffledSlots[i];
      const slotParts = parts.filter(p => p.category_id === slot.category_id);
      
      if (slotParts.length === 0) continue;

      const isDifference = diffIndices.includes(i);
      let leftPartUrl = "";
      let rightPartUrl = "";

      if (isDifference && slotParts.length >= 2) {
        // Need 2 distinct parts
        const shuffledSlotParts = [...slotParts].sort(() => 0.5 - Math.random());
        leftPartUrl = shuffledSlotParts[0].image_url;
        rightPartUrl = shuffledSlotParts[1].image_url;
      } else {
        // Same part on both sides
        const randomPart = slotParts[Math.floor(Math.random() * slotParts.length)];
        leftPartUrl = randomPart.image_url;
        rightPartUrl = randomPart.image_url;
      }

      gameParts.push({
        slotId: slot.id,
        x: slot.x_coordinate,
        y: slot.y_coordinate,
        leftPartUrl,
        rightPartUrl,
        isDifference: leftPartUrl !== rightPartUrl
      });
    }

    return {
      baseImageUrl: randomBaseImage.image_url,
      parts: gameParts
    };

  } catch (error) {
    console.error("Error in fetchGameData:", error);
    return null;
  }
}
