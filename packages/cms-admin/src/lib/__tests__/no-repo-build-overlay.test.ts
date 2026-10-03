/**
 * F206.1 — webhouse.app never lays a site repo's build code over a project
 * folder. F205.3 did, and gave anyone with push access to a site repo code
 * execution on the CMS server with all of its secrets. Sites build in their
 * own repo (F206); this test goes red if the overlay comes back.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const LIB = path.resolve(__dirname, "..");
const read = (f: string) => readFileSync(path.join(LIB, f), "utf-8");

describe("F206.1 — no repo build overlay", () => {
  it("build-source module is gone", () => {
    expect(existsSync(path.join(LIB, "build-source.ts"))).toBe(false);
  });

  it("deploy-service does not fetch build code from a repo into the project folder", () => {
    const src = read("deploy-service.ts");
    expect(src).not.toMatch(/build-source/);
    expect(src).not.toMatch(/syncBuildSource|buildSourceFrom|sourceSha/);
    // Downloading a repo archive is how an overlay pulls a whole build tree.
    expect(src).not.toMatch(/\/(tarball|zipball)\//);
  });

  it("site config has no build-source fields", () => {
    expect(read("site-config.ts")).not.toMatch(/buildSource/);
  });
});
