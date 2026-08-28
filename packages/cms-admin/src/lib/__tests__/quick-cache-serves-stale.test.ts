import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * A previous answer is shown immediately, and it says how old it is.
 *
 * Christian, 28 Aug 2026: «ja, vis det gamle svar med det samme». Before this,
 * a content write DELETED the cached answer, so the next click regenerated from
 * scratch — 55 seconds on his largest site, after every single edit, with the
 * perfectly good previous answer thrown away.
 *
 * The trade he accepted has a cost, and the tests below are mostly about that
 * cost rather than about the speed: a stale answer that does not ANNOUNCE
 * itself is worse than a slow one, because someone who has just edited content
 * sees old numbers and concludes the CMS did not save their edit.
 */

let dir: string;
let cache: typeof import("../chat/quick-cache");

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "quick-cache-"));
  vi.doMock("@/lib/site-paths", () => ({ getActiveSitePaths: async () => ({ dataDir: dir }) }));
  vi.resetModules();
  cache = await import("../chat/quick-cache");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.doUnmock("@/lib/site-paths");
});

describe("peekQuick after a content write", () => {
  it("still returns the previous answer instead of nothing", async () => {
    await cache.storeQuick("site-info", "Dit site har 9 samlinger.");
    await cache.invalidateContentQuick();

    const r = await cache.peekQuick("site-info");
    expect(r.cached, "a content write threw the answer away again — this is the 55s wait").toBe(true);
    expect(r.markdown).toContain("Dit site har 9 samlinger.");
  });

  it("SAYS it is old — the whole condition of the trade", async () => {
    await cache.storeQuick("site-info", "Dit site har 9 samlinger.");
    await cache.invalidateContentQuick();

    const r = await cache.peekQuick("site-info");
    expect(r.stale).toBe(true);
    expect(r.markdown, "a stale answer is being shown as if it were current")
      .toMatch(/Vist fra hukommelsen/);
    expect(r.markdown, "the note does not say how old").toMatch(/\d+\s*(min|time)/);
  });

  it("a FRESH answer carries no note — the label must mean something", async () => {
    // Without this, appending the note unconditionally would pass every test
    // above and put "shown from memory" on answers that are current.
    await cache.storeQuick("site-info", "Dit site har 9 samlinger.");
    const r = await cache.peekQuick("site-info");
    expect(r.cached).toBe(true);
    expect(r.stale).toBeFalsy();
    expect(r.markdown).toBe("Dit site har 9 samlinger.");
  });

  it("a fresh answer CLEARS the stale mark — it must not stick", async () => {
    await cache.storeQuick("site-info", "gammelt");
    await cache.invalidateContentQuick();
    await cache.storeQuick("site-info", "nyt");

    const r = await cache.peekQuick("site-info");
    expect(r.stale, "the entry stayed marked stale after a successful regen").toBeFalsy();
    expect(r.markdown).toBe("nyt");
  });

  it("refuses to serve an answer that is too old to stand in", async () => {
    // Four minutes old is a good trade. Last week's is not "slightly behind",
    // it is wrong — and it would be shown with a note claiming it is being
    // refreshed.
    await cache.storeQuick("site-info", "meget gammelt");
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 7 * 60 * 60 * 1000); // 7h > 6h bound
    const r = await cache.peekQuick("site-info");
    expect(r.cached, "a 7-hour-old answer was served as a stand-in").toBe(false);
    expect(r.markdown).toBe("");
  });

  it("capabilities is untouched by a content write", async () => {
    // Only a deploy changes the tool list; marking it stale would put a
    // "shown from memory" note on an answer that cannot have gone stale.
    await cache.storeQuick("capabilities", "Jeg kan 65 ting.");
    await cache.invalidateContentQuick();
    const r = await cache.peekQuick("capabilities");
    expect(r.stale).toBeFalsy();
    expect(r.markdown).toBe("Jeg kan 65 ting.");
  });
});
