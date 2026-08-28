import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { execFileSync } from "node:child_process";
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
  // Floor of 1, not 5. It was 5 — written when this only read big files — and a
  // genuinely short route then failed with "the guard scanned nothing" instead
  // of "this GET is ungated". The sanity check was masking the finding.
  expect(lines.length, `${p}: no code lines — the guard scanned nothing`).toBeGreaterThan(1);
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

describe("every door onto the form inbox asks for forms.read", () => {
  // DERIVED FROM DISK, never a hand-list. The first version of this test named
  // three routes by hand and asserted each one was gated. It passed — and it
  // was blind to the two it did not name: `GET /api/admin/forms` (which serves
  // the per-form UNREAD COUNT, the very thing I had just declined to give a
  // viewer in the chat) and `GET /api/admin/forms/[name]` (no check of any kind).
  //
  // components put the principle exactly right on 28 Aug 2026: assert the
  // COUNT, not the identities. "These three were as expected" cannot see a
  // fourth; "every GET under this directory is gated" can. Same distinction as
  // counting rows rather than counting failures.
  const DIR = join(SRC, "app/api/admin/forms");
  const routes = execFileSync("find", [DIR, "-name", "route.ts"], { encoding: "utf8" })
    .trim().split("\n").filter(Boolean)
    .map((abs) => relative(SRC, abs)).sort();

  it("found the routes it thinks it found", () => {
    // A glob that silently matches nothing turns the whole loop below into
    // "0 of 0 passed" wearing a green tick.
    expect(routes.length, `only found: ${routes.join(", ")}`).toBeGreaterThanOrEqual(5);
  });

  for (const door of routes) {
    it(`${door} — GET is gated on forms.read`, () => {
      const code = codeLines(door);
      const at = code.indexOf("export async function GET");
      if (at === -1) return; // write-only route; its own permission is its business
      const end = code.indexOf("\nexport ", at + 1);
      const body = code.slice(at, end === -1 ? undefined : end);

      // Anchored on the CALL inside the GET body, not on the import and not
      // merely somewhere in the file — a sibling POST's permission satisfying
      // a GET is exactly how a vacuous guard passes while gating nothing.
      expect(body, `${door}: GET does not call requirePermission("forms.read")`)
        .toMatch(/requirePermission\(\s*"forms\.read"\s*\)/);
      // And the loose "is anyone logged in" check must be gone, or the strict
      // gate can sit above a door the loose one already opened.
      expect(body, `${door}: still falls back to a bare role check`)
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

  it("the sidebar does not poll the inbox for someone who may not read it", () => {
    // UX layer, not the boundary — but a viewer's browser was firing this every
    // 30 seconds, and before the route was gated it came back with the count.
    const code = codeLines("components/sidebar.tsx");
    const at = code.indexOf("function fetchFormCounts");
    expect(at, "fetchFormCounts is gone — the anchor has moved").toBeGreaterThan(-1);
    // Two assertions, because one is not enough: that the poll is guarded, AND
    // that the flag guarding it is derived from the permission. My first
    // version looked for the literal "forms.read" inside the poll body — which
    // went red the moment the check was hoisted out of the closure, i.e. on a
    // CORRECT fix. The anchor was wrong, not the code.
    expect(code.slice(at, at + 600), "the poll is unconditional")
      .toMatch(/if\s*\(!canReadForms\)\s*return;/);
    expect(code, "canReadForms no longer traces to the permission")
      .toMatch(/const canReadForms =[^\n]*"forms\.read"/);
    // And it must be in the effect's deps: ctxUser arrives from an async fetch,
    // so a closure captured with [] reads `false` forever and the badge never
    // appears FOR ANYONE — a fix that silently breaks the admin instead.
    expect(code, "the effect does not re-run when the permission lands")
      .toMatch(/\}, \[canReadForms\]\);/);
  });
});
