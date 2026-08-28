import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolvePermissions } from "@/lib/permissions-shared";

/**
 * A viewer may not read visitors' form submissions.
 *
 * Christian, 28 Aug 2026: «Ja til at læser ikke må se formular-indsendelser.»
 * This is a DECISION, not a defect — a future session that finds a viewer
 * locked out of the form inbox must be able to see it was chosen. Registered
 * in the Decision Register for exactly that reason.
 *
 * WHAT THE MEASUREMENT FOUND, and why removing the permission is not the whole
 * fix. `forms.read` gated the three CHAT tools and nothing else. The web UI
 * reads submissions through four other doors, and not one of them asked:
 *
 *   GET /api/admin/forms/[name]/submissions       `if (!role)` — logged in at all
 *   GET /api/admin/forms/[name]/submissions/[id]  NO CHECK WHATSOEVER
 *   GET /api/admin/forms/[name]/export            `if (!role)` — and it is the
 *                                                 COMPLETE CSV, every field of
 *                                                 every submission, not the
 *                                                 80-character slice the chat
 *                                                 hands back
 *   /admin/forms (layout)                         capability only — is the
 *                                                 FEATURE on, never may THIS
 *                                                 PERSON see it
 *
 * So closing the permission alone would have produced a change that looks like
 * the fix and is not: the chat would refuse while the page next to it served
 * the same names and messages, and the export served all of them at once.
 * Sixth instance this week of a rule that exists and does not reach all the
 * way round.
 */

const SRC = join(process.cwd(), "src");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

/** Code lines only — comment lines dropped one by one, never a block strip.
 *  A `/*` inside a string opens a phantom comment and a naive stripper eats
 *  the very line the guard is looking for; that has bitten this repo twice. */
const codeLines = (p: string) => {
  const lines = read(p).split("\n").filter((l) => {
    const t = l.trim();
    return t && !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
  });
  expect(lines.length, `${p}: no code lines — the guard scanned nothing`).toBeGreaterThan(5);
  return lines.join("\n");
};

describe("the viewer role", () => {
  it("does NOT carry forms.read", () => {
    expect(resolvePermissions("viewer")).not.toContain("forms.read");
  });

  it("still carries the reads it is FOR — this is not 'nothing for anyone'", () => {
    // Without this, deleting the viewer role entirely would also pass above.
    const perms = resolvePermissions("viewer");
    expect(perms).toContain("content.read");
    expect(perms).toContain("media.read");
  });

  it("an EDITOR keeps forms.read — only the viewer was closed", () => {
    expect(resolvePermissions("editor")).toContain("forms.read");
  });
});

describe("every door onto a submission asks for forms.read", () => {
  // The permission is the decision; THESE are the security boundary. Listed by
  // hand on purpose: a new read route must be added here deliberately, which is
  // the moment someone has to think about who may see it.
  const DOORS = [
    "app/api/admin/forms/[name]/submissions/route.ts",
    "app/api/admin/forms/[name]/submissions/[id]/route.ts",
    "app/api/admin/forms/[name]/export/route.ts",
  ];

  for (const door of DOORS) {
    it(`${door} gates its GET on forms.read`, () => {
      const code = codeLines(door);
      // Anchored on the CALL, not the import — an import line satisfying a
      // guard is precisely how a vacuous guard passes while gating nothing.
      expect(code, `${door}: no requirePermission("forms.read") call`)
        .toMatch(/requirePermission\(\s*"forms\.read"\s*\)/);
      // And the bare "is anyone logged in" check must be gone, or the strict
      // gate can sit above a door the loose one already opened.
      expect(code, `${door}: still falls back to a bare role check`)
        .not.toMatch(/if\s*\(\s*!role\s*\)/);
    });
  }

  it("the forms section itself is permission-gated, not only capability-gated", () => {
    const code = codeLines("app/admin/(workspace)/forms/layout.tsx");
    expect(code, "layout checks the capability but never the permission")
      .toMatch(/"forms\.read"/);
    expect(code, "capability gate lost — the F153 tenant switch must survive")
      .toMatch(/hasCapability/);
  });
});
