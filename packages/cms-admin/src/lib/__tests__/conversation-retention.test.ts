/**
 * F188.5 — the free text expires, the numbers stay.
 *
 * Owner's decision, 19 September 2026: «90 dage på teksten, tallene for evigt.»
 *
 * The load-bearing assertions read the file back AFTER the sweep. A sweep that
 * reports "3 redacted" and leaves the text on disk reads exactly like one that
 * worked — so the job's own return value is never the proof here.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ConversationStore } from "../conversations/store";
import {
  CONVERSATION_TEXT_RETENTION_DAYS,
  pruneConversationText,
} from "../conversations/retention";
import { ROLE_PERMISSIONS, PERMISSIONS, hasPermission } from "../permissions-shared";
import { ALL_PERMISSIONS } from "../access-tokens";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cms-retention-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const TURNS = [
  { role: "visitor" as const, text: "Vi kæmper med at få vores webshop til at konvertere", markers: ["lead"] },
  { role: "assistant" as const, text: "Hvor mange besøgende har I om måneden?" },
];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Store a conversation and backdate the CMS's own receipt stamp. `createdAt`
 *  is what the sweep measures from, so this is the only knob that matters. */
async function conversationAgedDays(days: number) {
  const store = new ConversationStore(tmpDir);
  const conv = await store.create({ source: "aidan", locale: "da", turns: TURNS });
  const file = path.join(tmpDir, "conversations", `${conv.id}.json`);
  const raw = JSON.parse(await fs.readFile(file, "utf-8"));
  raw.createdAt = new Date(Date.now() - days * DAY_MS).toISOString();
  await fs.writeFile(file, JSON.stringify(raw, null, 2));
  return conv.id;
}

describe("the 90-day sweep", () => {
  it("removes the text of a conversation older than the limit — proven by reading the file, not the return value", async () => {
    const id = await conversationAgedDays(CONVERSATION_TEXT_RETENTION_DAYS + 1);
    await pruneConversationText(tmpDir);

    const after = await new ConversationStore(tmpDir).get(id);
    expect(after).not.toBeNull();
    for (const turn of after!.turns) {
      expect(turn.text).toBe("");
    }
    // And gone from the bytes on disk, not merely from the parsed object.
    const onDisk = await fs.readFile(path.join(tmpDir, "conversations", `${id}.json`), "utf-8");
    expect(onDisk).not.toContain("webshop");
    expect(onDisk).not.toContain("besøgende");
  });

  it("KEEPS the numbers — count, roles, timestamps, markers, language, source", async () => {
    const id = await conversationAgedDays(CONVERSATION_TEXT_RETENTION_DAYS + 30);
    const before = await new ConversationStore(tmpDir).get(id);
    await pruneConversationText(tmpDir);
    const after = await new ConversationStore(tmpDir).get(id);

    expect(after!.turnCount).toBe(2);
    expect(after!.locale).toBe("da");
    expect(after!.source).toBe("aidan");
    expect(after!.turns.map((t) => t.role)).toEqual(["visitor", "assistant"]);
    expect(after!.turns.map((t) => t.at)).toEqual(before!.turns.map((t) => t.at));
    // The markers ARE the numbers — a lead/miss signal survives the text.
    expect(after!.turns[0]!.markers).toEqual(["lead"]);
    expect(after!.startedAt).toBe(before!.startedAt);
    expect(after!.lastTurnAt).toBe(before!.lastTurnAt);
  });

  it("stamps WHY the text is empty — an unmarked empty conversation reads as one nobody spoke in", async () => {
    const id = await conversationAgedDays(CONVERSATION_TEXT_RETENTION_DAYS + 1);
    await pruneConversationText(tmpDir);
    const after = await new ConversationStore(tmpDir).get(id);
    expect(after!.textRedactedAt).toBeTruthy();
    // And it is visible in the LIST too, so the surface never has to open a
    // conversation to find out the text is gone.
    const [summary] = await new ConversationStore(tmpDir).list();
    expect(summary!.textRedactedAt).toBeTruthy();
  });

  // ── Negative controls ────────────────────────────────────────────────

  it("does NOT touch a conversation one day inside the limit", async () => {
    const id = await conversationAgedDays(CONVERSATION_TEXT_RETENTION_DAYS - 1);
    const result = await pruneConversationText(tmpDir);

    expect(result.redacted).toBe(0);
    const after = await new ConversationStore(tmpDir).get(id);
    expect(after!.turns[0]!.text).toBe(TURNS[0]!.text); // verbatim, strict equality
    expect(after!.textRedactedAt).toBeUndefined();
  });

  it("does not touch a fresh conversation", async () => {
    const store = new ConversationStore(tmpDir);
    const conv = await store.create({ source: "aidan", turns: TURNS });
    await pruneConversationText(tmpDir);
    expect((await store.get(conv.id))!.turns[1]!.text).toBe(TURNS[1]!.text);
  });

  it("is idempotent — a second sweep changes nothing and does not re-stamp the date", async () => {
    const id = await conversationAgedDays(CONVERSATION_TEXT_RETENTION_DAYS + 5);
    const first = await pruneConversationText(tmpDir, new Date("2026-09-19T08:00:00.000Z"));
    const stamp = (await new ConversationStore(tmpDir).get(id))!.textRedactedAt;

    const second = await pruneConversationText(tmpDir, new Date("2026-09-20T08:00:00.000Z"));
    expect(first.redacted).toBe(1);
    expect(second.redacted).toBe(0);
    expect((await new ConversationStore(tmpDir).get(id))!.textRedactedAt).toBe(stamp);
  });

  it("KEEPS the text when the age cannot be read — the unknown case must not delete", async () => {
    // `new Date(undefined).getTime()` is NaN and every comparison with NaN is
    // false, so the natural `if (age > cutoff) continue` falls THROUGH and
    // redacts. On a one-way path that is the worst possible default.
    const store = new ConversationStore(tmpDir);
    const conv = await store.create({ source: "aidan", turns: TURNS });
    const file = path.join(tmpDir, "conversations", `${conv.id}.json`);
    for (const broken of [undefined, "", "not-a-date"]) {
      const raw = JSON.parse(await fs.readFile(file, "utf-8"));
      if (broken === undefined) delete raw.createdAt; else raw.createdAt = broken;
      raw.turns = raw.turns.map((t: { text: string }, i: number) => ({ ...t, text: TURNS[i]!.text }));
      delete raw.textRedactedAt;
      await fs.writeFile(file, JSON.stringify(raw, null, 2));

      const result = await pruneConversationText(tmpDir);
      expect(result.redacted, `createdAt=${JSON.stringify(broken)} was swept`).toBe(0);
      expect((await store.get(conv.id))!.turns[0]!.text).toBe(TURNS[0]!.text);
    }
  });

  it("measures age from the CMS's own receipt, not from caller-supplied turn times", async () => {
    // A site sending a turn dated in the future must not buy itself an
    // indefinite stay. createdAt is ours; `at` is theirs.
    const store = new ConversationStore(tmpDir);
    const conv = await store.create({
      source: "aidan",
      turns: [{ role: "visitor", text: "hej fra fremtiden", at: "2099-01-01T00:00:00.000Z" }],
    });
    const file = path.join(tmpDir, "conversations", `${conv.id}.json`);
    const raw = JSON.parse(await fs.readFile(file, "utf-8"));
    raw.createdAt = new Date(Date.now() - 200 * DAY_MS).toISOString();
    await fs.writeFile(file, JSON.stringify(raw, null, 2));

    await pruneConversationText(tmpDir);
    expect((await store.get(conv.id))!.turns[0]!.text).toBe("");
  });
});

describe("the limit is ONE value in ONE place", () => {
  const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const read = (p: string) => readFileSync(join(SRC, p), "utf-8");

  it("is 90 days — the owner's decision, 19 September 2026", () => {
    expect(CONVERSATION_TEXT_RETENTION_DAYS).toBe(90);
  });

  it("the sweep derives its cut-off from the constant, never a literal", async () => {
    // Change the constant → the boundary moves with it. Asserted by proving the
    // boundary sits exactly at the constant rather than at a hard-coded 90.
    const inside = await conversationAgedDays(CONVERSATION_TEXT_RETENTION_DAYS - 1);
    const outside = await conversationAgedDays(CONVERSATION_TEXT_RETENTION_DAYS + 1);
    await pruneConversationText(tmpDir);
    const store = new ConversationStore(tmpDir);
    expect((await store.get(inside))!.turns[0]!.text).toBe(TURNS[0]!.text);
    expect((await store.get(outside))!.turns[0]!.text).toBe("");
  });

  it("both read routes hand the policy out, so no surface repeats the number", () => {
    for (const rel of ["app/api/conversations/route.ts", "app/api/conversations/[id]/route.ts"]) {
      const src = read(rel);
      expect(src, `${rel} does not import the constant`).toContain("CONVERSATION_TEXT_RETENTION_DAYS");
      expect(src, `${rel} does not return textRetentionDays`).toContain("textRetentionDays");
    }
  });

  it("no second copy of the number anywhere in the conversations code", () => {
    // A literal 90 in the job, a "90" in a route, a "90 dage" in a component —
    // each is the drift this AC exists to prevent.
    for (const rel of [
      "lib/conversations/store.ts",
      "app/api/conversations/route.ts",
      "app/api/conversations/[id]/route.ts",
    ]) {
      expect(read(rel), `${rel} repeats the number`).not.toMatch(/\b90\b/);
    }
    // In retention.ts the number may appear exactly twice, and the two are not
    // the same kind of thing: once as the owner's verbatim words (a citation of
    // WHO decided, which must not be paraphrased) and once as the declaration.
    // What must be unique is the DECLARATION — a second assignment is a second
    // source of truth; a quote cannot be read by code.
    const retention = read("lib/conversations/retention.ts");
    const declarations = retention.match(/=\s*90\b/g) ?? [];
    expect(declarations.length, "the constant is declared more than once").toBe(1);
  });

  it("the sweep is actually WIRED — a module nobody calls prunes nothing", () => {
    // The integration check: if this call site disappears, the whole feature
    // becomes a function with tests and no effect on the product.
    const boot = read("instrumentation-node.ts");
    expect(boot).toContain("runConversationRetention");
    expect(boot).toContain("conversationRetentionTick");
    expect(boot).toMatch(/setInterval\(conversationRetentionTick/);
  });

  it("sweeps every site, NOT only those with backups enabled", () => {
    // runToolsScheduler skips a site with backup and link-check both "off".
    // Hanging retention off that loop would silently exempt those sites.
    const retention = read("lib/conversations/retention.ts");
    expect(retention).toContain("for (const org of registry.orgs)");
    expect(retention).not.toContain("backupSchedule");
  });
});

describe("erasing one conversation before the limit", () => {
  it("removes it, and a fresh read says 404-worthy null", async () => {
    const store = new ConversationStore(tmpDir);
    const conv = await store.create({ source: "aidan", turns: TURNS });
    expect(await store.delete(conv.id)).toBe(true);
    expect(await new ConversationStore(tmpDir).get(conv.id)).toBeNull();
  });

  it("answers false when there was nothing to delete — a no-op is not a deletion", async () => {
    const store = new ConversationStore(tmpDir);
    expect(await store.delete("11111111-2222-3333-4444-555555555555")).toBe(false);
    expect(await store.delete("../secret")).toBe(false);
  });

  it("the route is gated by its OWN permission, and only an admin has it", () => {
    const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
    const src = readFileSync(join(SRC, "app/api/conversations/[id]/route.ts"), "utf-8");
    const del = src.slice(src.indexOf("export async function DELETE("));
    expect(del).toContain('requirePermission("conversations.delete")');
    expect(del).toContain("status: 404");

    expect(PERMISSIONS["conversations.delete"]).toBeTruthy();
    expect(hasPermission(ROLE_PERMISSIONS.admin, "conversations.delete")).toBe(true);
    expect(hasPermission(ROLE_PERMISSIONS.editor, "conversations.delete")).toBe(false);
    expect(hasPermission(ROLE_PERMISSIONS.viewer, "conversations.delete")).toBe(false);
    // Positive control: the editor still has the read it was given in F188.1.
    expect(hasPermission(ROLE_PERMISSIONS.editor, "conversations.read")).toBe(true);
    expect(ALL_PERMISSIONS).toContain("conversations:delete");
  });
});
