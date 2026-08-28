import { describe, it, expect, vi } from "vitest";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * THE BASELINE THE ENGINE SWAP IS MEASURED AGAINST.
 *
 * We are about to move the chat off its hand-rolled loop and onto
 * @broberg/chat. The one thing that must NOT change in that move is who is
 * handed which tool. So this records the whole decision surface first — every
 * tool × every role — and the swap is only allowed to move the rows we chose
 * to move.
 *
 * components' rule, 28 Aug 2026, and it is the whole design of this file:
 * assert the COUNT of divergences, not that the expected ones are as expected.
 * "These 3 rows differed as predicted" cannot see a FOURTH; "exactly 3 rows
 * differed" can. Same distinction as counting rows rather than counting
 * failures — and the same one that made the forms door-list blind to two
 * routes it had not been told about.
 *
 * So: the population is DERIVED (every tool the registry hands an admin, every
 * role the permission system defines), never a list maintained by hand.
 */

vi.mock("@/lib/cms", () => ({
  getAdminCms: async () => ({}),
  getAdminConfig: async () => ({ collections: [] }),
}));
vi.mock("@/lib/site-paths", () => ({ getActiveSitePaths: async () => ({}) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const { buildChatTools } = await import("@/lib/chat/tools");
const { resolvePermissions, ROLE_PERMISSIONS } = await import("@/lib/permissions-shared");

const BASELINE = join(dirname(fileURLToPath(import.meta.url)), "chat-tool-matrix.baseline.json");

type Matrix = { tools: string[]; roles: string[]; grants: Record<string, string[]> };

async function measure(): Promise<Matrix> {
  // Every role the permission system defines — not three names I typed.
  const roles = Object.keys(ROLE_PERMISSIONS).sort();
  const grants: Record<string, string[]> = {};
  for (const role of roles) {
    // Sequential, not Promise.all: buildChatTools does a DYNAMIC import of
    // next/headers and concurrent calls race the mock's resolution.
    const tools = await buildChatTools(resolvePermissions(role as "viewer"));
    grants[role] = tools.map((t) => t.definition.name).sort();
  }
  // The full tool population = what an unrestricted principal is offered.
  const tools = (await buildChatTools(["*"])).map((t) => t.definition.name).sort();
  return { tools, roles, grants };
}

describe("the chat tool matrix — the baseline the engine swap must not move", () => {
  it("measured something: every role, and a full tool list", async () => {
    // A matrix that silently came back empty would make every comparison below
    // "0 of 0 agreed" wearing a green tick. The floor is the TRUE minimum for
    // each — not a comfortable number, which is its own way of hiding a find.
    const m = await measure();
    expect(m.roles.length, `roles measured: ${m.roles.join(", ")}`).toBeGreaterThan(1);
    expect(m.tools.length, "no tools in the registry at all").toBeGreaterThan(1);
    for (const role of m.roles) expect(m.grants[role], `no row for ${role}`).toBeDefined();
  });

  it("no role is offered a tool that is not in the registry", async () => {
    const m = await measure();
    const known = new Set(m.tools);
    for (const role of m.roles) {
      const alien = m.grants[role].filter((t) => !known.has(t));
      expect(alien, `${role} was offered tools outside the registry: ${alien.join(", ")}`).toEqual([]);
    }
  });

  it("matches the recorded baseline, cell for cell, and COUNTS what it compared", async () => {
    const m = await measure();

    if (!existsSync(BASELINE)) {
      writeFileSync(BASELINE, JSON.stringify(m, null, 2) + "\n");
      throw new Error(
        `No baseline existed — one has been written to ${BASELINE}. ` +
        `Read it, confirm it describes the CURRENT engine correctly, and commit it. ` +
        `This throws rather than passing quietly: a baseline that records itself and ` +
        `reports success proves nothing at all.`
      );
    }

    const base = JSON.parse(readFileSync(BASELINE, "utf8")) as Matrix;

    // THE COUNT. Every (tool, role) pair is one decision, and the assertion is
    // on how many were compared — so a shrunken registry or a lost role cannot
    // pass by simply having fewer rows to disagree about.
    const cells = base.tools.length * base.roles.length;
    expect(cells, "the baseline itself is empty — nothing would be compared").toBeGreaterThan(100);
    expect(m.tools.length, `tool count moved: ${base.tools.length} → ${m.tools.length}`)
      .toBe(base.tools.length);
    expect(m.roles, "the set of roles changed").toEqual(base.roles);

    // Then the cells themselves, reported as a COUNT of divergences with every
    // one named — never "something differed".
    const diffs: string[] = [];
    for (const role of base.roles) {
      const now = new Set(m.grants[role] ?? []);
      const then = new Set(base.grants[role] ?? []);
      for (const tool of base.tools) {
        const had = then.has(tool), has = now.has(tool);
        if (had !== has) diffs.push(`${role}: ${tool} ${had ? "REVOKED" : "GRANTED"}`);
      }
    }
    expect(diffs.length, `${diffs.length} of ${cells} decisions moved:\n  ${diffs.join("\n  ")}`)
      .toBe(0);
  });
});
