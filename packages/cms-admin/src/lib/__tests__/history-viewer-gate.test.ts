import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { execFileSync } from "node:child_process";

/**
 * A reader may not see deleted content or old versions.
 *
 * Christian, 28 Aug 2026: «ja, læser må ikke se slettet indhold og gamle
 * versioner.» Third visibility question that day, third identical answer.
 * components named the rule underneath the three:
 *
 *     en læser må læse det der er UDGIVET — aldrig protokollen bag
 *
 * A submission, a deletion and an overwritten draft are all traces of how the
 * published thing was made. None of them is written for that reader.
 *
 * WHAT THE MEASUREMENT FOUND — six doors, and three asked for nothing:
 *
 *   list_trash / list_revisions (chat)   content.read — which a viewer HAS
 *   GET /api/trash                       NO CHECK AT ALL
 *   GET .../revisions                    NO CHECK AT ALL
 *   /admin/trash                         client-side only; a viewer who typed
 *                                        the URL reached it and it fetched
 *   sidebar link                         `siteRole !== "viewer"` — a bare role
 *                                        comparison this repo's own rule
 *                                        forbids, invisible to the permission
 *                                        system
 *
 * Same shape as the forms sweep hours earlier, which is why the door list here
 * is DERIVED from disk rather than typed out.
 */

const SRC = join(process.cwd(), "src");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

/** Code lines only; comments dropped one by one, never a whole-file strip. */
const codeLines = (p: string) => {
  const lines = read(p).split("\n").filter((l) => {
    const t = l.trim();
    return t && !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
  });
  expect(lines.length, `${p}: no code lines — the guard scanned nothing`).toBeGreaterThan(1);
  return lines.join("\n");
};

vi.mock("@/lib/cms", () => ({ getAdminCms: async () => ({}), getAdminConfig: async () => ({ collections: [] }) }));
vi.mock("@/lib/site-paths", () => ({ getActiveSitePaths: async () => ({}) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
const { resolvePermissions } = await import("@/lib/permissions-shared");
const { buildChatTools } = await import("@/lib/chat/tools");

describe("the viewer role", () => {
  it("does NOT carry content.history", () => {
    expect(resolvePermissions("viewer")).not.toContain("content.history");
  });

  it("still carries the reads it is FOR — this is not 'nothing for anyone'", () => {
    // Without this, deleting the viewer role entirely would also pass above.
    const perms = resolvePermissions("viewer");
    expect(perms).toContain("content.read");
    expect(perms).toContain("media.read");
  });

  it("an EDITOR keeps it — only the viewer was closed", () => {
    expect(resolvePermissions("editor")).toContain("content.history");
  });

  it("and it is a SEPARATE permission from content.read", () => {
    // Folding it into content.read would have taken the viewer's only job with
    // it; leaving it there is what let them read the trash in the first place.
    expect(resolvePermissions("viewer")).toContain("content.read");
    expect(resolvePermissions("viewer")).not.toContain("content.history");
  });
});

describe("the chat hands a viewer neither the trash nor the old versions", () => {
  it("list_trash and list_revisions are gone for a viewer, kept for an editor", async () => {
    const names = async (r: "viewer" | "editor") =>
      (await buildChatTools(resolvePermissions(r))).map((t) => t.definition.name);
    const viewer = await names("viewer");
    const editor = await names("editor");
    for (const t of ["list_trash", "list_revisions"]) {
      expect(viewer, `a viewer was handed ${t}`).not.toContain(t);
      expect(editor, `an editor lost ${t}`).toContain(t);
    }
    // The negative control: the viewer still has a working chat.
    expect(viewer).toContain("list_documents");
    expect(viewer.length).toBeGreaterThan(5);
  });
});

describe("every door onto deleted content or old versions asks for it", () => {
  // DERIVED FROM DISK. The forms sweep this morning used a hand-written list of
  // three routes and was blind to the two it had not been told about. The rule
  // that came out of it — the population must be derived, never enumerated —
  // is applied here from the start.
  const routes = execFileSync(
    "sh",
    ["-c", `find "${join(SRC, "app/api")}" \\( -path '*trash*' -o -path '*revision*' \\) -name route.ts`],
    { encoding: "utf8" },
  ).trim().split("\n").filter(Boolean).map((abs) => relative(SRC, abs)).sort();

  it("found the routes it thinks it found", () => {
    expect(routes.length, `only found: ${routes.join(", ")}`).toBeGreaterThanOrEqual(3);
  });

  for (const door of routes) {
    it(`${door} — its GET is gated`, () => {
      const code = codeLines(door);
      const at = code.indexOf("export async function GET");
      if (at === -1) return; // write-only route; its own permission is its business
      const end = code.indexOf("\nexport ", at + 1);
      const body = code.slice(at, end === -1 ? undefined : end);
      expect(body, `${door}: GET does not call requirePermission("content.history")`)
        .toMatch(/requirePermission\(\s*"content\.history"\s*\)/);
      expect(body, `${door}: still falls back to a bare role check`)
        .not.toMatch(/if\s*\(\s*!role\s*\)/);
    });
  }

  it("the trash PAGE is gated on the server, not only in the client", () => {
    // It was a client component reading usePermissions() — which decides what
    // to RENDER. A viewer who typed the URL reached the page and it fetched.
    const code = codeLines("app/admin/(workspace)/trash/layout.tsx");
    expect(code, "the trash layout does not check the permission").toMatch(/"content\.history"/);
    expect(code, "it does not actually redirect").toMatch(/redirect\(/);
  });

  it("the sidebar link is permission-gated, not role-compared", () => {
    // `siteRole !== "viewer"` was the old check: invisible to the permission
    // system, and this repo's own rule forbids it for new gating.
    const code = codeLines("components/sidebar.tsx");
    const at = code.indexOf('nav-link-trash');
    expect(at, "the trash nav item is gone — the anchor has moved").toBeGreaterThan(-1);
    const around = code.slice(Math.max(0, at - 700), at);
    expect(around, "the trash link is not gated on content.history").toContain("content.history");
    // Anchored on the EXECUTABLE form, not on the words. The first version
    // matched /siteRole !== "viewer"/ anywhere in the window and went red on
    // my own explanatory JSX comment, which names the old check in order to
    // say it is gone. Fifteenth instrument fault today, and the same shape as
    // the rest: the guard agreed with the text rather than with the code.
    expect(around, "a bare role comparison is back as a gate")
      .not.toMatch(/\{\s*siteRole !== "viewer"\s*&&/);
  });
});
