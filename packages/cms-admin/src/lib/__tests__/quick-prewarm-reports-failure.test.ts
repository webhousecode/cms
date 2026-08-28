import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * F158 — a pre-warm that fails must SAY which way it failed.
 *
 * Christian, 28 Aug 2026: «Site info er latterligt langsom, det er der INGEN der
 * gider vente på at se.» Measured on production: site-info took 165.2s against a
 * 180s pre-warm timeout, so the warm aborted, the cache stayed cold, and every
 * click paid the full 2m45s again. Five different failure paths all returned a
 * bare `false`, so there was nothing in any log — the only symptom a human could
 * observe was that a button was slow.
 *
 * That is the day's recurring shape: something missing degrades into something
 * that does not look missing. These tests are the layer that makes it look
 * missing. They assert the REASON, not merely that it failed — "it returned
 * false" was already true before the fix and told nobody anything.
 */

const warnings: string[] = [];
let generateQuickAnswer: (key: string, siteId: string) => Promise<boolean>;

beforeEach(async () => {
  warnings.length = 0;
  vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  });
  process.env.CMS_JWT_SECRET = "test-service-token";
  // Imported lazily so the env guard above is in place first.
  ({ generateQuickAnswer } = await import("../chat/quick-prewarm"));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const sse = (text: string) => `event: text\ndata: ${JSON.stringify({ text })}\n\n`;

describe("generateQuickAnswer names the failure", () => {
  it("a timeout says it timed out AND names the limit", async () => {
    // The exact production failure: the answer takes longer than we allow.
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => {
      const e = new Error("The operation was aborted due to timeout");
      e.name = "TimeoutError";
      return Promise.reject(e);
    }));

    expect(await generateQuickAnswer("site-info", "webhouse-site")).toBe(false);

    const line = warnings.join("\n");
    expect(line, "the warning does not identify the site and key").toContain("webhouse-site/site-info");
    expect(line, "a timeout is not reported as a timeout").toMatch(/timed out/);
    // The limit must be IN the message. "It timed out" without the number sends
    // the next reader to grep the source for a constant.
    expect(line, "the timeout message does not carry the limit").toMatch(/\d{4,}ms/);
  });

  it("a non-OK chat response reports the status code", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503, text: async () => "" }));
    expect(await generateQuickAnswer("site-info", "sanneandersen")).toBe(false);
    expect(warnings.join("\n")).toMatch(/chat responded 503/);
  });

  it("a stream with no text is distinguished from a broken request", async () => {
    // A tool-only turn caches an empty answer if nobody notices. This is NOT
    // the same failure as a 5xx, and reporting them alike is what hid the bug.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, status: 200,
      text: async () => `event: tool_call\ndata: {"tool":"site_summary"}\n\n`,
    }));
    expect(await generateQuickAnswer("site-info", "broberg-ai")).toBe(false);
    const line = warnings.join("\n");
    expect(line).toMatch(/no text/);
    expect(line, "an empty stream is being reported as a transport error").not.toMatch(/responded \d/);
  });

  it("a failing STORE is not reported as a failing chat", async () => {
    // The answer was generated — the money was already spent. Losing it at the
    // last step is the most expensive failure of the five and was the least
    // visible.
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => sse("Dit site har 9 samlinger.") })
      .mockResolvedValueOnce({ ok: false, status: 500 });
    vi.stubGlobal("fetch", fetchMock);
    expect(await generateQuickAnswer("site-info", "webhouse-site")).toBe(false);
    expect(warnings.join("\n")).toMatch(/store responded 500/);
  });

  it("SUCCESS stays silent and returns true — the guard must not cry wolf", async () => {
    // Without this, "log on every path" would pass every test above while
    // making the log useless.
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => sse("Dit site har 9 samlinger.") })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    expect(await generateQuickAnswer("site-info", "webhouse-site")).toBe(true);
    expect(warnings, `expected no warnings, got: ${warnings.join(" | ")}`).toHaveLength(0);
  });
});
