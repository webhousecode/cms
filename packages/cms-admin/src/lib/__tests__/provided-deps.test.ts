/**
 * F143 Phase 1 — provided-deps tests.
 *
 * Verifies:
 *   1. The TS canonical list and the .mjs loader's PROVIDED array are in sync
 *      (drift between them = silent breakage where the TS layer thinks a dep
 *      is provided but the loader doesn't intercept it).
 *   2. Each provided dep is actually installed in cms-admin's node_modules
 *      (drift between provided-deps.ts and package.json = build-time crash
 *      "Cannot find module").
 *   3. The isProvidedBuildDep classifier handles edge cases correctly.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  PROVIDED_BUILD_DEPS,
  isProvidedBuildDep,
} from "../build-server/provided-deps";

describe("PROVIDED_BUILD_DEPS", () => {
  it("includes the five core deps the F143 audit identified", () => {
    expect(PROVIDED_BUILD_DEPS).toEqual(
      expect.arrayContaining([
        "@webhouse/cms",
        "marked",
        "marked-highlight",
        "gray-matter",
        "slugify",
        "sharp",
      ]),
    );
  });

  it("matches the loader script's PROVIDED array exactly (no drift)", () => {
    const loaderPath = resolve(
      __dirname,
      "..",
      "..",
      "..",
      "scripts",
      "build-runtime-loader.mjs",
    );
    expect(existsSync(loaderPath)).toBe(true);
    const loaderSource = readFileSync(loaderPath, "utf-8");
    // Extract the PROVIDED array literal; loose match keeps the test resilient
    // to formatting changes but still catches missing/extra entries.
    const match = loaderSource.match(/const PROVIDED = \[([\s\S]*?)\];/);
    expect(match, "loader script must contain `const PROVIDED = [...]`").toBeTruthy();
    const loaderEntries = (match![1].match(/"([^"]+)"/g) ?? [])
      .map((s) => s.replace(/"/g, ""))
      .sort();
    const tsEntries = [...PROVIDED_BUILD_DEPS].sort();
    expect(
      loaderEntries,
      "loader's PROVIDED must match provided-deps.ts PROVIDED_BUILD_DEPS",
    ).toEqual(tsEntries);
  });

  it("each provided dep is actually installed in cms-admin's node_modules", () => {
    const adminRoot = resolve(__dirname, "..", "..", "..");
    for (const dep of PROVIDED_BUILD_DEPS) {
      const pkgPath = join(adminRoot, "node_modules", dep, "package.json");
      expect(
        existsSync(pkgPath),
        `${dep} declared as provided but not installed at ${pkgPath}`,
      ).toBe(true);
    }
  });
});

describe("isProvidedBuildDep", () => {
  it("returns true for exact provided dep names", () => {
    expect(isProvidedBuildDep("marked")).toBe(true);
    expect(isProvidedBuildDep("slugify")).toBe(true);
    expect(isProvidedBuildDep("@webhouse/cms")).toBe(true);
    expect(isProvidedBuildDep("sharp")).toBe(true);
  });

  it("returns true for submodule imports of provided deps", () => {
    expect(isProvidedBuildDep("marked/lib/marked.cjs")).toBe(true);
    expect(isProvidedBuildDep("@webhouse/cms/types")).toBe(true);
    expect(isProvidedBuildDep("sharp/install")).toBe(true);
  });

  it("returns false for non-provided npm packages", () => {
    expect(isProvidedBuildDep("lodash")).toBe(false);
    expect(isProvidedBuildDep("react")).toBe(false);
    expect(isProvidedBuildDep("three")).toBe(false);
  });

  it("returns false for relative imports", () => {
    expect(isProvidedBuildDep("./utils")).toBe(false);
    expect(isProvidedBuildDep("../shared/types")).toBe(false);
    expect(isProvidedBuildDep(".")).toBe(false);
  });

  it("returns false for absolute paths", () => {
    expect(isProvidedBuildDep("/usr/lib/foo")).toBe(false);
  });

  it("returns false for node: builtins", () => {
    expect(isProvidedBuildDep("node:fs")).toBe(false);
    expect(isProvidedBuildDep("node:path")).toBe(false);
  });

  it("returns false for other URL-style schemes", () => {
    expect(isProvidedBuildDep("data:text/javascript,foo")).toBe(false);
    expect(isProvidedBuildDep("file:///abs/path")).toBe(false);
  });

  it("does NOT match on partial-prefix collisions", () => {
    // Tricky: "markdown" starts with "marked"-ish chars but is not "marked"
    // nor a subpath of marked. The classifier uses `name === p || startsWith(p + "/")`
    // so this is correctly NOT matched.
    expect(isProvidedBuildDep("markdown")).toBe(false);
    expect(isProvidedBuildDep("marked-extension")).toBe(false);
    expect(isProvidedBuildDep("slugify-it")).toBe(false);
  });
});
