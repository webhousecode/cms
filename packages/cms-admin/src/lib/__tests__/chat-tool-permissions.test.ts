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
const { resolvePermissions } = await import("@/lib/permissions-shared");

// DERIVED, never copied. This list was a hardcoded ["content.read",
// "forms.read", "media.read"] — so when forms.read left the viewer role on
// 28 Aug 2026 the test went on measuring a viewer who no longer exists, and
// would have stayed green over the exact regression it is here to catch.
const VIEWER = resolvePermissions("viewer");
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


/**
 * F177 follow-up — the class, not the instance.
 *
 * F176 flipped the filter to deny-by-default and gave the 64 tools in the main
 * array a permission. It missed the two that are PUSHED conditionally
 * (`web_search`, `web_fetch`), because they live outside that array — so from
 * the moment F176 shipped they were dropped for EVERY caller, admins included,
 * while the system prompt went on advertising both by name.
 *
 * The security hole became a silently dead feature. Same declaration bug,
 * opposite direction, and nothing said so either time. `permission` is now
 * required on the type, so the compiler refuses tool number 65 — and this test
 * guards the half a type cannot: that the prompt does not promise a tool the
 * registry will not hand over.
 */
describe("no tool can enter the registry without a permission", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), "src/lib", p), "utf8");

  it("every allTools.push() carries a permission", () => {
    // THE INVARIANT THAT ACTUALLY BROKE. The 64 tools in the main array are now
    // guarded by the type (`permission: string`, required). The two that are
    // PUSHED conditionally — web_search, web_fetch — are built elsewhere and
    // spread in, so a missing permission there was a type error only after the
    // type was tightened, and before that it was nothing at all.
    //
    // My first version of this test grepped tools.ts for `name: "web_search"`.
    // It does not appear: that tool is constructed in web-search.ts and spread
    // in by reference. The test failed for the right reason and proved my
    // anchor was wrong, not the code — the same too-narrow guard I have found
    // five times this week, this time in my own test.
    const src = read("chat/tools.ts");
    const pushes = [...src.matchAll(/allTools\.push\(\{/g)].map((m) => m.index!);
    expect(pushes.length, "no allTools.push found — the anchor has moved").toBeGreaterThan(0);

    for (const at of pushes) {
      // Bounded to the pushed object: from the push to the next `});` at that
      // indentation, so a later tool's permission cannot satisfy it by accident.
      const end = src.indexOf("\n  });", at);
      const block = src.slice(at, end > at ? end : at + 2000);
      expect(block, `an allTools.push() at index ${at} declares no permission — deny-by-default drops it for EVERYONE, admins included, with no error anywhere`)
        .toMatch(/permission: "/);
    }
  });

  it("web_search and web_fetch specifically — the two F176 silently dropped", () => {
    // F176 flipped the filter to deny-by-default and gave the main array its
    // permissions. These two live outside it, so from that moment they were
    // offered to nobody while the system prompt went on naming both. The
    // security hole became a dead feature: same declaration bug, opposite
    // direction, silent both times.
    const src = read("chat/tools.ts");
    const fetchAt = src.indexOf('name: "web_fetch"');
    expect(fetchAt, "web_fetch not found").toBeGreaterThan(-1);
    expect(src.slice(fetchAt, fetchAt + 1600)).toMatch(/permission: "chat\.use"/);

    // web_search is built in web-search.ts and pushed by reference, so it is
    // the PUSH that must carry the permission.
    const searchAt = src.indexOf("definition: webTool.definition");
    expect(searchAt, "web_search push not found").toBeGreaterThan(-1);
    expect(src.slice(searchAt, searchAt + 400)).toMatch(/permission: "chat\.use"/);
  });

  it("the system prompt still advertises both, so they must exist", () => {
    const prompt = read("chat/system-prompt.ts");
    expect(prompt).toContain("**web_search**");
    expect(prompt).toContain("**web_fetch**");
  });
});
