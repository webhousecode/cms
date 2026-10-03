/**
 * F205.5 — the PUBLISHED enrich build must run under plain Node ESM.
 *
 * vitest supplies `require`, so enrich.test.ts could not see this: an inline
 * require("node:fs") in copyFavicon compiled to __require("fs"), which throws
 * "Dynamic require of fs is not supported" in Node ESM. Any site with a
 * favicon.ico in its project crashed mid-enrich — no sitemap, robots or llms.
 * This test builds the package and runs the built file in a real node process.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const PKG = path.resolve(__dirname, "../..");
const FIXTURE = path.join(__dirname, "fixtures", "enrich");

let work = "";
beforeAll(() => {
  execFileSync("npx", ["tsup"], { cwd: PKG, stdio: "pipe" });
  work = mkdtempSync(path.join(tmpdir(), "enrich-esm-"));
  cpSync(FIXTURE, work, { recursive: true });
}, 180_000);
afterAll(() => rmSync(work, { recursive: true, force: true }));

describe("dist/enrich/index.js under plain Node ESM", () => {
  it("copies the project favicon and finishes the run", () => {
    expect(existsSync(path.join(work, "project", "public", "favicon.ico"))).toBe(true);
    expect(existsSync(path.join(work, "dist", "favicon.ico"))).toBe(false);

    const script = path.join(work, "run.mjs");
    writeFileSync(script, `
      import { enrichDist } from ${JSON.stringify(path.join(PKG, "dist", "enrich", "index.js"))};
      await enrichDist(${JSON.stringify(path.join(work, "dist"))}, ${JSON.stringify(path.join(work, "project", "content"))}, {
        baseUrl: "https://fixture.example", basePath: "", siteName: "Fixture Site", siteDescription: "A fixture for enrichDist", siteImage: "/images/default-og.jpg", themeColor: "#F7BB2E", lang: "en",
      });
    `);
    execFileSync(process.execPath, [script], { stdio: "pipe" });

    expect(existsSync(path.join(work, "dist", "favicon.ico"))).toBe(true);
    expect(existsSync(path.join(work, "dist", "sitemap.xml"))).toBe(true);
  });
});
