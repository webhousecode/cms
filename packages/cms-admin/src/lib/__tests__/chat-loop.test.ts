import { describe, it, expect } from "vitest";
import { frameToEvents } from "@/lib/chat/frames";
import {
  maxInputTokens, estimateDanish, resolveProfile, buildHistoryConfig,
  TOOL_SCHEMA_TOKENS, CHARS_PER_TOKEN, ASSUMED_CONTEXT_TOKENS,
} from "@/lib/chat/history-config";
import type { ChatFrame } from "@broberg/chat";

/**
 * The conversation loop moved to @broberg/chat. These are the two halves that
 * are OURS and therefore ours to prove: what a frame becomes on the wire, and
 * how long a conversation may get.
 */

describe("every frame the engine can emit reaches the user as something", () => {
  // DERIVED FROM THE TYPE, not a list I typed. If the package adds a frame
  // kind, this array is where it has to be added — and the exhaustiveness
  // check in frames.ts (a switch over the union) makes the compiler say so.
  const KINDS: ChatFrame["type"][] = [
    "text", "tool-call", "tool-result", "history", "limit", "error", "done",
  ];

  const sample = (t: ChatFrame["type"]): ChatFrame => {
    switch (t) {
      case "text": return { type: "text", text: "hej" };
      case "tool-call": return { type: "tool-call", id: "1", name: "list_documents", args: {} };
      case "tool-result": return { type: "tool-result", id: "1", name: "list_documents", result: "ok" };
      case "history": return { type: "history", action: "reduced", note: "Ældre beskeder er sammenfattet.", dropped: 4 };
      case "limit": return { type: "limit", reason: "cap-reached" as never, note: "Grænsen er nået." };
      case "error": return { type: "error", scope: "tool", name: "x", message: "boom" };
      case "done": return { type: "done", reason: "complete" };
    }
  };

  it("no frame kind is silently dropped", () => {
    // THE COUNT, not "the ones I checked". A frame that produces nothing is
    // a user who is told nothing — which for `history` and `limit` is exactly
    // the failure mode they exist to prevent.
    const empty = KINDS.filter((k) => frameToEvents(sample(k)).length === 0);
    expect(empty, `frames that produced no event at all: ${empty.join(", ")}`).toEqual([]);
    expect(KINDS.length, "the frame list shrank — did a kind disappear?").toBe(7);
  });

  it("a shortened conversation TELLS the user — it is not an error and not silence", () => {
    const ev = frameToEvents(sample("history"));
    expect(ev[0].event, "history became an error the user cannot act on").toBe("text");
    expect(JSON.stringify(ev[0].data)).toContain("sammenfattet");
  });

  it("but a mere warning is not shown mid-answer", () => {
    // There is still room; interrupting an answer to say "80% full" is noise.
    expect(frameToEvents({ type: "history", action: "warned", note: "80%" })).toEqual([]);
  });

  it("reaching the ceiling is an ANSWER, not a dead stream", () => {
    const ev = frameToEvents(sample("limit"));
    expect(ev[0].event).toBe("text");
    expect(JSON.stringify(ev[0].data)).toContain("Grænsen er nået");
  });

  it("an empty text delta produces nothing — a blank turn reads as no answer", () => {
    expect(frameToEvents({ type: "text", text: "" })).toEqual([]);
  });

  it("the two marker protocols still work, and a malformed one does not kill the stream", () => {
    const form = frameToEvents({ type: "tool-result", id: "1", name: "show_edit_form",
      result: '__INLINE_FORM__{"slug":"x"}' });
    expect(form.map((e) => e.event)).toEqual(["form", "tool_result"]);

    // The old route did a bare JSON.parse here. One truncated payload threw,
    // the outer catch fired, and the user saw "Chat error" under a half-written
    // answer that was actually fine.
    const broken = frameToEvents({ type: "tool-result", id: "1", name: "show_edit_form",
      result: '__INLINE_FORM__{"slug":' });
    expect(broken.map((e) => e.event), "a malformed marker took the stream down").toEqual(["form", "tool_result"]);
  });
});

describe("how long a conversation may get", () => {
  it("subtracts the tool schemas the package's estimator cannot see", () => {
    // THE ASSERTION THAT MATTERS. `estimate(messages, system)` counts those two
    // and nothing else; our 64 tool schemas ride along on every call and are in
    // neither argument. Without this subtraction every profile sits ~8,300
    // tokens closer to the wall than the number claims — in the green direction.
    const withOverhead = maxInputTokens("long-authoring", 32_768);
    const naive = Math.floor((ASSUMED_CONTEXT_TOKENS - 32_768) * 0.8);
    expect(withOverhead, "the tool-schema overhead is not being subtracted").toBeLessThan(naive);
    expect(naive - withOverhead).toBe(Math.floor(TOOL_SCHEMA_TOKENS * 0.8));
  });

  it("the profiles are ordered, and none of them is zero", () => {
    const long = maxInputTokens("long-authoring", 16_384);
    const std = maxInputTokens("standard", 16_384);
    const qa = maxInputTokens("visitor-qa", 16_384);
    expect(long).toBeGreaterThan(std);
    expect(std).toBeGreaterThan(qa);
    expect(qa, "the smallest profile must still hold a real conversation").toBeGreaterThan(4_000);
  });

  it("a bigger answer leaves room for less conversation", () => {
    // Output and input share one window. If this ever stops holding, the
    // ceiling has been computed from something other than the real budget.
    expect(maxInputTokens("standard", 32_768)).toBeLessThan(maxInputTokens("standard", 4_096));
  });

  it("counts Danish with OUR measured figure, not the English rule of thumb", () => {
    // ~4 chars/token is English; æ, ø, å and Danish word forms produce more
    // tokens per character, so it undercounts — in the direction where you
    // believe you have room you do not have.
    expect(CHARS_PER_TOKEN).toBeLessThan(4);
    const n = estimateDanish([{ role: "user", content: "x".repeat(341) }]);
    expect(n).toBe(100);
    expect(estimateDanish([{ role: "user", content: "x".repeat(341) }], "y".repeat(341)),
      "the system prompt is not counted").toBe(200);
  });

  it("an unknown profile falls back rather than throwing", () => {
    // It arrives from site config, which a human edits. A typo must not take
    // the chat down; it must land on the safe default and keep working.
    expect(resolveProfile("nonsense")).toBe("long-authoring");
    expect(resolveProfile(undefined)).toBe("long-authoring");
    expect(resolveProfile("visitor-qa")).toBe("visitor-qa");
  });

  it("compact is the strategy, and the newest turns are never summarised", () => {
    const cfg = buildHistoryConfig({ profile: "standard", maxOutputTokens: 16_384, summarise: async () => "s" });
    expect(cfg.strategy, "Christian chose summarise over forget, 28 Aug 2026").toBe("compact");
    expect(cfg.keepRecent, "the turn the user just wrote could be paraphrased away").toBeGreaterThan(0);
    expect(cfg.estimate, "the package's English estimator is back").toBe(estimateDanish);
  });
});
