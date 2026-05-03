/**
 * F144 P6 — smokeTestImage tests.
 */
import { describe, it, expect } from "vitest";
import { smokeTestImage } from "../build-orchestrator/smoke-test";

describe("smokeTestImage", () => {
  it("returns healthy after requiredOk consecutive 200s", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response("ok", { status: 200 });
    }) as typeof fetch;

    const result = await smokeTestImage({
      url: "http://x",
      pollIntervalMs: 1,
      requiredOk: 3,
      requestTimeoutMs: 100,
      budgetMs: 1000,
      fetchImpl,
    });

    expect(result.healthy).toBe(true);
    expect(result.attempts).toBe(3);
    expect(result.okStreak).toBe(3);
    expect(result.lastStatus).toBe(200);
    expect(calls).toBe(3);
  });

  it("resets streak on non-2xx", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      // OK, OK, 503, OK, OK, OK → healthy after 6 calls
      const map = [200, 200, 503, 200, 200, 200];
      return new Response("x", { status: map[calls - 1] ?? 200 });
    }) as typeof fetch;

    const result = await smokeTestImage({
      url: "http://x",
      pollIntervalMs: 1,
      requiredOk: 3,
      requestTimeoutMs: 100,
      budgetMs: 1000,
      fetchImpl,
    });

    expect(result.healthy).toBe(true);
    expect(calls).toBeGreaterThanOrEqual(6);
  });

  it("returns unhealthy when budget elapses without enough successes", async () => {
    const fetchImpl = (async () => new Response("x", { status: 503 })) as typeof fetch;
    const result = await smokeTestImage({
      url: "http://x",
      pollIntervalMs: 5,
      requiredOk: 3,
      requestTimeoutMs: 50,
      budgetMs: 50,
      fetchImpl,
    });
    expect(result.healthy).toBe(false);
    expect(result.lastStatus).toBe(503);
    expect(result.okStreak).toBeLessThan(3);
  });

  it("treats network errors as failures (resets streak, captures lastError)", async () => {
    const fetchImpl = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;

    const result = await smokeTestImage({
      url: "http://nope",
      pollIntervalMs: 5,
      requiredOk: 1,
      requestTimeoutMs: 50,
      budgetMs: 30,
      fetchImpl,
    });

    expect(result.healthy).toBe(false);
    expect(result.lastError).toMatch(/ECONNREFUSED/);
    expect(result.lastStatus).toBe(0);
  });

  it("emits onLog callback per attempt", async () => {
    const lines: string[] = [];
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response("ok", { status: 200 });
    }) as typeof fetch;

    await smokeTestImage({
      url: "http://x",
      pollIntervalMs: 1,
      requiredOk: 2,
      requestTimeoutMs: 50,
      budgetMs: 1000,
      fetchImpl,
      onLog: (l) => lines.push(l),
    });

    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines[0]).toMatch(/ok 200/);
  });
});
