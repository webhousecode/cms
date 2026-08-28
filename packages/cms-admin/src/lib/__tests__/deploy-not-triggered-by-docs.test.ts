import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A documentation commit must not restart production.
 *
 * webhouse.app runs on ONE machine. A deploy restarts it, and every in-flight
 * request dies with it. Measured 28 Aug 2026: Christian was reading a chat
 * answer when commit 93d4ca92 — a plan-doc, nothing else — deployed. His answer
 * stopped mid-sentence at "###" and the site was unreachable for ~50s. It
 * happened twice that evening; the second time nothing shipped that could
 * possibly change the running app.
 *
 * The guard reads the workflow rather than trusting anyone to remember, and it
 * asserts the SHAPE of the rule, not just that the words appear: paths-ignore
 * (deploy by default, skip the listed exceptions) and never paths (skip by
 * default, deploy only the listed ones). The second form fails in the dangerous
 * direction — a new source directory nobody thought about would silently stop
 * shipping, and the first sign would be prod not having a fix someone believed
 * was live.
 */

const WORKFLOW = join(process.cwd(), "../../.github/workflows/deploy.yml");
const yml = readFileSync(WORKFLOW, "utf8");

/** The `on:` block only — a match anywhere in the file proves nothing about
 *  what actually triggers the workflow. */
const trigger = yml.slice(yml.indexOf("\non:"), yml.indexOf("\njobs:"));

describe("the production deploy trigger", () => {
  it("ignores docs and markdown", () => {
    expect(trigger, "deploy.yml no longer has a paths-ignore on its push trigger")
      .toMatch(/paths-ignore:/);
    for (const p of ['"docs/**"', '"**/*.md"']) {
      expect(trigger, `${p} is not in paths-ignore — a doc commit will restart prod`)
        .toContain(p);
    }
  });

  it("does NOT use an allow-list of paths — that fails silently", () => {
    // `paths:` and `paths-ignore:` are mutually exclusive in GitHub Actions, so
    // this is not merely stylistic: swapping them inverts the default.
    expect(trigger.replace(/paths-ignore:/g, ""), "deploy switched to a paths allow-list")
      .not.toMatch(/^\s*paths:/m);
  });

  it("still deploys on a push to main at all", () => {
    // Without this, deleting the whole trigger would pass both tests above.
    expect(trigger).toMatch(/push:/);
    expect(trigger).toMatch(/branches:\s*\[main\]/);
  });

  it("source changes are NOT ignored", () => {
    // The failure that matters more than an extra deploy: a rule broad enough
    // to skip real code.
    for (const bad of ["packages/**", "src/**", "**/*.ts", "**/*.tsx"]) {
      expect(trigger, `paths-ignore contains ${bad} — real changes would stop deploying`)
        .not.toContain(`"${bad}"`);
    }
  });
});
