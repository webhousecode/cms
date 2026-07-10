/**
 * @broberg/cms-chat-client tests. Run: cd packages/cms-chat-client && npx vitest run
 */
import { describe, it, expect } from "vitest";
import { peekQuickAction, warmQuickAction, QUICK_ACTION_KEYS } from "./index";

type StubResult = { ok: boolean; json?: () => Promise<unknown> };

/** A fetch stub that records calls and returns a scripted response (or rejects). */
function stubFetch(impl: (url: string, init?: RequestInit) => StubResult | Promise<never>) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetchImpl = ((url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(impl(url, init)) as Promise<Response>;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

/** Last recorded call, asserted present. */
function lastCall(calls: Array<{ url: string; init: RequestInit | undefined }>) {
  const c = calls[calls.length - 1];
  expect(c).toBeDefined();
  return c!;
}

describe("peekQuickAction", () => {
  it("returns the warm answer on a cache hit", async () => {
    const { fetchImpl } = stubFetch(() => ({
      ok: true,
      json: async () => ({ cached: true, markdown: "# Overblik", cachedAt: 123 }),
    }));
    const r = await peekQuickAction("overview", { fetchImpl });
    expect(r).toEqual({ cached: true, markdown: "# Overblik", cachedAt: 123 });
  });

  it("returns cached:false on a cold miss", async () => {
    const { fetchImpl } = stubFetch(() => ({ ok: true, json: async () => ({ cached: false }) }));
    const r = await peekQuickAction("drafts", { fetchImpl });
    expect(r).toEqual({ cached: false, markdown: "", cachedAt: 0 });
  });

  it("returns cached:false on a non-OK response (401/404)", async () => {
    const { fetchImpl } = stubFetch(() => ({ ok: false }));
    const r = await peekQuickAction("capabilities", { fetchImpl });
    expect(r.cached).toBe(false);
  });

  it("returns cached:false (never throws) on a network error", async () => {
    const { fetchImpl } = stubFetch(() => Promise.reject(new Error("offline")));
    const r = await peekQuickAction("site-info", { fetchImpl });
    expect(r).toEqual({ cached: false, markdown: "", cachedAt: 0 });
  });

  it("builds the default same-origin URL and passes headers", async () => {
    const { fetchImpl, calls } = stubFetch(() => ({ ok: true, json: async () => ({ cached: false }) }));
    await peekQuickAction("overview", { headers: { Authorization: "Bearer x" }, fetchImpl });
    const c = lastCall(calls);
    expect(c.url).toBe("/api/cms/chat/quick/overview");
    expect((c.init?.headers as Record<string, string>).Authorization).toBe("Bearer x");
  });

  it("honors baseUrl, a relay path override, and the site query", async () => {
    const { fetchImpl, calls } = stubFetch(() => ({ ok: true, json: async () => ({ cached: false }) }));
    await peekQuickAction("drafts", {
      baseUrl: "https://webhouse.app",
      path: "/api/admin/chat/quick/:key",
      siteId: "broberg-ai",
      fetchImpl,
    });
    expect(lastCall(calls).url).toBe("https://webhouse.app/api/admin/chat/quick/drafts?site=broberg-ai");
  });
});

describe("warmQuickAction", () => {
  it("no-ops (no fetch) on empty markdown", async () => {
    const { fetchImpl, calls } = stubFetch(() => ({ ok: true }));
    const ok = await warmQuickAction("overview", "   ", { fetchImpl });
    expect(ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("POSTs the markdown and returns ok", async () => {
    const { fetchImpl, calls } = stubFetch(() => ({ ok: true }));
    const ok = await warmQuickAction("overview", "# Answer", { siteId: "s1", fetchImpl });
    expect(ok).toBe(true);
    const c = lastCall(calls);
    expect(c.url).toBe("/api/cms/chat/quick/overview?site=s1");
    expect(c.init?.method).toBe("POST");
    expect(JSON.parse(c.init?.body as string)).toEqual({ markdown: "# Answer" });
    expect((c.init?.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("returns false (never throws) on a network error", async () => {
    const { fetchImpl } = stubFetch(() => Promise.reject(new Error("offline")));
    expect(await warmQuickAction("overview", "# x", { fetchImpl })).toBe(false);
  });
});

describe("QUICK_ACTION_KEYS", () => {
  it("matches the server's cacheable keys", () => {
    expect([...QUICK_ACTION_KEYS]).toEqual(["overview", "drafts", "site-info", "capabilities"]);
  });
});
