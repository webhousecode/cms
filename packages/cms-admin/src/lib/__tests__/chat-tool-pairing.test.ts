import { describe, it, expect } from "vitest";
import { repairToolPairing } from "@/lib/chat/engine";

/**
 * THE BUG THIS EXISTS FOR, measured in production 28 Aug 2026 by running one
 * real turn through the deployed chat:
 *
 *   event: tool_call    site_summary
 *   event: tool_result  (the real answer, correct)
 *   event: error        mistral 400 — Unexpected role 'tool' after role 'user'
 *
 * The tool ran and its answer came back; the round that was supposed to TURN
 * that answer into a sentence was refused. So every question that needed a tool
 * ended in an error message, live.
 *
 * 1,283 green tests did not see it. The end-to-end test used a stub model, and
 * a stub accepts any message shape — the constraint being violated belongs to
 * the PROVIDER, and no test in this repo had ever spoken to one. That is the
 * whole lesson: the fake was faithful to the interface and not to the world.
 *
 * Root cause is upstream: @broberg/chat's `ChatMessage` is
 * `{role, content, toolCallId?}` — an assistant turn has nowhere to record
 * WHICH calls it made, and every major provider requires that pairing. We are
 * the only layer that knows it, so the adapter rebuilds it.
 */

const CALLS = new Map([["c1", { name: "site_summary", args: {} }]]);

describe("a tool result must answer an assistant turn that asked for it", () => {
  it("attaches the call to the assistant turn that precedes it", () => {
    const out = repairToolPairing(
      [
        { role: "user", content: "hvor mange dokumenter?" },
        { role: "assistant", content: "Lad mig se efter." },
        { role: "tool", content: "48 posts", toolCallId: "c1" },
      ],
      CALLS,
    ) as Record<string, unknown>[];

    const assistant = out[1];
    expect(assistant.role).toBe("assistant");
    expect(assistant.toolCalls, "the assistant turn still declares no tool call")
      .toEqual([{ id: "c1", name: "site_summary", arguments: {} }]);
    expect(out[2].role).toBe("tool");
  });

  it("INSERTS the assistant turn when the model streamed no text before calling", () => {
    // This is the shape production actually produced. Mistral called the tool
    // immediately, so the assistant turn carried an empty string and nothing
    // carried the call — the provider then saw `tool` directly after `user`,
    // which is the exact error text above.
    const out = repairToolPairing(
      [
        { role: "user", content: "hvor mange dokumenter?" },
        { role: "tool", content: "48 posts", toolCallId: "c1" },
      ],
      CALLS,
    ) as Record<string, unknown>[];

    expect(out.map((m) => m.role), "a tool result still follows a user turn directly")
      .toEqual(["user", "assistant", "tool"]);
    expect(out[1].toolCalls).toEqual([{ id: "c1", name: "site_summary", arguments: {} }]);
  });

  it("leaves an unknown call id alone rather than inventing a pairing", () => {
    // A fabricated name would be a different wrong answer, and the provider's
    // own error is more useful than our guess.
    const out = repairToolPairing(
      [{ role: "user", content: "x" }, { role: "tool", content: "y", toolCallId: "unknown" }],
      CALLS,
    ) as Record<string, unknown>[];
    expect(out.map((m) => m.role)).toEqual(["user", "tool"]);
  });

  it("does not duplicate a call already recorded on the assistant turn", () => {
    const out = repairToolPairing(
      [
        { role: "assistant", content: "" },
        { role: "tool", content: "a", toolCallId: "c1" },
        { role: "tool", content: "a", toolCallId: "c1" },
      ],
      CALLS,
    ) as Record<string, unknown>[];
    expect((out[0].toolCalls as unknown[]).length).toBe(1);
  });

  it("touches nothing in a conversation with no tools at all", () => {
    const plain = [
      { role: "user", content: "hej" },
      { role: "assistant", content: "hej igen" },
    ];
    expect(repairToolPairing(plain, CALLS)).toEqual(plain);
  });
});
