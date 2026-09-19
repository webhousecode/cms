/**
 * F188.1 — a conversation can be stored and READ BACK.
 *
 * The load-bearing assertions are read-backs from a FRESH store instance, with
 * strict equality on the text. A handler that returned 201 and an echo of its
 * own input is indistinguishable from one that stored nothing — that is the
 * failure this repo has met most often, and it fails in the green direction.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { ConversationStore, EmptyConversationError } from "../conversations/store";
import { ROLE_PERMISSIONS, PERMISSIONS, hasPermission } from "../permissions-shared";
import { ALL_PERMISSIONS } from "../access-tokens";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cms-conversations-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const THREE_TURNS = [
  { role: "visitor" as const, text: "Hvad koster et website hos jer?", at: "2026-09-19T08:00:00.000Z" },
  { role: "assistant" as const, text: "Det afhænger af omfanget — må jeg spørge om to ting?", at: "2026-09-19T08:00:04.000Z" },
  { role: "visitor" as const, text: "Ja. Det skal kunne sælge kurser.", at: "2026-09-19T08:00:31.000Z" },
];

describe("ConversationStore", () => {
  it("stores a conversation of 3 turns and reads all 3 back, in order, verbatim", async () => {
    const written = await new ConversationStore(tmpDir).create({
      source: "aidan",
      locale: "da",
      turns: THREE_TURNS,
    });

    // FRESH instance — never the object the writer returned.
    const read = await new ConversationStore(tmpDir).get(written.id);
    expect(read, "conversation did not come back").not.toBeNull();
    expect(read!.turnCount).toBe(3);
    expect(read!.turns).toHaveLength(3);

    // Strict equality per turn, in order. `toContain` would pass on a truncated
    // or prefixed value and has twice hidden a corrupt save in this fleet.
    for (const [i, expected] of THREE_TURNS.entries()) {
      expect(read!.turns[i]!.text).toBe(expected.text);
      expect(read!.turns[i]!.role).toBe(expected.role);
      expect(read!.turns[i]!.at).toBe(expected.at);
    }
    expect(read!.locale).toBe("da");
    expect(read!.source).toBe("aidan");
    expect(read!.startedAt).toBe(THREE_TURNS[0]!.at);
    expect(read!.lastTurnAt).toBe(THREE_TURNS[2]!.at);
  });

  it("lands on disk as its own file — the read-back is not an in-memory cache", async () => {
    const conv = await new ConversationStore(tmpDir).create({ source: "aidan", turns: THREE_TURNS });
    const raw = JSON.parse(
      await fs.readFile(path.join(tmpDir, "conversations", `${conv.id}.json`), "utf-8"),
    );
    expect(raw.turns[2].text).toBe(THREE_TURNS[2]!.text);
  });

  // ── Negative controls ────────────────────────────────────────────────
  // A field that always comes back looking right passes the test above by
  // accident. These prove the store can also say no.

  it("refuses a conversation with no turns — and writes NOTHING", async () => {
    const store = new ConversationStore(tmpDir);
    await expect(store.create({ source: "aidan", turns: [] })).rejects.toThrow(EmptyConversationError);
    // Not even an empty directory of hopeful shells.
    expect(await store.list()).toEqual([]);
    await expect(fs.readdir(path.join(tmpDir, "conversations"))).rejects.toThrow();
  });

  it("refuses turns that are only whitespace — an empty shell with punctuation is still empty", async () => {
    const store = new ConversationStore(tmpDir);
    await expect(
      store.create({ source: "aidan", turns: [{ role: "visitor", text: "   " }] }),
    ).rejects.toThrow(EmptyConversationError);
    expect(await store.list()).toEqual([]);
  });

  it("refuses a conversation with no source", async () => {
    await expect(
      new ConversationStore(tmpDir).create({ source: "  ", turns: THREE_TURNS }),
    ).rejects.toThrow(EmptyConversationError);
  });

  it("an unknown id is null — never an empty conversation that looks stored", async () => {
    const missing = await new ConversationStore(tmpDir).get("11111111-2222-3333-4444-555555555555");
    expect(missing).toBeNull();
  });

  it("an id that is not one of ours cannot read a file outside the site's data dir", async () => {
    // The id arrives from a URL segment, and Next decodes %2F before handing
    // it over — so `..%2F..%2Fforms` would reach path.join() as `../../forms`.
    // Plant a real JSON file one level up and prove the traversal answers null.
    const conversations = path.join(tmpDir, "conversations");
    await fs.mkdir(conversations, { recursive: true });
    await fs.writeFile(path.join(tmpDir, "secret.json"), JSON.stringify({ turns: ["leaked"] }));

    const store = new ConversationStore(tmpDir);
    for (const evil of ["../secret", "..%2Fsecret", "../../etc/passwd", "secret", ""]) {
      expect(await store.get(evil), `traversal via ${JSON.stringify(evil)}`).toBeNull();
    }

    // Positive control: a real id still reads back, so the guard is not "null for everything".
    const conv = await store.create({ source: "aidan", turns: THREE_TURNS });
    expect(await new ConversationStore(tmpDir).get(conv.id)).not.toBeNull();
  });

  it("lists without turns, newest last-turn first", async () => {
    const store = new ConversationStore(tmpDir);
    await store.create({ source: "aidan", turns: [{ role: "visitor", text: "gammel", at: "2026-01-01T00:00:00.000Z" }] });
    await store.create({ source: "aidan", turns: [{ role: "visitor", text: "ny", at: "2026-09-01T00:00:00.000Z" }] });

    const list = await new ConversationStore(tmpDir).list();
    expect(list).toHaveLength(2);
    expect(list[0]!.lastTurnAt).toBe("2026-09-01T00:00:00.000Z");
    expect(list[0]!.turnCount).toBe(1);
    expect(list[0]).not.toHaveProperty("turns");
  });

  it("two sites' data directories never see each other's conversations", async () => {
    // AC3's storage half: the store is scoped by the dataDir it is handed.
    // WHICH dataDir a request gets is decided in proxy.ts → cookies →
    // getActiveSitePaths(), asserted separately below.
    const tenantA = path.join(tmpDir, "a");
    const tenantB = path.join(tmpDir, "b");
    const a = await new ConversationStore(tenantA).create({ source: "aidan", turns: THREE_TURNS });

    expect(await new ConversationStore(tenantB).list()).toEqual([]);
    expect(await new ConversationStore(tenantB).get(a.id)).toBeNull();
    expect(await new ConversationStore(tenantA).get(a.id)).not.toBeNull();
  });
});

// ── The routes ───────────────────────────────────────────────────────────
// Source-level guards, same pattern as site-domains-route.test.ts: they are
// what catches a NEW route added under this directory without a gate.

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const API_DIR = join(SRC, "app/api/conversations");
const routeFiles = execFileSync("find", [API_DIR, "-name", "route.ts"], { encoding: "utf8" })
  .trim().split("\n").filter(Boolean)
  .map((abs) => relative(SRC, abs)).sort();

describe("every door onto conversations is permission-gated", () => {
  it("found the routes it thinks it found", () => {
    // A find that silently matches nothing turns the loop below into
    // "0 of 0 passed" wearing a green tick.
    expect(routeFiles.length, "no route.ts found under app/api/conversations").toBeGreaterThan(1);
  });

  it.each(routeFiles)("%s gates every verb it exports", (rel) => {
    const src = readFileSync(join(SRC, rel), "utf-8");
    const verbs = [...src.matchAll(/export async function (GET|POST|PATCH|PUT|DELETE)\(/g)].map((m) => m[1]!);
    expect(verbs.length, `${rel}: no HTTP verbs found — guard scanned nothing`).toBeGreaterThan(0);
    for (const verb of verbs) {
      const start = src.indexOf(`export async function ${verb}(`);
      const next = src.indexOf("export async function ", start + 10);
      const body = src.slice(start, next === -1 ? undefined : next);
      expect(body, `${rel}: ${verb} is ungated`).toMatch(/requirePermission\("conversations\.(read|write)"\)/);
    }
  });

  it("recording asks for write, reading asks for read", () => {
    const list = readFileSync(join(API_DIR, "route.ts"), "utf-8");
    const post = list.slice(list.indexOf("export async function POST("), list.indexOf("export async function GET("));
    expect(post).toContain('requirePermission("conversations.write")');
    const get = list.slice(list.indexOf("export async function GET("));
    expect(get).toContain('requirePermission("conversations.read")');
  });

  it("site context comes from proxy.ts, never from the route reading ?site=", () => {
    // House rule: `?site=` is resolved ONCE in proxy.ts, which injects the
    // cms-active-* cookies. A route that resolves it itself re-creates the
    // cross-tenant misroute class this repo has a hard rule about.
    for (const rel of routeFiles) {
      const src = readFileSync(join(SRC, rel), "utf-8");
      expect(src, `${rel} reads ?site= itself`).not.toMatch(/searchParams\.get\(\s*["']site["']\s*\)/);
      expect(src, `${rel} does not resolve site paths at all`).toContain("getActiveSitePaths()");
    }
  });

  it("an unknown id answers 404, not 200 with nothing in it", () => {
    const src = readFileSync(join(API_DIR, "[id]", "route.ts"), "utf-8");
    expect(src).toContain("status: 404");
  });
});

describe("who may see visitors' conversations", () => {
  it("both permissions exist and are described", () => {
    expect(PERMISSIONS["conversations.read"]).toBeTruthy();
    expect(PERMISSIONS["conversations.write"]).toBeTruthy();
  });

  it("a viewer gets NEITHER — a chat log is other people's words", () => {
    expect(hasPermission(ROLE_PERMISSIONS.viewer, "conversations.read")).toBe(false);
    expect(hasPermission(ROLE_PERMISSIONS.viewer, "conversations.write")).toBe(false);
  });

  it("the viewer still carries the reads it is FOR", () => {
    // Without this, deleting the viewer role entirely would also pass above.
    expect(hasPermission(ROLE_PERMISSIONS.viewer, "content.read")).toBe(true);
    expect(hasPermission(ROLE_PERMISSIONS.viewer, "media.read")).toBe(true);
  });

  it("an editor may READ the inbox but never WRITE the record", () => {
    expect(hasPermission(ROLE_PERMISSIONS.editor, "conversations.read")).toBe(true);
    expect(hasPermission(ROLE_PERMISSIONS.editor, "conversations.write")).toBe(false);
  });

  it("an admin has both", () => {
    expect(hasPermission(ROLE_PERMISSIONS.admin, "conversations.read")).toBe(true);
    expect(hasPermission(ROLE_PERMISSIONS.admin, "conversations.write")).toBe(true);
  });

  it("a site's access token can be granted the recording permission", () => {
    // requirePermission maps "conversations.write" → "conversations:write" for
    // Bearer callers. Missing from the catalogue, the token evaluator would
    // fail closed and the site's own POST would 403 — with the role checks
    // above still green.
    expect(ALL_PERMISSIONS).toContain("conversations:write");
    expect(ALL_PERMISSIONS).toContain("conversations:read");
  });
});
