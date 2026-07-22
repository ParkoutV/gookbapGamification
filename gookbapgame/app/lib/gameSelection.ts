export function clampDifferenceCount(
  targetDiffCount: number,
  availableSlotCount: number
): number {
  return Math.min(targetDiffCount, availableSlotCount);
}
