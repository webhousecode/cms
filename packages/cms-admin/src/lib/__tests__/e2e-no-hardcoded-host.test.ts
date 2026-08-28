import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { execFileSync } from "node:child_process";

/**
 * F178.4 — no E2E spec may name its own server.
 *
 * The `Tests` workflow had failed 99 of its last 100 runs and had never once
 * been green. playwright.config.ts boots the server on 3011 and had been moved
 * off 3010 deliberately; three spec files kept their own
 * `const BASE = "http://localhost:3010"`. In CI that is ERR_CONNECTION_REFUSED
 * for 34 of 43 tests. Locally it is a WRITE — 03-richtext's cleanup step is a
 * PATCH — into whichever site Christian has open on his live dev server, which
 * is the exact damage the config comment says was closed.
 *
 * The fix moved the value into e2e/fixtures/base-url.ts. This test is what
 * stops it drifting back apart, and it is the ONLY layer that can: nothing
 * else notices a spec that talks to a different machine than the one the
 * config booted — the suite simply fails, which it was already doing.
 *
 * DERIVED FROM DISK, never a hand-list. A named-file version of this test
 * would pass while blind to a spec added tomorrow.
 */

const E2E = join(process.cwd(), "e2e");

const specs = execFileSync("find", [E2E, "-name", "*.spec.ts", "-o", "-name", "*.ts"], {
  encoding: "utf8",
})
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((abs) => relative(process.cwd(), abs))
  .sort();

/** Code lines only — a comment MAY name the port, because the explanation of
 *  what went wrong has to be allowed to say what went wrong. Dropped line by
 *  line, never a block strip: a `/*` inside a string opens a phantom comment
 *  and a naive stripper eats the very line the guard is looking for. */
const codeLines = (p: string) =>
  readFileSync(join(process.cwd(), p), "utf8")
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return t && !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");

describe("E2E specs get their host from one place", () => {
  it("found the spec files it thinks it found", () => {
    // A find that silently matches nothing turns every loop below into
    // "0 of 0 passed" wearing a green tick.
    expect(specs.length, `only found: ${specs.join(", ")}`).toBeGreaterThanOrEqual(7);
  });

  it("e2e/fixtures/base-url.ts is the source and does NOT point at 3010", () => {
    const code = codeLines("e2e/fixtures/base-url.ts");
    expect(code, "the shared source itself now targets the live dev server")
      .not.toMatch(/3010/);
    expect(code, "E2E_PORT default is gone — specs would fall back to nothing")
      .toMatch(/E2E_PORT\s*\?\?\s*\d+/);
  });

  for (const spec of specs.filter((s) => !s.endsWith("fixtures/base-url.ts"))) {
    it(`${spec} — names no host of its own`, () => {
      const code = codeLines(spec);
      // Any absolute localhost origin, not just 3010. Pinning the literal
      // "3010" would pass on a spec that hardcoded 3011 and broke the moment
      // someone set E2E_PORT — the defect is the hardcoding, not the number.
      const found = code.match(/["'`]https?:\/\/(localhost|127\.0\.0\.1)[^"'`]*/g);
      expect(
        found,
        `${spec}: hardcodes ${found?.join(", ")} — import BASE_URL from fixtures/base-url instead`,
      ).toBeNull();
    });
  }

  it("playwright.config.ts reads the same module rather than redeclaring it", () => {
    const code = codeLines("playwright.config.ts");
    expect(code, "the config declares its own port again — two sources")
      .toMatch(/from\s+["']\.\/e2e\/fixtures\/base-url["']/);
    expect(code, "config hardcodes a localhost origin")
      .not.toMatch(/["'`]https?:\/\/localhost/);
  });
});
