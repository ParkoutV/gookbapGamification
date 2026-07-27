export async function runWithConcurrencyLimit<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let nextIndex = 0;
  let aborted = false;
  let firstError: unknown = null;

  async function runNext(): Promise<void> {
    if (aborted) return;
    const current = nextIndex++;
    if (current >= items.length) return;

    try {
      await worker(items[current]);
    } catch (err) {
      if (!aborted) {
        aborted = true;
        firstError = err;
      }
      return;
    }

    await runNext();
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runNext()));

  if (aborted) {
    throw firstError;
  }
}
