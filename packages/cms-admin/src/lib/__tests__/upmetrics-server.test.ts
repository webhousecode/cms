import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * F171 — until 25 Aug 2026 the SDK was initialised only in a client component,
 * so cms-admin reported browser errors and nothing at all from the server.
 * These pin the two things that make the fix real rather than nominal: that it
 * actually initialises, and that the events can be told apart from the browser
 * half.
 */
const calls: { init: unknown[]; tags: [string, string][]; captured: unknown[] } = {
  init: [], tags: [], captured: [],
};

vi.mock("@upmetrics/sdk", () => ({
  init: (o: unknown) => { calls.init.push(o); },
  setTag: (k: string, v: string) => { calls.tags.push([k, v]); },
  captureException: (e: unknown, ctx?: unknown) => { calls.captured.push({ e, ctx }); return "id"; },
}));

async function fresh() {
  vi.resetModules();
  calls.init = []; calls.tags = []; calls.captured = [];
  return import("../upmetrics-server");
}

const ENV = { ...process.env };
beforeEach(() => {
  process.env = { ...ENV };
  delete process.env.UPMETRICS_DSN;
  delete process.env.NEXT_PUBLIC_UPMETRICS_DSN;
  delete process.env.GIT_SHA;
});

describe("initServerReporting", () => {
  it("initialises when a DSN is present", async () => {
    process.env.UPMETRICS_DSN = "https://key@upmetrics.org/1";
    const m = await fresh();
    expect(m.initServerReporting()).toBe(true);
    expect(calls.init).toHaveLength(1);
  });

  // Ship dark: a missing key must not crash boot, and must not pretend to work.
  it("stays off — without crashing — when there is no DSN", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const m = await fresh();
    expect(m.initServerReporting()).toBe(false);
    expect(calls.init).toHaveLength(0);
    expect(warn).toHaveBeenCalled();   // silent-and-unmonitored is the failure to avoid
    warn.mockRestore();
  });

  it("falls back to the browser variable, so an old machine still reports", async () => {
    process.env.NEXT_PUBLIC_UPMETRICS_DSN = "https://key@upmetrics.org/1";
    const m = await fresh();
    expect(m.initServerReporting()).toBe(true);
  });

  // The whole point of the fingerprint: `release: "cms-admin"` on every event
  // is what said "this project only reports from the browser".
  it("tags the release with the git sha, not a constant", async () => {
    process.env.UPMETRICS_DSN = "https://key@upmetrics.org/1";
    process.env.GIT_SHA = "abc1234";
    const m = await fresh();
    m.initServerReporting();
    expect((calls.init[0] as { release: string }).release).toBe("abc1234");
    expect((calls.init[0] as { release: string }).release).not.toBe("cms-admin");
  });

  it("marks the runtime, so server and browser do not add up to one number", async () => {
    process.env.UPMETRICS_DSN = "https://key@upmetrics.org/1";
    const m = await fresh();
    m.initServerReporting();
    expect(calls.tags).toContainEqual(["runtime", "server"]);
  });

  it("initialises once, however many times it is called", async () => {
    process.env.UPMETRICS_DSN = "https://key@upmetrics.org/1";
    const m = await fresh();
    m.initServerReporting();
    m.initServerReporting();
    m.initServerReporting();
    expect(calls.init).toHaveLength(1);
  });
});

describe("captureServerError", () => {
  it("reports, initialising itself if boot has not", async () => {
    process.env.UPMETRICS_DSN = "https://key@upmetrics.org/1";
    const m = await fresh();
    m.captureServerError(new Error("boom"), { path: "/api/x" });
    expect(calls.init).toHaveLength(1);
    expect(calls.captured).toHaveLength(1);
  });

  it("is a no-op with no DSN — reporting an error must never become an error", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const m = await fresh();
    expect(() => m.captureServerError(new Error("boom"))).not.toThrow();
    expect(calls.captured).toHaveLength(0);
  });
});

/**
 * The second door. An error thrown inside a route handler is caught by Next
 * and turned into a 500 — it never reaches `uncaughtException`, so the SDK's
 * own process handlers cannot see it. Without this hook, "server reporting is
 * on" would still miss the errors that actually reach a user.
 */
describe("onRequestError", () => {
  it("reports a route-handler error", async () => {
    process.env.UPMETRICS_DSN = "https://key@upmetrics.org/1";
    process.env.NEXT_RUNTIME = "nodejs";
    vi.resetModules();
    calls.init = []; calls.tags = []; calls.captured = [];
    const { onRequestError } = await import("../../instrumentation");
    await onRequestError(new Error("boom"), { path: "/api/cms/pages/x", method: "PATCH" }, { routeType: "route" });
    expect(calls.captured).toHaveLength(1);
  });

  // The query string carries `?site=` and, on the inline-edit routes, a token.
  // An error report is not a place to put a credential.
  it("keeps the path and drops the query string", async () => {
    process.env.UPMETRICS_DSN = "https://key@upmetrics.org/1";
    process.env.NEXT_RUNTIME = "nodejs";
    vi.resetModules();
    calls.init = []; calls.captured = [];
    const { onRequestError } = await import("../../instrumentation");
    await onRequestError(
      new Error("boom"),
      { path: "/api/inline-edit/token?site=webhouse-site&cms_edit=SECRET", method: "POST" },
      {},
    );
    const ctx = (calls.captured[0] as { ctx: { path: string } }).ctx;
    expect(ctx.path).toBe("/api/inline-edit/token");
    expect(JSON.stringify(calls.captured)).not.toContain("SECRET");
  });

  it("does nothing on the edge runtime, where the SDK is not initialised", async () => {
    process.env.UPMETRICS_DSN = "https://key@upmetrics.org/1";
    process.env.NEXT_RUNTIME = "edge";
    vi.resetModules();
    calls.captured = [];
    const { onRequestError } = await import("../../instrumentation");
    await onRequestError(new Error("boom"), { path: "/x" }, {});
    expect(calls.captured).toHaveLength(0);
  });
});

/**
 * The gap `onRequestError` alone leaves. 137 places across 108 files catch
 * their own error and return a 500 — Next never sees those, so the hook cannot
 * either. Measured on production 25 Aug 2026: a forced 500 produced no issue
 * at all, because the route swallowed its own error.
 */
describe("serverError", () => {
  it("reports the error AND still answers 500", async () => {
    process.env.UPMETRICS_DSN = "https://key@upmetrics.org/1";
    const m = await fresh();
    const res = m.serverError(new Error("boom"), { route: "GET /api/x" });
    expect(res.status).toBe(500);
    expect(calls.captured).toHaveLength(1);
    expect((calls.captured[0] as { ctx: { route: string } }).ctx.route).toBe("GET /api/x");
  });

  it("keeps the caller's headers — dropping CORS here would break the browser save", async () => {
    process.env.UPMETRICS_DSN = "https://key@upmetrics.org/1";
    const m = await fresh();
    const res = m.serverError(new Error("boom"), {}, { headers: { "access-control-allow-origin": "https://www.webhouse.dk" } });
    expect(res.headers.get("access-control-allow-origin")).toBe("https://www.webhouse.dk");
    expect(res.status).toBe(500);
  });

  it("still answers 500 when reporting is off", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const m = await fresh();
    const res = m.serverError(new Error("boom"));
    expect(res.status).toBe(500);
    expect(calls.captured).toHaveLength(0);
  });
});
