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

const { buildChatTools, CHAT_TOOL_ENGINE } = await import("@/lib/chat/tools");
const { resolvePermissions, ROLE_PERMISSIONS } = await import("@/lib/permissions-shared");

const BASELINE = join(dirname(fileURLToPath(import.meta.url)), "chat-tool-matrix.baseline.json");

type Matrix = { engine: string; tools: string[]; roles: string[]; grants: Record<string, string[]> };

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
  // Provenance travels WITH the measurement, so a run cannot report agreement
  // without saying what it agreed about.
  return { engine: CHAT_TOOL_ENGINE, tools, roles, grants };
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

    // WHO ANSWERED. components, 28 Aug 2026 — the last hole in this proof:
    // comparing the old path against ITSELF also yields 0 of 195. If the flag
    // was never set in the test environment, if the import still resolves to
    // the old registry, if the new builder was never called, the run is green
    // and empty. So the engine is part of the comparison, not a footnote.
    expect(m.engine, `the engine that answered changed: "${base.engine}" → "${m.engine}". If you swapped to @broberg/chat, update the baseline deliberately. If you MEANT to swap and this still says "${base.engine}", the new path was never exercised and the 0 below means nothing.`)
      .toBe(base.engine);

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

describe("the swap itself — what this file cannot yet prove", () => {
  // The baseline records engine="legacy-inline" because that is what answered.
  // Nothing here has ever measured the matrix THROUGH @broberg/chat, and no
  // green run should be read as if it had.
  it.todo("the 195 decisions are measured through @broberg/chat — deferred until the swap is wired");
});

describe("the engine marker cannot drift from the engine", () => {
  // The marker alone is a label someone types. The source check alone cannot
  // see a runtime flag. Neither is worth much; together they cannot both be
  // wrong in the same direction without someone noticing.
  const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
  const src = readFileSync(join(SRC, "chat/tools.ts"), "utf8");
  const codeLines = src.split("\n").filter((l) => {
    const t = l.trim();
    return t && !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
  });

  it("read the source it thinks it read", () => {
    expect(codeLines.length, "no code lines — this guard scanned nothing").toBeGreaterThan(1);
  });

  // Extracted so BOTH branches can be exercised. @broberg/chat is not a
  // dependency yet, so against the real file only the "legacy" branch can
  // ever run — and a conditional whose other half has never executed is an
  // assertion nobody has read. The predicate is pure, so both halves are
  // proven below on synthetic input, and the real file then only has to pick
  // a branch that is known to work.
  // Judged on the JOINED source, not line by line. The first version tested
  // each line for /^import .*"@broberg\/chat"/ and could not see a multi-line
  // import — which is how a real one is usually written once it pulls in more
  // than one name:
  //
  //     import {
  //       defineTool,
  //     } from "@broberg/chat";
  //
  // No single line both starts with `import` AND names the package, so the
  // predicate answered "not imported" on a file that imports it. It fails
  // LOUD rather than silent (the marker check goes red), but red for the
  // wrong reason is still a wrong answer, and it would have arrived on the
  // day of the swap. [^;] keeps the match inside one statement so an earlier
  // unrelated `import` cannot reach across into this one.
  const importsEngine = (lines: string[]) =>
    /^import(?:[^;]*?)from\s*["']@broberg\/chat["']/m.test(lines.join("\n"));

  it("the import predicate answers both ways", () => {
    expect(importsEngine(['import { defineTool } from "@broberg/chat";'])).toBe(true);
    expect(importsEngine(["import {", "  defineTool,", '} from "@broberg/chat";']),
      "multi-line import not recognised").toBe(true);
    expect(importsEngine(['import type { T } from "@broberg/chat";'])).toBe(true);
    expect(importsEngine(['import { x } from "@/lib/cms";'])).toBe(false);
    // Not fooled by the package name in prose or in a string — this very file
    // names @broberg/chat in a comment, so a substring match would have called
    // that an import and been green and wrong on its own source.
    expect(importsEngine(['const s = "@broberg/chat";'])).toBe(false);
    // And an earlier unrelated import must not reach across a statement break.
    expect(importsEngine(['import { a } from "x";', 'const s = "@broberg/chat";'])).toBe(false);
  });

  // DEFERRED, AND SAID OUT LOUD. components, 28 Aug 2026: an unreachable
  // branch is not covered, it is deferred — and the deferral has to be visible
  // rather than swallowed by a green suite. @broberg/chat is not a dependency
  // here, so against the REAL file only the legacy branch can ever run. The
  // predicate is proven both ways above; what is unproven is the wiring — that
  // the real file's imports drive the non-legacy branch. This line is what
  // stops "no reds" from reading as "all covered".
  it.todo("the non-legacy branch runs against the real file — deferred until @broberg/chat is a dependency");

  it("says 'legacy-inline' only while the file really is the hand-rolled registry", () => {
    const importsBroberg = importsEngine(codeLines);
    if (CHAT_TOOL_ENGINE === "legacy-inline") {
      expect(importsBroberg,
        'CHAT_TOOL_ENGINE still says "legacy-inline" but the file imports @broberg/chat — ' +
        "the marker is stale, so the matrix would report the wrong provenance.")
        .toBe(false);
    } else {
      expect(importsBroberg,
        `CHAT_TOOL_ENGINE says "${CHAT_TOOL_ENGINE}" but the file does not import @broberg/chat — ` +
        "the marker was flipped without the swap, which is the exact false-green it exists to prevent.")
        .toBe(true);
    }
  });
});
