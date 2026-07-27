import { test } from "node:test";
import assert from "node:assert/strict";
import { runWithConcurrencyLimit } from "./concurrencyLimit.ts";

test("동시 실행 개수가 limit을 넘지 않고, 아이템이 충분하면 limit까지 올라간다", async () => {
  const items = Array.from({ length: 10 }, (_, i) => i);
  let active = 0;
  let peak = 0;
  await runWithConcurrencyLimit(items, 4, async () => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
  });
  assert.ok(peak <= 4, `peak concurrency ${peak}가 4를 넘으면 안됨`);
  assert.equal(peak, 4);
});

test("실패가 없으면 모든 아이템을 처리한다", async () => {
  const items = [1, 2, 3, 4, 5, 6, 7];
  const processed: number[] = [];
  await runWithConcurrencyLimit(items, 4, async (item) => {
    processed.push(item);
  });
  assert.deepEqual(processed.slice().sort((a, b) => a - b), items);
});

test("하나 실패하면 아직 시작 안 한 나머지는 처리되지 않고 전체가 reject된다", async () => {
  const items = Array.from({ length: 10 }, (_, i) => i);
  const started: number[] = [];
  await assert.rejects(
    () =>
      runWithConcurrencyLimit(items, 2, async (item) => {
        started.push(item);
        if (item === 0) throw new Error("boom");
        await new Promise((resolve) => setTimeout(resolve, 20));
      }),
    /boom/
  );
  assert.ok(started.length < items.length, "일부 아이템은 시작되지 않아야 함");
});
