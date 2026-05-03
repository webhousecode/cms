/**
 * F143 P3 — install-queue dedup + serialization tests.
 *
 * The queue's two guarantees:
 *
 *   1. Serialisation: jobs run one at a time, in the order they were
 *      enqueued. A slow job blocks subsequent jobs from starting.
 *   2. Per-key dedup: two enqueue calls with the same dedupKey share
 *      one promise (the second returns the in-flight promise instead
 *      of running again).
 *
 * Real installer tests would need pnpm + filesystem. These tests use
 * synthetic jobs to verify the queue's invariants.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  runInInstallQueue,
  _drainQueueForTest,
} from "../build-server/install-queue";

beforeEach(async () => {
  await _drainQueueForTest();
});

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe("runInInstallQueue", () => {
  it("runs a single job and returns its result", async () => {
    const result = await runInInstallQueue("hash-a", async () => 42);
    expect(result).toBe(42);
  });

  it("serialises two jobs — second starts only after first completes", async () => {
    const order: string[] = [];
    const a = runInInstallQueue("hash-a", async () => {
      order.push("a-start");
      await delay(20);
      order.push("a-end");
      return "A";
    });
    const b = runInInstallQueue("hash-b", async () => {
      order.push("b-start");
      await delay(5);
      order.push("b-end");
      return "B";
    });
    const [resA, resB] = await Promise.all([a, b]);
    expect(resA).toBe("A");
    expect(resB).toBe("B");
    // a-start and a-end must both come before b-start
    expect(order).toEqual(["a-start", "a-end", "b-start", "b-end"]);
  });

  it("dedupes two concurrent calls with same key (second gets first's promise)", async () => {
    let runCount = 0;
    const job = async () => {
      runCount++;
      await delay(10);
      return runCount;
    };
    const a = runInInstallQueue("same-hash", job);
    const b = runInInstallQueue("same-hash", job);
    const [resA, resB] = await Promise.all([a, b]);
    // Both should resolve to the same value (first call's result)
    expect(resA).toBe(resB);
    // Only one execution
    expect(runCount).toBe(1);
  });

  it("does NOT dedupe calls with different keys", async () => {
    let runs = 0;
    const job = async () => {
      runs++;
      await delay(5);
      return runs;
    };
    await Promise.all([
      runInInstallQueue("k1", job),
      runInInstallQueue("k2", job),
      runInInstallQueue("k3", job),
    ]);
    expect(runs).toBe(3);
  });

  it("does NOT dedupe when dedupKey is empty string (always queues)", async () => {
    let runs = 0;
    await Promise.all([
      runInInstallQueue("", async () => { runs++; await delay(5); }),
      runInInstallQueue("", async () => { runs++; await delay(5); }),
    ]);
    expect(runs).toBe(2);
  });

  it("clears in-flight entry after completion (next call re-runs)", async () => {
    let runs = 0;
    const job = async () => {
      runs++;
      return runs;
    };
    const r1 = await runInInstallQueue("hash-x", job);
    expect(r1).toBe(1);
    const r2 = await runInInstallQueue("hash-x", job);
    expect(r2).toBe(2); // second call is a fresh run, not deduped
  });

  it("a failing job does not block subsequent queue entries", async () => {
    const a = runInInstallQueue("hash-fail", async () => {
      throw new Error("boom");
    });
    const b = runInInstallQueue("hash-ok", async () => "ok");
    await expect(a).rejects.toThrow("boom");
    await expect(b).resolves.toBe("ok");
  });

  it("a failing job clears its in-flight slot so retries are possible", async () => {
    let runs = 0;
    const fail = async () => {
      runs++;
      throw new Error("transient");
    };
    await expect(runInInstallQueue("retry-key", fail)).rejects.toThrow();
    await expect(runInInstallQueue("retry-key", fail)).rejects.toThrow();
    expect(runs).toBe(2); // second call WAS a fresh run, not the cached failure
  });
});
