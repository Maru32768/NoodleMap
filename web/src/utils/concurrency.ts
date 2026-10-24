/**
 * Runs `task` on every item, at most `limit` at a time. Once `signal` aborts
 * no new task starts, and the call rejects with the signal's reason.
 */
export async function forEachConcurrently<T>(
  items: readonly T[],
  limit: number,
  signal: AbortSignal,
  task: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0;
  async function worker() {
    while (next < items.length) {
      signal.throwIfAborted();
      const index = next++;
      await task(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  signal.throwIfAborted();
}
