/**
 * F143 P2 — Beam source-list extension tests.
 *
 * Verifies the rules that decide WHICH files at projectDir get
 * transported in a beam archive. We don't test the full createBeamArchive
 * flow here (it requires CMS state, file IO, JSZip round-trip — that's
 * an integration concern). Instead we lock down the policy primitives:
 *
 *   - EXCLUDED_SOURCE_DIRS contains the dirs that must NEVER ship
 *     (node_modules, .next, dist, deploy, .git, content, _data, ...).
 *     Drift here = silent shipping of huge build caches over the wire.
 *   - SOURCE_ROOT_FILES contains the root-level files we DO ship
 *     (build.ts, package.json, lockfiles, tsconfig.json).
 *     Drift here = build server can't find what it needs after import.
 *   - The classifier behaviours both sets enable: walking projectDir
 *     and selecting which entries to archive.
 */
import { describe, it, expect } from "vitest";
import {
  EXCLUDED_SOURCE_DIRS,
  SOURCE_ROOT_FILES,
} from "../beam/types";

describe("EXCLUDED_SOURCE_DIRS (F143 P2 — never beam these)", () => {
  it("excludes the build-output directories that would bloat the archive", () => {
    expect(EXCLUDED_SOURCE_DIRS.has("node_modules")).toBe(true);
    expect(EXCLUDED_SOURCE_DIRS.has(".next")).toBe(true);
    expect(EXCLUDED_SOURCE_DIRS.has("dist")).toBe(true);
    expect(EXCLUDED_SOURCE_DIRS.has("deploy")).toBe(true);
  });

  it("excludes tooling caches that aren't portable", () => {
    expect(EXCLUDED_SOURCE_DIRS.has(".turbo")).toBe(true);
    expect(EXCLUDED_SOURCE_DIRS.has(".cache")).toBe(true);
  });

  it("excludes .git (version-control state, not site state)", () => {
    expect(EXCLUDED_SOURCE_DIRS.has(".git")).toBe(true);
  });

  it("excludes paths that are already beamed via dedicated sections", () => {
    // Beam already has explicit branches for these — including them in
    // source/ would cause checksum collisions / double-write.
    expect(EXCLUDED_SOURCE_DIRS.has("_data")).toBe(true);
    expect(EXCLUDED_SOURCE_DIRS.has("content")).toBe(true);
  });

  it("excludes _revisions — local-only history, not site state", () => {
    expect(EXCLUDED_SOURCE_DIRS.has("_revisions")).toBe(true);
  });

  it("does NOT exclude public/ — assets must travel with the source", () => {
    // public/ is what build.ts cpSync's into deploy/. Without it the
    // built site has no logos, favicons, fonts, SVGs.
    expect(EXCLUDED_SOURCE_DIRS.has("public")).toBe(false);
  });

  it("does NOT exclude scripts/ — sites with helper scripts need them", () => {
    // build.ts may import from ./scripts/foo.ts. F143 P2 walker only
    // recurses into public/, so other scripts won't be auto-walked, but
    // we shouldn't blanket-exclude them at the dir level either — sites
    // that need them can opt-in later (Phase 3+).
    expect(EXCLUDED_SOURCE_DIRS.has("scripts")).toBe(false);
  });
});

describe("SOURCE_ROOT_FILES (F143 P2 — root-level files to ship)", () => {
  it("includes the standard build entry-point names", () => {
    expect(SOURCE_ROOT_FILES.has("build.ts")).toBe(true);
    expect(SOURCE_ROOT_FILES.has("build.mjs")).toBe(true);
    expect(SOURCE_ROOT_FILES.has("build.js")).toBe(true);
  });

  it("includes package manifest + every common lockfile", () => {
    expect(SOURCE_ROOT_FILES.has("package.json")).toBe(true);
    expect(SOURCE_ROOT_FILES.has("package-lock.json")).toBe(true);
    expect(SOURCE_ROOT_FILES.has("pnpm-lock.yaml")).toBe(true);
    expect(SOURCE_ROOT_FILES.has("yarn.lock")).toBe(true);
  });

  it("includes tsconfig variants needed for tsx-based builds", () => {
    expect(SOURCE_ROOT_FILES.has("tsconfig.json")).toBe(true);
    expect(SOURCE_ROOT_FILES.has("tsconfig.build.json")).toBe(true);
  });

  it("includes .npmrc for sites with custom registry config", () => {
    expect(SOURCE_ROOT_FILES.has(".npmrc")).toBe(true);
  });

  it("does NOT auto-include README/.env-example etc. — keep archive minimal", () => {
    expect(SOURCE_ROOT_FILES.has("README.md")).toBe(false);
    expect(SOURCE_ROOT_FILES.has(".env")).toBe(false);
    expect(SOURCE_ROOT_FILES.has(".env.example")).toBe(false);
    expect(SOURCE_ROOT_FILES.has(".gitignore")).toBe(false);
  });

  it("does NOT include cms.config.ts — that's beamed via its own section", () => {
    // The export.ts has a dedicated branch for cms.config.ts (with
    // GitHub-adapter handling). Including it in SOURCE_ROOT_FILES would
    // double-add it to the archive.
    expect(SOURCE_ROOT_FILES.has("cms.config.ts")).toBe(false);
    expect(SOURCE_ROOT_FILES.has("cms.config.json")).toBe(false);
  });
});

describe("Source-list policy interaction", () => {
  it("EXCLUDED_SOURCE_DIRS and SOURCE_ROOT_FILES are disjoint", () => {
    // A name should never appear in both — one is for dir-walking, the
    // other for file-whitelisting. Overlap would be a logic error.
    for (const dir of EXCLUDED_SOURCE_DIRS) {
      expect(
        SOURCE_ROOT_FILES.has(dir),
        `"${dir}" is in both EXCLUDED_SOURCE_DIRS and SOURCE_ROOT_FILES`,
      ).toBe(false);
    }
  });

  it("typical Next.js build artifacts are all excluded", () => {
    const nextjsArtifacts = ["node_modules", ".next", ".turbo", "dist"];
    for (const a of nextjsArtifacts) {
      expect(EXCLUDED_SOURCE_DIRS.has(a)).toBe(true);
    }
  });

  it("typical static-site (build.ts) artifacts are all excluded", () => {
    // build.ts writes to "deploy/" by deploy-service convention.
    // dist/ is the dev preview output — also not portable.
    expect(EXCLUDED_SOURCE_DIRS.has("deploy")).toBe(true);
    expect(EXCLUDED_SOURCE_DIRS.has("dist")).toBe(true);
  });
});
