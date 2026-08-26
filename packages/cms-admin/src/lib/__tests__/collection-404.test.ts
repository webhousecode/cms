import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROUTE = join(
  dirname(fileURLToPath(import.meta.url)),
  "..", "..", "app/api/cms/[collection]/[slug]/route.ts",
);

/**
 * An unknown COLLECTION used to answer 500 "Internal error" while an unknown
 * SLUG answered 404 — measured against production 2026-08-26:
 *
 *   200  /api/cms/sider-content/om-sanne      known collection, known slug
 *   404  /api/cms/sider-content/findes-ikke   known collection, unknown slug
 *   500  /api/cms/denne-findes-ikke/x         UNKNOWN COLLECTION  ← the bug
 *
 * The engine's getCollection() throws by design and the route caught
 * everything as a server error. Since F171 the server REPORTS its 500s, so
 * every typo, stale bookmark and crawler probe raised a false error report —
 * the noise that makes an ops surface stop being read.
 *
 * Driving the real handlers needs a live site context (registry, config,
 * storage adapter), so this pins the wiring: every verb consults the guard
 * before it can throw. The guard's own behaviour is measured against
 * production in the card's evidence.
 */
describe("unknown collection is a client error, not a server error", () => {
  const src = readFileSync(ROUTE, "utf-8");

  /**
   * A verb's body, bounded by the NEXT handler.
   *
   * The first version of this sliced a fixed 2500 characters, which read
   * straight into the following handler — so removing GET's guard left every
   * test green. A test whose window is wider than the thing it checks passes
   * on its neighbour's code. Caught by mutation-checking, which is the only
   * reason it is not still green and wrong.
   */
  const handlerBody = (verb: string): string => {
    const start = src.indexOf(`export async function ${verb}(`);
    expect(start, `${verb} handler not found — guard scanned nothing`).toBeGreaterThan(0);
    const next = src.indexOf("export async function ", start + 10);
    return src.slice(start, next === -1 ? undefined : next);
  };

  it("reads the route it thinks it reads", () => {
    // Positive control: a guard that scans nothing reports the same "all clear"
    // as one that scans everything and finds no violation.
    expect(src.length).toBeGreaterThan(2000);
    expect(src).toContain("async function collectionMissing(");
  });

  it("answers 404 with a collection-specific message, not 500", () => {
    const helper = src.slice(src.indexOf("async function collectionMissing("));
    expect(helper).toContain('"Collection not found"');
    expect(helper).toContain("status: 404");
  });

  it.each(["GET", "POST", "PATCH", "DELETE"])("%s consults the guard", (verb) => {
    expect(handlerBody(verb), `${verb} can still 500 on an unknown collection`)
      .toContain("await collectionMissing(");
  });

  // The fix must not make the system quiet: anything other than the collection
  // lookup keeps its 500 AND keeps being reported. Writing this assertion is
  // what found that PATCH — the SAVE path, where every inline edit lands — was
  // the one verb that answered 500 without reporting it at all. A failing save
  // showed the editor a red pill and left no trace anywhere an operator looks.
  it.each(["GET", "POST", "PATCH", "DELETE"])("%s still reports a genuine failure", (verb) => {
    expect(handlerBody(verb), `${verb} swallows a real error instead of reporting it`)
      .toContain("serverError(err");
  });
});
