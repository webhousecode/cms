/**
 * F143 P3 — deps-store hash + normalization tests.
 *
 * Lock down the determinism guarantees other modules rely on:
 *
 *   - normalizeDeps is order-independent + dedupes + lowercases names
 *     + drops core deps (already provided by cms-admin)
 *   - hashDeps is stable across runs + sensitive to the FULL spec
 *     (including version), so a manual version bump always allocates
 *     a fresh deps-store dir
 *   - resolveDepsStoreDir + resolveDepsNodeModulesPath compose paths
 *     correctly relative to dataDir
 */
import { describe, it, expect } from "vitest";
import {
  normalizeDeps,
  hashDeps,
  resolveDepsStoreDir,
  resolveDepsNodeModulesPath,
} from "../build-server/deps-store";

describe("normalizeDeps", () => {
  it("returns empty list for empty input", () => {
    expect(normalizeDeps([])).toEqual([]);
  });

  it("dedupes exact duplicates", () => {
    expect(normalizeDeps(["lodash", "lodash"])).toEqual(["lodash"]);
  });

  it("sorts lexically for stable hashing", () => {
    expect(normalizeDeps(["zod", "axios", "lodash"])).toEqual([
      "axios",
      "lodash",
      "zod",
    ]);
  });

  it("strips whitespace from each entry", () => {
    expect(normalizeDeps(["  lodash  ", "\taxios\n"])).toEqual([
      "axios",
      "lodash",
    ]);
  });

  it("drops empty / whitespace-only entries", () => {
    expect(normalizeDeps(["lodash", "", "   ", "axios"])).toEqual([
      "axios",
      "lodash",
    ]);
  });

  it("drops deps already provided by cms-admin's core pulje", () => {
    // marked, sharp, gray-matter, slugify, marked-highlight + @webhouse/cms
    // are pre-installed → no need to add them to a build-deps store
    expect(
      normalizeDeps(["marked", "lodash", "sharp", "axios", "@webhouse/cms"]),
    ).toEqual(["axios", "lodash"]);
  });

  it("lowercases the package name but preserves version-range case", () => {
    // npm names are case-insensitive but conventionally lowercase.
    // Version ranges may contain case-sensitive git refs, so leave alone.
    expect(normalizeDeps(["LoDaSh@^4.17.21", "Three@latest"])).toEqual([
      "lodash@^4.17.21",
      "three@latest",
    ]);
  });

  it("treats different versions of the same package as distinct entries", () => {
    expect(normalizeDeps(["lodash@4.17.21", "lodash@4.17.22"])).toEqual([
      "lodash@4.17.21",
      "lodash@4.17.22",
    ]);
  });

  it("handles scoped packages with version specifiers", () => {
    expect(normalizeDeps(["@scope/pkg@^1.0.0", "@scope/other"])).toEqual([
      "@scope/other",
      "@scope/pkg@^1.0.0",
    ]);
  });

  it("does not match scoped name on prefix collision with provided dep", () => {
    // "@webhouse/cms" is provided; "@webhouse/cms-shop" is NOT.
    // The classifier in isProvidedBuildDep handles this correctly.
    expect(normalizeDeps(["@webhouse/cms-shop"])).toEqual([
      "@webhouse/cms-shop",
    ]);
  });
});

describe("hashDeps", () => {
  it("returns empty string for empty deps (sentinel for skip)", () => {
    expect(hashDeps([])).toBe("");
    expect(hashDeps(["", "  "])).toBe("");
    expect(hashDeps(["marked", "@webhouse/cms"])).toBe(""); // both provided → empty after normalize
  });

  it("returns a stable 16-char hex hash for non-empty deps", () => {
    const h = hashDeps(["lodash"]);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is order-independent (matches normalizeDeps's sort)", () => {
    const a = hashDeps(["zod", "axios", "lodash"]);
    const b = hashDeps(["lodash", "axios", "zod"]);
    const c = hashDeps(["axios", "lodash", "zod"]);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("changes when version specifier changes (so a bump = fresh dir)", () => {
    const v1 = hashDeps(["lodash@4.17.21"]);
    const v2 = hashDeps(["lodash@4.17.22"]);
    expect(v1).not.toBe(v2);
  });

  it("differs from 'lodash' alone vs 'lodash@latest'", () => {
    // These declare different intent; user said `latest` explicitly so
    // they get their own dir even if `latest` resolves to the same
    // version. Avoids confusion when user later pins to a specific
    // version — they'd get a 3rd dir, all visible.
    const noVer = hashDeps(["lodash"]);
    const latest = hashDeps(["lodash@latest"]);
    expect(noVer).not.toBe(latest);
  });

  it("ignores duplicate entries (dedup happens before hash)", () => {
    expect(hashDeps(["lodash", "lodash", "axios"])).toBe(hashDeps(["lodash", "axios"]));
  });

  it("ignores core-provided deps when hashing (dropping them in normalize)", () => {
    // Adding `marked` shouldn't change the hash since it's filtered out
    expect(hashDeps(["lodash"])).toBe(hashDeps(["lodash", "marked"]));
    expect(hashDeps(["lodash", "marked"])).toBe(hashDeps(["lodash", "@webhouse/cms"]));
  });
});

describe("resolveDepsStoreDir + resolveDepsNodeModulesPath", () => {
  it("returns null for empty hash (sentinel)", () => {
    expect(resolveDepsStoreDir("/data/cms-admin", "")).toBeNull();
    expect(resolveDepsNodeModulesPath("/data/cms-admin", "")).toBeNull();
  });

  it("composes path under dataDir/build-deps/<hash>/", () => {
    const dir = resolveDepsStoreDir("/data/cms-admin", "abc123");
    expect(dir).toBe("/data/cms-admin/build-deps/abc123");
  });

  it("resolves node_modules INSIDE the store dir", () => {
    const nm = resolveDepsNodeModulesPath("/data/cms-admin", "abc123");
    expect(nm).toBe("/data/cms-admin/build-deps/abc123/node_modules");
  });

  it("works with a relative dataDir (paths joined as-is)", () => {
    expect(resolveDepsStoreDir("./tmp", "abc")).toBe("tmp/build-deps/abc");
  });
});
