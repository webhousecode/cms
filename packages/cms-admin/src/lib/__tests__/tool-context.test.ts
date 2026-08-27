import { describe, it, expect } from "vitest";
import {
  buildToolCtx,
  ToolPermissionError,
  type ToolEngine,
} from "@/lib/chat/tool-context";

/**
 * A fake engine that RECORDS whether it was reached.
 *
 * That recording is the whole test. "The write was refused" is satisfied by a
 * tool that checks a permission itself and throws — which is exactly the shape
 * we are moving away from. What must be true is that the engine was NEVER
 * TOUCHED: the refusal happened before the tool could act, in the ctx.
 */
function fakeEngine() {
  const reached: string[] = [];
  const engine: ToolEngine = {
    async findOne(c, s) { reached.push(`findOne:${c}/${s}`); return { c, s }; },
    async findMany(c) { reached.push(`findMany:${c}`); return []; },
    async create(c) { reached.push(`create:${c}`); return { ok: true }; },
    async update(c, id) { reached.push(`update:${c}/${id}`); return { ok: true }; },
  };
  return { engine, reached };
}

/** A tool written the way a tool SHOULD be: it never checks a permission. */
async function aToolThatWrites(ctx: { updateDoc: (c: string, i: string, d: Record<string, unknown>) => Promise<unknown> }) {
  return ctx.updateDoc("posts", "hello", { title: "ændret" });
}

describe("components' test — a read caller's ctx refuses a write, IN the ctx", () => {
  it("the engine is never reached", async () => {
    const { engine, reached } = fakeEngine();
    const ctx = buildToolCtx(engine, ["content.read"]);

    await expect(aToolThatWrites(ctx)).rejects.toBeInstanceOf(ToolPermissionError);

    // The assertion that distinguishes "the ctx refused" from "the tool refused".
    expect(reached, "the engine was reached despite the caller lacking content.edit").toEqual([]);
  });

  it("the refusal names the permission and the operation", async () => {
    const { engine } = fakeEngine();
    const ctx = buildToolCtx(engine, ["content.read"]);
    const err = (await aToolThatWrites(ctx).catch((e) => e)) as ToolPermissionError;
    expect(err.permission).toBe("content.edit");
    expect(err.operation).toContain("posts/hello");
    // An editor reads this. It must say what is missing, not "forbidden".
    expect(err.message).toContain("content.edit");
  });

  it("POSITIVE CONTROL — the same tool works when the caller may write", async () => {
    // Without this, a ctx that refused EVERYTHING would pass the test above.
    const { engine, reached } = fakeEngine();
    const ctx = buildToolCtx(engine, ["content.read", "content.edit"]);
    await expect(aToolThatWrites(ctx)).resolves.toEqual({ ok: true });
    expect(reached).toEqual(["update:posts/hello"]);
  });
});

describe("each operation is gated on its own permission", () => {
  const cases: Array<[string, string[], (c: ReturnType<typeof buildToolCtx>) => Promise<unknown>]> = [
    ["content.read", ["content.read"], (c) => c.readDoc("posts", "x")],
    ["content.read", ["content.read"], (c) => c.listDocs("posts")],
    ["content.create", ["content.create"], (c) => c.createDoc("posts", {})],
    ["content.edit", ["content.edit"], (c) => c.updateDoc("posts", "x", {})],
  ];

  for (const [perm, granted, call] of cases) {
    it(`${perm} — allowed with it, refused without`, async () => {
      const ok = fakeEngine();
      await expect(call(buildToolCtx(ok.engine, granted))).resolves.toBeDefined();
      expect(ok.reached).toHaveLength(1);

      const no = fakeEngine();
      // Granted something REAL but unrelated, so the refusal cannot be an
      // artefact of an empty permission list.
      await expect(call(buildToolCtx(no.engine, ["media.read"]))).rejects.toBeInstanceOf(ToolPermissionError);
      expect(no.reached).toEqual([]);
    });
  }

  it("an admin's wildcard passes every gate", async () => {
    const { engine, reached } = fakeEngine();
    const ctx = buildToolCtx(engine, ["*"]);
    await ctx.readDoc("posts", "x");
    await ctx.createDoc("posts", {});
    await ctx.updateDoc("posts", "x", {});
    expect(reached).toHaveLength(3);
  });

  it("a tool can read what the caller holds, but cannot widen it", async () => {
    const { engine } = fakeEngine();
    const ctx = buildToolCtx(engine, ["content.read"]);
    expect(ctx.granted).toEqual(["content.read"]);
    // FOUND BY THIS TEST, and it was real: the first version handed out the
    // same array the gate read, so a tool could widen its own permissions and
    // then write. `readonly` is compile-time only. Both directions are pinned:
    // the list is frozen, AND widening it cannot open the gate even if a
    // future change unfreezes it.
    expect(Object.isFrozen(ctx.granted)).toBe(true);
    try { (ctx.granted as string[]).push("content.edit"); } catch { /* frozen */ }
    await expect(aToolThatWrites(ctx)).rejects.toBeInstanceOf(ToolPermissionError);
  });
});
