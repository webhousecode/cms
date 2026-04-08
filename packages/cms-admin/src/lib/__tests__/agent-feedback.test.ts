/**
 * Phase 2 — agent feedback storage tests.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

let TMP_DIR = "";

vi.mock("../site-paths", () => ({
  getActiveSitePaths: async () => ({
    dataDir: TMP_DIR,
    contentDir: TMP_DIR,
    uploadDir: TMP_DIR,
  }),
}));

import {
  appendFeedback,
  readFeedback,
  loadFeedbackForPrompt,
  loadRejectionsForPrompt,
  recordCorrectionsFromDiff,
} from "../agent-feedback";

beforeEach(async () => {
  TMP_DIR = await fs.mkdtemp(path.join(os.tmpdir(), "agent-feedback-"));
});

describe("agent-feedback storage", () => {
  it("returns empty array when no feedback exists", async () => {
    expect(await readFeedback("missing-agent")).toEqual([]);
  });

  it("appends and reads back a correction entry", async () => {
    const entry = await appendFeedback("agent-1", {
      type: "correction",
      field: "title",
      original: "Hello",
      corrected: "Hello, world",
    });
    expect(entry.id).toMatch(/^fb-/);
    expect(entry.createdAt).toBeTruthy();

    const all = await readFeedback("agent-1");
    expect(all).toHaveLength(1);
    expect(all[0].field).toBe("title");
    expect(all[0].corrected).toBe("Hello, world");
  });

  it("appends multiple entries in order", async () => {
    await appendFeedback("agent-1", { type: "correction", field: "a", original: "x", corrected: "y" });
    await appendFeedback("agent-1", { type: "rejection", notes: "too long" });
    await appendFeedback("agent-1", { type: "edit", field: "b", original: "1", corrected: "2" });
    const all = await readFeedback("agent-1");
    expect(all).toHaveLength(3);
    expect(all.map((e) => e.type)).toEqual(["correction", "rejection", "edit"]);
  });

  it("isolates feedback by agentId", async () => {
    await appendFeedback("agent-a", { type: "correction", field: "t", original: "o", corrected: "c" });
    await appendFeedback("agent-b", { type: "rejection", notes: "nope" });
    expect(await readFeedback("agent-a")).toHaveLength(1);
    expect(await readFeedback("agent-b")).toHaveLength(1);
    expect((await readFeedback("agent-a"))[0].type).toBe("correction");
  });

  it("reads legacy { original, corrected } entries as corrections", async () => {
    const dir = path.join(TMP_DIR, "agents", "legacy-agent");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, "feedback.json"),
      JSON.stringify([{ original: "old", corrected: "new" }]),
    );
    const all = await readFeedback("legacy-agent");
    expect(all).toHaveLength(1);
    expect(all[0].type).toBe("correction");
    expect(all[0].original).toBe("old");
    expect(all[0].corrected).toBe("new");
  });
});

describe("loadFeedbackForPrompt", () => {
  it("returns the most recent corrections in chronological order", async () => {
    await appendFeedback("a", { type: "correction", field: "f", original: "1", corrected: "1b" });
    await appendFeedback("a", { type: "correction", field: "f", original: "2", corrected: "2b" });
    await appendFeedback("a", { type: "correction", field: "f", original: "3", corrected: "3b" });
    const out = await loadFeedbackForPrompt("a", 2);
    expect(out).toHaveLength(2);
    // Most recent two, in chronological order
    expect(out.map((e) => e.original)).toEqual(["2", "3"]);
  });

  it("skips rejections (no corrected text)", async () => {
    await appendFeedback("a", { type: "rejection", notes: "bad" });
    await appendFeedback("a", { type: "correction", field: "f", original: "x", corrected: "y" });
    const out = await loadFeedbackForPrompt("a");
    expect(out).toHaveLength(1);
    expect(out[0].original).toBe("x");
  });

  it("skips entries missing original or corrected", async () => {
    await appendFeedback("a", { type: "correction", field: "f", original: "x" });
    await appendFeedback("a", { type: "correction", field: "f", corrected: "y" });
    const out = await loadFeedbackForPrompt("a");
    expect(out).toHaveLength(0);
  });
});

describe("loadRejectionsForPrompt", () => {
  it("returns the most recent rejection notes in chronological order", async () => {
    await appendFeedback("a", { type: "rejection", notes: "too dry" });
    await appendFeedback("a", { type: "rejection", notes: "too long" });
    await appendFeedback("a", { type: "rejection", notes: "missing examples" });
    const out = await loadRejectionsForPrompt("a", 2);
    expect(out).toHaveLength(2);
    expect(out).toEqual(["too long", "missing examples"]);
  });

  it("skips corrections (no notes)", async () => {
    await appendFeedback("a", { type: "correction", field: "f", original: "x", corrected: "y" });
    await appendFeedback("a", { type: "rejection", notes: "tone is off" });
    const out = await loadRejectionsForPrompt("a");
    expect(out).toEqual(["tone is off"]);
  });

  it("skips rejections with empty notes", async () => {
    await appendFeedback("a", { type: "rejection", notes: "" });
    await appendFeedback("a", { type: "rejection", notes: "   " });
    await appendFeedback("a", { type: "rejection", notes: "real note" });
    const out = await loadRejectionsForPrompt("a");
    expect(out).toEqual(["real note"]);
  });

  it("returns empty array when there are no rejections", async () => {
    await appendFeedback("a", { type: "correction", field: "f", original: "x", corrected: "y" });
    expect(await loadRejectionsForPrompt("a")).toEqual([]);
  });
});

describe("recordCorrectionsFromDiff", () => {
  it("records one correction per changed string field", async () => {
    const n = await recordCorrectionsFromDiff({
      agentId: "diff-agent",
      queueItemId: "qi-1",
      original: { title: "Old", body: "same", excerpt: "before" },
      corrected: { title: "New", body: "same", excerpt: "after" },
    });
    expect(n).toBe(2);
    const all = await readFeedback("diff-agent");
    expect(all).toHaveLength(2);
    const fields = all.map((e) => e.field).sort();
    expect(fields).toEqual(["excerpt", "title"]);
    for (const e of all) {
      expect(e.queueItemId).toBe("qi-1");
      expect(e.type).toBe("correction");
    }
  });

  it("records nothing when nothing changed", async () => {
    const n = await recordCorrectionsFromDiff({
      agentId: "diff-agent-2",
      queueItemId: "qi-2",
      original: { title: "Same" },
      corrected: { title: "Same" },
    });
    expect(n).toBe(0);
    expect(await readFeedback("diff-agent-2")).toHaveLength(0);
  });

  it("ignores non-string fields (arrays, numbers, objects)", async () => {
    const n = await recordCorrectionsFromDiff({
      agentId: "diff-agent-3",
      queueItemId: "qi-3",
      original: { tags: ["a"], count: 1, meta: { x: 1 }, title: "old" },
      corrected: { tags: ["a", "b"], count: 2, meta: { x: 2 }, title: "new" },
    });
    expect(n).toBe(1);
    const all = await readFeedback("diff-agent-3");
    expect(all[0].field).toBe("title");
  });
});
