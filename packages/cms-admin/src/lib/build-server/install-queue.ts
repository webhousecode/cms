/**
 * F143 P3 — Install queue.
 *
 * Process-wide mutex serialising concurrent `pnpm install` calls
 * targeting the deps-store on the same volume. Two reasons:
 *
 *   1. pnpm's content-addressable store can corrupt under highly-
 *      concurrent writes (rare but observed under stress).
 *   2. Per-deps-set installs are fast enough (<60s typical) that
 *      serialising them removes a class of race conditions without
 *      hurting throughput.
 *
 * Per-hash dedup: if site A and site B both trigger an install for
 * the same hash simultaneously, the second call awaits the first's
 * result instead of re-running. Saves one full pnpm install round-trip.
 *
 * Module-level Map. Lives for the lifetime of the cms-admin process,
 * which is fine — no cross-process coordination needed because only
 * one cms-admin runs per Fly machine.
 */

type Job<T> = () => Promise<T>;

/**
 * Single global serial queue + in-flight dedup map.
 * We use a chain-of-promises pattern instead of a worker pool because
 * pnpm install is the bottleneck (CPU + network) and parallelising
 * doesn't speed up multi-package installs into the same store.
 */
let chainTail: Promise<unknown> = Promise.resolve();
const inFlight = new Map<string, Promise<unknown>>();

/**
 * Run `job` after all previously-queued installs complete. If another
 * call already has a job in flight for the same `dedupKey`, return
 * that one's promise instead of re-queueing.
 *
 * `dedupKey` should typically be the deps-set hash so two concurrent
 * site-deploys with identical deps share one install.
 */
export async function runInInstallQueue<T>(dedupKey: string, job: Job<T>): Promise<T> {
  // Empty dedupKey = run-once thing (no dedup desired); always queue.
  if (dedupKey) {
    const existing = inFlight.get(dedupKey);
    if (existing) return existing as Promise<T>;
  }

  const next: Promise<T> = chainTail.then(job, job);
  chainTail = next.catch(() => undefined);

  if (dedupKey) {
    inFlight.set(dedupKey, next);
    // Attach cleanup as TWO non-throwing callbacks instead of .finally().
    // .finally() forwards rejections — we'd leak an unhandled rejection
    // for failing jobs even though the caller already awaits and handles
    // the rejection on `next`. Plain (resolve, reject) handlers that
    // both return void don't forward.
    const clearInFlight = () => {
      // Only clear if WE are still the in-flight job for this key — a
      // later queue entry may have replaced us between resolve and
      // cleanup (rare, but defensive).
      if (inFlight.get(dedupKey) === next) inFlight.delete(dedupKey);
    };
    next.then(clearInFlight, clearInFlight);
  }

  return next;
}

/**
 * Test-only escape hatch — wait for the queue to drain, useful for
 * test isolation. Not exported in the production path.
 */
export async function _drainQueueForTest(): Promise<void> {
  await chainTail;
  await Promise.all(inFlight.values());
}
