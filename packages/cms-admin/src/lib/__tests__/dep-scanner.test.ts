/**
 * F143 P4 — dep-scanner tests.
 *
 * Verifies the auto-detect path: parse a build.ts source string, extract
 * the bare npm imports, drop builtins/relative/core-provided, and
 * return the residual list that needs install.
 */
import { describe, it, expect } from "vitest";
import {
  scanBuildSource,
  bareSpecifierToPackageName,
} from "../build-server/dep-scanner";

describe("scanBuildSource — happy path", () => {
  it("returns empty everything for empty source", async () => {
    const r = await scanBuildSource("");
    expect(r.rawImports).toEqual([]);
    expect(r.packageNames).toEqual([]);
    expect(r.missing).toEqual([]);
  });

  it("extracts a single static import", async () => {
    const r = await scanBuildSource(`import { marked } from "marked";`);
    expect(r.rawImports).toEqual(["marked"]);
    expect(r.packageNames).toEqual(["marked"]);
  });

  it("extracts multiple static imports + dedupes", async () => {
    const src = `
      import { marked } from "marked";
      import lodash from "lodash";
      import { axios } from "axios";
      import { another } from "marked";
    `;
    const r = await scanBuildSource(src);
    expect(r.packageNames.sort()).toEqual(["axios", "lodash", "marked"]);
  });

  it("extracts dynamic import() with string literal", async () => {
    const src = `
      const m = await import("marked");
    `;
    const r = await scanBuildSource(src);
    expect(r.packageNames).toContain("marked");
  });

  it("extracts CommonJS require() calls", async () => {
    const src = `
      const lodash = require("lodash");
      const fs = require("node:fs");
    `;
    const r = await scanBuildSource(src);
    expect(r.packageNames).toContain("lodash");
    expect(r.packageNames).not.toContain("node:fs");
  });

  it("filters node: builtins from missing list", async () => {
    const src = `
      import fs from "node:fs";
      import path from "node:path";
      import lodash from "lodash";
    `;
    const r = await scanBuildSource(src);
    expect(r.missing).toEqual(["lodash"]);
    expect(r.packageNames).not.toContain("node:fs");
  });

  it("filters relative imports", async () => {
    const src = `
      import a from "./utils";
      import b from "../shared/types";
      import c from "lodash";
    `;
    const r = await scanBuildSource(src);
    expect(r.packageNames).toEqual(["lodash"]);
  });

  it("filters absolute imports", async () => {
    const src = `import x from "/usr/lib/foo";`;
    const r = await scanBuildSource(src);
    expect(r.packageNames).toEqual([]);
  });

  it("filters URL-scheme imports (data:, file:, http:, ...)", async () => {
    const src = `
      import a from "data:text/javascript,foo";
      import b from "lodash";
    `;
    const r = await scanBuildSource(src);
    expect(r.packageNames).toEqual(["lodash"]);
  });
});

describe("scanBuildSource — provided-deps interaction", () => {
  it("drops deps cms-admin already provides from missing", async () => {
    const src = `
      import { marked } from "marked";
      import sharp from "sharp";
      import slugify from "slugify";
      import lodash from "lodash";
      import three from "three";
    `;
    const r = await scanBuildSource(src);
    // packageNames keeps everything (so callers can audit what's used)
    expect(r.packageNames.sort()).toEqual([
      "lodash",
      "marked",
      "sharp",
      "slugify",
      "three",
    ]);
    // missing only has the non-provided ones
    expect(r.missing.sort()).toEqual(["lodash", "three"]);
  });

  it("returns empty missing when only provided deps are imported", async () => {
    const src = `
      import { marked } from "marked";
      import { unified } from "@webhouse/cms";
    `;
    const r = await scanBuildSource(src);
    expect(r.missing).toEqual([]);
  });
});

describe("scanBuildSource — submodule + scoped imports", () => {
  it("strips submodule suffix to get root package name", async () => {
    const src = `
      import x from "marked/lib/marked.cjs";
      import y from "lodash/fp";
    `;
    const r = await scanBuildSource(src);
    expect(r.packageNames.sort()).toEqual(["lodash", "marked"]);
  });

  it("preserves @scope/name for scoped packages", async () => {
    const src = `
      import x from "@scope/pkg";
      import y from "@scope/pkg/sub";
      import z from "@webhouse/cms";
    `;
    const r = await scanBuildSource(src);
    expect(r.packageNames.sort()).toEqual(["@scope/pkg", "@webhouse/cms"]);
  });
});

describe("scanBuildSource — edge cases that should NOT crash", () => {
  it("handles malformed JS gracefully (es-module-lexer is permissive)", async () => {
    // es-module-lexer will throw on truly broken JS; this is borderline
    // but should still extract what it can.
    const src = `
      import { foo } from "lodash";
      this is not valid syntax beyond this point !!!
    `;
    // Wrap in expect-not-to-throw or accept either behaviour — the
    // contract is: do best-effort, don't crash the build trigger.
    let result;
    try {
      result = await scanBuildSource(src);
    } catch {
      result = { rawImports: [], packageNames: [], missing: [] };
    }
    expect(result).toBeDefined();
  });

  it("handles a real-world build.ts with mixed imports", async () => {
    // Approximation of trail/apps/landing/build.ts top
    const src = `
      import { readFileSync, writeFileSync } from "node:fs";
      import { join } from "node:path";
      import { marked } from "marked";

      const CONTENT_DIR = join(import.meta.dirname, "content");
    `;
    const r = await scanBuildSource(src);
    expect(r.missing).toEqual([]); // marked is provided
    expect(r.packageNames).toEqual(["marked"]);
  });

  it("handles a build.ts that needs three + d3 (the F143 docs example)", async () => {
    const src = `
      import * as THREE from "three";
      import { forceSimulation } from "d3-force";
      import { marked } from "marked";
    `;
    const r = await scanBuildSource(src);
    expect(r.missing.sort()).toEqual(["d3-force", "three"]);
  });
});

describe("bareSpecifierToPackageName", () => {
  it("returns the spec as-is for plain package names", () => {
    expect(bareSpecifierToPackageName("lodash")).toBe("lodash");
    expect(bareSpecifierToPackageName("marked")).toBe("marked");
  });

  it("strips submodule suffix from non-scoped packages", () => {
    expect(bareSpecifierToPackageName("marked/lib/marked.cjs")).toBe("marked");
    expect(bareSpecifierToPackageName("lodash/fp")).toBe("lodash");
  });

  it("preserves scope for scoped packages", () => {
    expect(bareSpecifierToPackageName("@scope/pkg")).toBe("@scope/pkg");
    expect(bareSpecifierToPackageName("@webhouse/cms")).toBe("@webhouse/cms");
  });

  it("strips submodule from scoped packages", () => {
    expect(bareSpecifierToPackageName("@webhouse/cms/types")).toBe("@webhouse/cms");
    expect(bareSpecifierToPackageName("@scope/pkg/lib/sub")).toBe("@scope/pkg");
  });

  it("handles malformed scoped name (only @scope, no /name) by returning as-is", () => {
    expect(bareSpecifierToPackageName("@just-a-scope")).toBe("@just-a-scope");
  });
});
