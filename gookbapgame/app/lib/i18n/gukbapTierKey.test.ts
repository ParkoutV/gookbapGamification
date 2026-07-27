import { test } from "node:test";
import assert from "node:assert/strict";
import { gukbapTierKey } from "./gukbapTierKey.ts";

test("각 GukbapTier 값이 올바른 번역 키로 매핑된다", () => {
  assert.equal(gukbapTierKey("1953 Master"), "gukbapTier.1953Master");
  assert.equal(gukbapTierKey("국밥 단골"), "gukbapTier.regular");
  assert.equal(gukbapTierKey("국밥 미식가"), "gukbapTier.gourmet");
  assert.equal(gukbapTierKey("국밥 탐험가"), "gukbapTier.explorer");
  assert.equal(gukbapTierKey("국밥 입문생"), "gukbapTier.beginner");
});
