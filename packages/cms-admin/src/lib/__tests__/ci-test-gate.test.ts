import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * F178.1 — a failing suite must LOOK like a failing suite.
 *
 * Every workflow that ran tests did it as:
 *
 *   pnpm test:run || echo "⚠️ Tests with native modules skipped on CI"
 *
 * written into the first deployment commit rather than after an observed
 * failure. Two faults, and the second is the one that mattered:
 *
 *  1. `||` swallowed EVERY failure, so a real regression was announced in the
 *     same reassuring words as a limitation someone chose to live with.
 *  2. `pnpm test:run` from the repo ROOT has never worked. Measured 28 Aug
 *     2026: exit 1, 45 test FILES failing to load while 1505 tests pass — the
 *     root workspace collects Playwright e2e specs and stale
 *     `.next/standalone` build artefacts as unit tests, and cms-admin's suite
 *     does not load at all because the `@/` alias is not applied there.
 *
 * So the step that gates a deploy never ran the tests it named, and said so in
 * words that read like a considered exception. This test keeps that shape out.
 *
 * It deliberately does NOT assert the gate is armed — that is F178.3, and it
 * waits on F178.2 naming the ~1-in-10 unexplained failure. Arming a gate that
 * cries wolf gets it switched off, which is worse than no gate.
 */
const WORKFLOWS = join(process.cwd(), "../../.github/workflows");
const readRaw = (f: string) => readFileSync(join(WORKFLOWS, f), "utf8");

/**
 * The file with its COMMENT lines removed.
 *
 * Caught by this test on its first run: the step I wrote quotes the banned
 * command inside its own explanatory comment, and the guard failed on it. A
 * guard that cannot tell a comment from a command counts an explanation as
 * behaviour — the same trap the fleet hit in buddy (a struct-guard that matched
 * raw source counted an import line as a call). Explaining a mistake must not
 * be indistinguishable from making it.
 */
const read = (f: string) =>
  readRaw(f)
    .split("\n")
    .filter((l) => !/^\s*#/.test(l))
    .join("\n");
const all = () => readdirSync(WORKFLOWS).filter((f) => f.endsWith(".yml"));

describe("a CI test step cannot swallow its own failure", () => {
  it("no workflow pipes a test run into `|| echo`", () => {
    for (const f of all()) {
      const src = read(f);
      const swallowed = src
        .split("\n")
        .filter((l) => /vitest|test:run|pnpm test/.test(l) && /\|\|/.test(l));
      expect(
        swallowed,
        `${f} swallows a test failure with \`||\` — a real regression would be reported as a skip`,
      ).toEqual([]);
    }
  });

  it("the reassuring native-modules line is gone everywhere", () => {
    // The exact wording that made a permanently broken step look intentional.
    for (const f of all()) {
      expect(read(f), `${f} still claims tests were "skipped" on CI`)
        .not.toMatch(/Tests with native modules skipped/);
    }
  });

  it("deploy and publish run the per-package suites that actually work", () => {
    // `pnpm test:run` from the root cannot load cms-admin's tests at all, so a
    // workflow using it is not running the suite it names.
    for (const f of ["deploy.yml", "publish.yml"]) {
      const src = read(f);
      expect(src, `${f} runs the cms core suite`).toMatch(
        /cd packages\/cms && npx vitest run/,
      );
      expect(src, `${f} runs the cms-admin suite`).toMatch(
        /cd packages\/cms-admin && npx vitest run/,
      );
    }
  });

  it("every non-blocking test step says WHY, and points at what arms it", () => {
    // A `continue-on-error` with no stated reason becomes permanent. Each one
    // must name the card that removes it, so the exception has an end.
    for (const f of all()) {
      // This one reads the RAW file on purpose: the reason lives in the comments.
      const lines = readRaw(f).split("\n");
      lines.forEach((line, i) => {
        if (!/continue-on-error:\s*true/.test(line)) return;
        // Look back over the step's own comment block.
        const context = lines.slice(Math.max(0, i - 20), i + 3).join("\n");
        if (!/vitest|test:run|pnpm test/.test(context)) return; // not a test step
        expect(context, `${f}: a non-blocking test step near line ${i + 1} names no card that arms it`)
          .toMatch(/F178\.3/);
      });
    }
  });
});
