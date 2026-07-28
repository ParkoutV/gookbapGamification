import type { GukbapTier } from "../stageConfig.ts";

const GUKBAP_TIER_KEYS: Record<GukbapTier, string> = {
  "1953 Master": "gukbapTier.1953Master",
  "국밥 단골": "gukbapTier.regular",
  "국밥 미식가": "gukbapTier.gourmet",
  "국밥 탐험가": "gukbapTier.explorer",
  "국밥 입문생": "gukbapTier.beginner",
};

export function gukbapTierKey(tier: GukbapTier): string {
  return GUKBAP_TIER_KEYS[tier];
}
