import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The chat is its own write path, and it was ungated.
 *
 * Measured against the real tool list on 27 Aug 2026, by RUNNING buildChatTools
 * with a viewer's actual permissions (content.read, forms.read, media.read):
 * 61 tools came back, 30 of them mutating — create_document, publish_document,
 * trash_document, bulk_publish, trigger_deploy, translate_site.
 *
 * Three faults compounding:
 *   1. `!t.permission || hasPermission(…)` — a tool declaring no permission was
 *      KEPT. 60 of 64 declared none, so the filter was decorative.
 *   2. The route's only check was "is there a session". `chat.use` exists as a
 *      permission and was never asked for.
 *   3. `session.siteRole ?? "admin"` — no role meant ADMIN.
 *
 * And the handlers call getAdminCms() directly rather than our own HTTP routes,
 * so every requirePermission gate on /api/cms/* was outside the path. Fifth time
 * in two days that a rule exists and hasn't reached all the way round; this
 * repo's own CLAUDE.md states the rule and it was honoured 4 times out of 64.
 */

vi.mock("@/lib/cms", () => ({
  getAdminCms: async () => ({}),
  getAdminConfig: async () => ({ collections: [] }),
}));
vi.mock("@/lib/site-paths", () => ({ getActiveSitePaths: async () => ({}) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const { buildChatTools } = await import("@/lib/chat/tools");

const VIEWER = ["content.read", "forms.read", "media.read"];
const EDITOR = [
  "agents.run", "chat.use", "content.create", "content.delete", "content.edit",
  "content.publish", "content.read", "deploy.trigger", "forms.read",
];

const MUTATING =
  /^(create_|update_|publish|unpublish|delete_|trash|empty_|restore_|bulk_|trigger_|run_|build_|approve_|reject_|set_|enable_|save_|schedule_|clone_|forget_|translate_|add_)/;

const names = async (perms: string[]) =>
  (await buildChatTools(perms)).map((t) => t.definition.name);

describe("a reader cannot be handed a writer's tools", () => {
  it("hands a viewer NOTHING that mutates", async () => {
    const got = (await names(VIEWER)).filter((n) => MUTATING.test(n));
    expect(got, `viewer was handed mutating tools: ${got.join(", ")}`).toEqual([]);
  });

  it("still hands a viewer the read tools — the fix is not 'nothing for anyone'", async () => {
    // Without this, "a viewer gets no mutating tools" would also pass on a
    // filter that returned an empty list to everybody, which is a different
    // outage wearing the same green tick.
    const got = await names(VIEWER);
    expect(got).toContain("list_documents");
    expect(got).toContain("get_document");
    expect(got.length).toBeGreaterThan(5);
  });

  it("leaves an EDITOR's chat working", async () => {
    // The negative control on the other side: if the fix is too hard, an editor
    // loses the tools they are supposed to have and the chat becomes useless.
    const got = await names(EDITOR);
    for (const t of ["create_document", "update_document", "publish_document", "trash_document"]) {
      expect(got, `editor lost ${t}`).toContain(t);
    }
  });

  it("gives an editor MORE than a viewer, and an admin more still", async () => {
    // Sequential, not Promise.all: tools.ts does a DYNAMIC import of
    // next/headers inside buildChatTools, and three concurrent calls race the
    // mock's resolution — the failure reads as a Next.js request-scope error
    // and has nothing to do with permissions.
    const v = await names(VIEWER);
    const e = await names(EDITOR);
    const a = await names(["*"]);

    expect(e.length, `editor ${e.length} vs viewer ${v.length}`).toBeGreaterThan(v.length);
    expect(a.length, `admin ${a.length} vs editor ${e.length}`).toBeGreaterThanOrEqual(e.length);
  });

  it("hands NOTHING to a session with no permissions at all", async () => {
    expect(await names([])).toEqual([]);
  });
});

describe("deny by default", () => {
  const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const read = (p: string) => readFileSync(join(SRC, p), "utf-8");

  it("scanned the files it thinks it scanned", () => {
    expect(read("lib/chat/tools.ts").length).toBeGreaterThan(5000);
    expect(read("app/api/cms/chat/route.ts").length).toBeGreaterThan(500);
  });

  it("EVERY tool declares a permission", async () => {
    // The behavioural tests above can only see the tools that exist today. This
    // is what stops tool number 65 from arriving without one — and with the
    // filter now denying by default, a missing permission makes a tool reach
    // NOBODY, so this test is what turns a silent dead tool into a red build.
    const src = read("lib/chat/tools.ts");
    const blocks = src.split("\n    {\n      definition: {").slice(1);
    expect(blocks.length, "tool list not parsed — guard scanned nothing").toBeGreaterThan(50);
    const missing = blocks
      .map((b) => ({ name: /name: "([a-z_]+)"/.exec(b)?.[1], has: /permission:\s*"/.test(b) }))
      .filter((t) => !t.has)
      .map((t) => t.name);
    expect(missing, `tools without a permission: ${missing.join(", ")}`).toEqual([]);
  });

  it("the filter requires a permission rather than tolerating its absence", () => {
    // Judged LINE BY LINE, with comment lines skipped — not by stripping
    // comments out of the whole file first. That was the first version and it
    // was broken: a `/*` inside a STRING somewhere above opens a phantom block
    // comment, and a naive stripper swallowed the filter line itself. Measured:
    // 133,547 chars → 131,692 after the block strip, and the line was gone.
    // The guard reported the fix missing while the fix was right there.
    //
    // Second time in one day the fleet has hit a broken comment stripper —
    // cardmem's was anchored at `^\s*` and missed trailing comments. The
    // instrument is wrong before the subject is.
    const code = read("lib/chat/tools.ts")
      .split("\n")
      .filter((l) => {
        const t = l.trim();
        return t && !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
      });
    expect(code.length, "no code lines — guard scanned nothing").toBeGreaterThan(100);
    const filterLine = code.find((l) => l.includes("allTools.filter"));
    expect(filterLine, "the tool filter is gone").toBeTruthy();
    expect(filterLine).toContain("!!t.permission &&");
    expect(filterLine, "the permissive form is back").not.toContain("!t.permission ||");
  });

  it("the route asks for chat.use and never defaults a missing role to admin", () => {
    const src = read("app/api/cms/chat/route.ts").replace(/\/\/[^\n]*/g, "");
    expect(src).toContain('"chat.use"');
    expect(src, 'a missing role still falls back to admin').not.toContain('?? "admin"');
  });
});
