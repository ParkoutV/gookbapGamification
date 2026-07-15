"use server";

import { supabase } from "./lib/db";

export type GamePart = {
  slotId: number;
  x: number;
  y: number;
  slotScale: number;
  leftPartUrl: string;
  leftOffsetX: number;
  leftOffsetY: number;
  leftPartScale: number;
  rightPartUrl: string;
  rightOffsetX: number;
  rightOffsetY: number;
  rightPartScale: number;
  isDifference: boolean;
};

export type GameSession = {
  baseImageUrl: string;
  parts: GamePart[];
};

export async function fetchGameData(): Promise<GameSession | null> {
  try {
    // 1. Fetch all base_images and shuffle them
    const { data: baseImages, error: baseErr } = await supabase
      .from("base_images")
      .select("*");

    if (baseErr || !baseImages || baseImages.length === 0) {
      console.error("Failed to fetch base_images:", baseErr);
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

      const categoryIds = slots.map(s => s.category_id);
      
      const { data: parts, error: partsErr } = await supabase
        .from("parts")
        .select("*")
        .in("category_id", categoryIds);

      if (partsErr || !parts || parts.length === 0) continue;

      // A valid slot must have at least 2 parts
      const currentValidSlots = slots.filter(slot => {
        const slotParts = parts.filter(p => p.category_id === slot.category_id);
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

    // 3. Determine differences
    const N = validSlots.length;
    // Math.round(N * (2/3)), but guarantee at least 1 difference
    const numDifferences = Math.max(1, Math.round(N * (2 / 3)));
    
    const diffIndices = [...Array(N).keys()].sort(() => 0.5 - Math.random()).slice(0, numDifferences);
    
    const gameParts: GamePart[] = [];

    for (let i = 0; i < N; i++) {
      const slot = validSlots[i];
      const slotParts = validParts.filter(p => p.category_id === slot.category_id);
      
      const isDifference = diffIndices.includes(i);
      let leftPart = null;
      let rightPart = null;

      if (isDifference && slotParts.length >= 2) {
        // Need 2 distinct parts
        const shuffledSlotParts = [...slotParts].sort(() => 0.5 - Math.random());
        leftPart = shuffledSlotParts[0];
        rightPart = shuffledSlotParts[1];
      } else {
        // Same part on both sides
        const randomPart = slotParts[Math.floor(Math.random() * slotParts.length)];
        leftPart = randomPart;
        rightPart = randomPart;
      }

      gameParts.push({
        slotId: slot.id,
        x: slot.x_coordinate,
        y: slot.y_coordinate,
        slotScale: slot.scale ?? 1.0,
        leftPartUrl: leftPart.image_url,
        leftOffsetX: leftPart.offset_x ?? 0,
        leftOffsetY: leftPart.offset_y ?? 0,
        leftPartScale: leftPart.scale ?? 1.0,
        rightPartUrl: rightPart.image_url,
        rightOffsetX: rightPart.offset_x ?? 0,
        rightOffsetY: rightPart.offset_y ?? 0,
        rightPartScale: rightPart.scale ?? 1.0,
        isDifference: leftPart.image_url !== rightPart.image_url
      });
    }

    return {
      baseImageUrl: selectedBaseImage.image_url,
      parts: gameParts
    };

  } catch (error) {
    console.error("Error in fetchGameData:", error);
    return null;
  }
}
