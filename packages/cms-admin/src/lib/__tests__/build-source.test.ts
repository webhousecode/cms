/**
 * F205.3 — a deploy builds from the site's own repo. The overlay must bring the
 * repo's build code, and must never touch what the CMS owns.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildSourceFrom, shouldSync, syncBuildSource } from "../build-source";

describe("buildSourceFrom", () => {
  it("reads a linked site", () => {
    expect(buildSourceFrom({ buildSourceRepo: "broberg-ai/trail", buildSourcePath: "apps/landing/", buildSourceRef: "main" }))
      .toEqual({ repo: "broberg-ai/trail", path: "apps/landing", ref: "main" });
  });
  it("treats an unlinked site as unlinked (unchanged behaviour)", () => {
    expect(buildSourceFrom({})).toBeNull();
    expect(buildSourceFrom({ buildSourceRepo: "" })).toBeNull();
    expect(buildSourceFrom({ buildSourceRepo: "not a repo" })).toBeNull();
  });
  it("refuses a path that climbs out", () => {
    expect(buildSourceFrom({ buildSourceRepo: "a/b", buildSourcePath: "x/../.." })).toBeNull();
  });
});

describe("shouldSync", () => {
  it("brings build code", () => {
    for (const p of ["build.ts", "package.json", "public/favicon.svg", "vendor/consent/x.js", "tsconfig.json"]) {
      expect(shouldSync(p)).toBe(true);
    }
  });
  it("never touches what the CMS writes, nor secrets", () => {
    for (const p of [
      "content/pages/home.json", "_data/site-config.json", "_revisions/x.json", "public/uploads/a.webp",
      "cms.config.ts", "webhouse-schema.json", "deploy/index.html", "dist/a", "node_modules/x/i.js",
      ".env", ".env.local", "sub/.env.production", "../escape", "a/../b",
    ]) {
      expect(shouldSync(p)).toBe(false);
    }
  });
});

describe("syncBuildSource", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "build-src-"));
    mkdirSync(path.join(dir, "content/pages"), { recursive: true });
    writeFileSync(path.join(dir, "content/pages/home.json"), "CMS CONTENT");
    writeFileSync(path.join(dir, "cms.config.ts"), "VOLUME CONFIG");
    writeFileSync(path.join(dir, "build.ts"), "OLD BUILD");
    writeFileSync(path.join(dir, "only-on-volume.txt"), "keep me");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function gh(tree: { path: string; mode?: string; content: string }[], truncated = false) {
    const blobs = new Map(tree.map((t, i) => [`b${i}`, t.content]));
    return (async (url: string) => {
      const u = String(url);
      const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200 });
      if (u.includes("/commits/")) return json({ sha: "abc123" });
      if (u.includes("/git/trees/")) {
        return json({ truncated, tree: tree.map((t, i) => ({ path: t.path, type: "blob", mode: t.mode ?? "100644", sha: `b${i}`, size: t.content.length })) });
      }
      const m = /\/git\/blobs\/(b\d+)$/.exec(u);
      if (m) return json({ encoding: "base64", content: Buffer.from(blobs.get(m[1])!).toString("base64") });
      return new Response("nope", { status: 404 });
    }) as unknown as typeof fetch;
  }

  it("lays the repo's build code over the folder and returns the commit", async () => {
    const res = await syncBuildSource(dir, { repo: "o/r", path: "apps/landing", ref: "main" }, "t", gh([
      { path: "apps/landing/build.ts", content: "NEW BUILD" },
      { path: "apps/landing/public/logo.svg", content: "<svg/>" },
      { path: "apps/landing/content/pages/home.json", content: "REPO CONTENT" },
      { path: "apps/landing/cms.config.ts", content: "REPO CONFIG" },
      { path: "apps/other/build.ts", content: "NOT MINE" },
    ]));
    expect(res.sha).toBe("abc123");
    expect(readFileSync(path.join(dir, "build.ts"), "utf8")).toBe("NEW BUILD");
    expect(readFileSync(path.join(dir, "public/logo.svg"), "utf8")).toBe("<svg/>");
    // The CMS's own files are untouched:
    expect(readFileSync(path.join(dir, "content/pages/home.json"), "utf8")).toBe("CMS CONTENT");
    expect(readFileSync(path.join(dir, "cms.config.ts"), "utf8")).toBe("VOLUME CONFIG");
    // Nothing is deleted:
    expect(existsSync(path.join(dir, "only-on-volume.txt"))).toBe(true);
    expect(res.written).toBe(2);
  });

  it("skips symlinks", async () => {
    await syncBuildSource(dir, { repo: "o/r", path: "", ref: "main" }, "t", gh([
      { path: "build.ts", content: "NEW" },
      { path: "evil", mode: "120000", content: "/etc/passwd" },
    ]));
    expect(existsSync(path.join(dir, "evil"))).toBe(false);
  });

  it("refuses a truncated tree instead of building half a site", async () => {
    await expect(syncBuildSource(dir, { repo: "o/r", path: "", ref: "main" }, "t", gh([{ path: "build.ts", content: "NEW" }], true)))
      .rejects.toThrow(/truncated/);
    expect(readFileSync(path.join(dir, "build.ts"), "utf8")).toBe("OLD BUILD");
  });

  it("refuses an empty path rather than reporting success", async () => {
    await expect(syncBuildSource(dir, { repo: "o/r", path: "apps/nope", ref: "main" }, "t", gh([{ path: "build.ts", content: "x" }])))
      .rejects.toThrow(/nothing to build/);
  });
});
