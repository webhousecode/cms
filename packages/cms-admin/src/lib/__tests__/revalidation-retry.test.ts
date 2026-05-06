/**
 * ICD reliability tests — retry chain + Discord alert.
 *
 * Covers the post-2026-05-06 behavior:
 *   - Sync attempt always runs first; result returned immediately.
 *   - Failure schedules async retries via injected scheduler.
 *   - All-fail outcome dispatches Discord alert (when site config has
 *     schedulerNotifications + schedulerWebhookUrl).
 *   - Test ping (syncOnly) skips retries entirely.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let tmpData = "";

vi.mock("../site-paths", () => ({
  getActiveSitePaths: async () => ({
    dataDir: tmpData,
    projectDir: tmpData,
    contentDir: path.join(tmpData, "content"),
    configPath: path.join(tmpData, "cms.config.ts"),
    uploadDir: path.join(tmpData, "uploads"),
    previewUrl: "",
  }),
}));

// Per-test mock for site-config (controls whether alerts fire).
let mockSiteConfig: { schedulerWebhookUrl: string; schedulerNotifications: boolean } = {
  schedulerWebhookUrl: "",
  schedulerNotifications: false,
};
vi.mock("../site-config", () => ({
  readSiteConfig: async () => mockSiteConfig,
}));

import { dispatchRevalidation, sendTestPing } from "../revalidation";

beforeEach(() => {
  tmpData = mkdtempSync(path.join(tmpdir(), "revalidation-retry-test-"));
  mockSiteConfig = { schedulerWebhookUrl: "", schedulerNotifications: false };
});

afterEach(() => {
  if (tmpData && existsSync(tmpData)) rmSync(tmpData, { recursive: true, force: true });
});

const SITE = {
  id: "test-site",
  name: "test-site.fly.dev",
  revalidateUrl: "https://test-site.fly.dev/api/revalidate",
  revalidateSecret: "deadbeef",
};

const PAYLOAD = {
  collection: "posts" as const,
  slug: "hello",
  action: "published" as const,
  document: { title: "Hello" },
};

function fetchOk(): typeof fetch {
  return vi.fn(async () => new Response("ok", { status: 200 })) as unknown as typeof fetch;
}

function fetchFail(status = 503): typeof fetch {
  return vi.fn(async () => new Response("fail", { status })) as unknown as typeof fetch;
}

function fetchSequence(...statuses: number[]): { fn: typeof fetch; calls: () => number } {
  let i = 0;
  const fn = vi.fn(async () => {
    const status = statuses[Math.min(i, statuses.length - 1)]!;
    i++;
    return new Response("seq", { status });
  }) as unknown as typeof fetch;
  return { fn, calls: () => i };
}

/**
 * Synchronous scheduler — runs the callback IMMEDIATELY instead of
 * waiting `ms`. We rely on Node's microtask queue + flushPromises to
 * collapse the entire retry chain into the awaited expression below.
 */
function instantScheduler(): { schedule: (ms: number, fn: () => void) => void; calls: number[] } {
  const calls: number[] = [];
  const schedule = (ms: number, fn: () => void) => {
    calls.push(ms);
    setImmediate(fn);
  };
  return { schedule, calls };
}

async function flushPromises(): Promise<void> {
  // Drain pending promise + setImmediate callbacks. The retry chain
  // includes fs operations (log writes) which need real settling time
  // beyond microtask-only flushing.
  await new Promise((r) => setTimeout(r, 100));
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setImmediate(r));
  }
  await new Promise((r) => setTimeout(r, 50));
}

describe("dispatchRevalidation — sync attempt", () => {
  it("returns immediately on 200 success without scheduling retries", async () => {
    const sched = instantScheduler();
    const result = await dispatchRevalidation(SITE, PAYLOAD, undefined, {
      fetchImpl: fetchOk(),
      scheduleAfter: sched.schedule,
    });
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(sched.calls).toEqual([]);
  });

  it("returns immediately on 503 failure and schedules retries", async () => {
    const sched = instantScheduler();
    const result = await dispatchRevalidation(SITE, PAYLOAD, undefined, {
      fetchImpl: fetchFail(503),
      retryDelaysMs: [10, 20, 30],
      scheduleAfter: sched.schedule,
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(503);
    // Three retry delays scheduled (sync result returned BEFORE retries fire)
    await flushPromises();
    expect(sched.calls).toEqual([10, 20, 30]);
  });

  it("skips dispatch entirely when revalidateUrl is empty", async () => {
    const fetchSpy = vi.fn();
    const result = await dispatchRevalidation(
      { id: "no-url" },
      PAYLOAD,
      undefined,
      { fetchImpl: fetchSpy as unknown as typeof fetch },
    );
    expect(result.ok).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("dispatchRevalidation — async retry chain", () => {
  it("stops retrying as soon as one retry succeeds", async () => {
    const seq = fetchSequence(503, 503, 200);
    const sched = instantScheduler();
    const alertSpy = vi.fn();
    mockSiteConfig = { schedulerWebhookUrl: "https://discord/webhook", schedulerNotifications: true };

    // Wrap fetch so the alert webhook (if it ever fires) hits alertSpy.
    const fetchImpl: typeof fetch = vi.fn(async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : (input as URL).toString();
      if (url.includes("discord")) {
        alertSpy(url, init);
        return new Response("", { status: 200 });
      }
      return seq.fn(input, init);
    }) as unknown as typeof fetch;

    await dispatchRevalidation(SITE, PAYLOAD, undefined, {
      fetchImpl,
      retryDelaysMs: [5, 10, 20],
      scheduleAfter: sched.schedule,
    });

    await flushPromises();

    // Sync(503) + retry1(503) + retry2(200) = 3 site calls total
    expect(seq.calls()).toBe(3);
    // Two retries scheduled (third would have fired only after retry2 failed)
    expect(sched.calls).toEqual([5, 10]);
    // Alert NOT fired because retry2 succeeded
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("fires Discord alert after all retries exhausted", async () => {
    const sched = instantScheduler();
    const alertSpy = vi.fn();
    mockSiteConfig = { schedulerWebhookUrl: "https://discord/webhook", schedulerNotifications: true };

    const fetchImpl: typeof fetch = vi.fn(async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : (input as URL).toString();
      if (url.includes("discord")) {
        alertSpy(url, init);
        return new Response("", { status: 200 });
      }
      // Site always fails
      return new Response("fail", { status: 503 });
    }) as unknown as typeof fetch;

    await dispatchRevalidation(SITE, PAYLOAD, undefined, {
      fetchImpl,
      retryDelaysMs: [5, 10, 20],
      scheduleAfter: sched.schedule,
    });

    await flushPromises();

    expect(sched.calls).toEqual([5, 10, 20]);
    expect(alertSpy).toHaveBeenCalledTimes(1);
    const [_url, init] = alertSpy.mock.calls[0]!;
    const body = JSON.parse(init.body);
    expect(body.content).toContain("ICD revalidation failed");
    expect(body.content).toContain("test-site.fly.dev");
    expect(body.content).toContain("posts");
    expect(body.content).toContain("hello");
    expect(body.content).toContain("Attempts: 4");
  });

  it("does NOT fire alert when schedulerNotifications is disabled", async () => {
    const sched = instantScheduler();
    const alertSpy = vi.fn();
    mockSiteConfig = { schedulerWebhookUrl: "https://discord/webhook", schedulerNotifications: false };

    const fetchImpl: typeof fetch = vi.fn(async (input: any) => {
      const url = typeof input === "string" ? input : (input as URL).toString();
      if (url.includes("discord")) { alertSpy(); return new Response("", { status: 200 }); }
      return new Response("fail", { status: 503 });
    }) as unknown as typeof fetch;

    await dispatchRevalidation(SITE, PAYLOAD, undefined, {
      fetchImpl,
      retryDelaysMs: [5, 10, 20],
      scheduleAfter: sched.schedule,
    });

    await flushPromises();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("does NOT fire alert when schedulerWebhookUrl is empty", async () => {
    const sched = instantScheduler();
    const alertSpy = vi.fn();
    mockSiteConfig = { schedulerWebhookUrl: "", schedulerNotifications: true };

    const fetchImpl: typeof fetch = vi.fn(async (input: any) => {
      const url = typeof input === "string" ? input : (input as URL).toString();
      if (url.includes("discord")) { alertSpy(); return new Response("", { status: 200 }); }
      return new Response("fail", { status: 503 });
    }) as unknown as typeof fetch;

    await dispatchRevalidation(SITE, PAYLOAD, undefined, {
      fetchImpl,
      retryDelaysMs: [5, 10, 20],
      scheduleAfter: sched.schedule,
    });

    await flushPromises();
    expect(alertSpy).not.toHaveBeenCalled();
  });
});

describe("dispatchRevalidation — log entries", () => {
  it("logs the sync attempt with attempt=1 even on success", async () => {
    await dispatchRevalidation(SITE, PAYLOAD, undefined, {
      fetchImpl: fetchOk(),
      scheduleAfter: instantScheduler().schedule,
    });
    await flushPromises();

    const { readRevalidationLog } = await import("../revalidation");
    const log = await readRevalidationLog();
    expect(log).toHaveLength(1);
    expect(log[0]?.attempt).toBe(1);
    expect(log[0]?.ok).toBe(true);
  });

  it("logs every retry attempt with incrementing attempt counter", async () => {
    const seq = fetchSequence(503, 503, 200);
    const sched = instantScheduler();

    await dispatchRevalidation(SITE, PAYLOAD, undefined, {
      fetchImpl: seq.fn,
      retryDelaysMs: [5, 10],
      scheduleAfter: sched.schedule,
    });
    await flushPromises();

    const { readRevalidationLog } = await import("../revalidation");
    const log = await readRevalidationLog();
    // 3 entries: sync(fail), retry1(fail), retry2(success). Newest first.
    expect(log).toHaveLength(3);
    expect(log[0]?.attempt).toBe(3);
    expect(log[0]?.ok).toBe(true);
    expect(log[1]?.attempt).toBe(2);
    expect(log[1]?.ok).toBe(false);
    expect(log[2]?.attempt).toBe(1);
    expect(log[2]?.ok).toBe(false);
  });
});

describe("sendTestPing — syncOnly path", () => {
  it("does not schedule retries even on failure", async () => {
    // Install a global fetch since sendTestPing doesn't accept fetchImpl.
    // We restore after the test.
    const origFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => { calls++; return new Response("fail", { status: 500 }); }) as typeof fetch;

    try {
      const result = await sendTestPing(SITE);
      expect(result.ok).toBe(false);
      // Wait long enough that retries WOULD have fired if scheduled
      await new Promise((r) => setTimeout(r, 50));
      expect(calls).toBe(1);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
