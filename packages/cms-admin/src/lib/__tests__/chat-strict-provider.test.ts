import { describe, it, expect } from "vitest";
import { createStrictModel, assertProviderTranscript, InvalidTranscriptError } from "@broberg/chat/testing";
import { createCmsChat, toChatTools, toProviderMessages, type ToolPair } from "@/lib/chat/engine";
import { frameToEvents } from "@/lib/chat/frames";

/**
 * THE TEST THAT WOULD HAVE CAUGHT THE OUTAGE.
 *
 * Our end-to-end test ran the real engine against a permissive stub, and a stub
 * accepts any message shape — so the transcript that Mistral rejected in
 * production (a `tool` result with no assistant turn owning the call) sailed
 * through 1,283 green tests. components shipped their providers' ordering rule
 * as an assertion in @broberg/chat/testing so a double can disagree with us.
 *
 * Measured by them against the code that broke our production:
 *   181 permissive tests — ALL GREEN
 *    14 strict tests     —  7 RED
 *
 * This file runs OUR loop through it.
 */

const pair = (name: string, permission: string, answer: string): ToolPair => ({
  definition: { name, description: `test ${name}`, input_schema: { type: "object", properties: {} } },
  handler: async () => answer,
  permission,
});

describe("our loop survives a model that refuses what a provider refuses", () => {
  it("a tool round-trip produces a transcript a provider would accept", async () => {
    // Round 1 calls the tool WITHOUT text first — the exact shape production
    // produced, and the one that used to leave `tool` sitting after `user`.
    const model = createStrictModel([
      [{ type: "tool-call", id: "c1", name: "site_summary", args: {} }],
      [{ type: "text", text: "Der er 136 dokumenter." }],
    ]);
    const chat = createCmsChat({
      tools: toChatTools([pair("site_summary", "content.read", "136 dokumenter")]),
      model,
    });

    const events: { event: string; data: unknown }[] = [];
    for await (const frame of chat.run({
      messages: [{ role: "user", content: "hvor mange dokumenter?" }],
      caller: ["content.read"],
      ctx: undefined,
    })) {
      events.push(...frameToEvents(frame));
    }

    // If the transcript were malformed, the strict model throws and the run
    // surfaces an error frame instead of an answer — which is exactly what the
    // user saw in production.
    const errors = events.filter((e) => e.event === "error");
    expect(errors, `the provider would have refused: ${JSON.stringify(errors)}`).toEqual([]);

    const text = events.filter((e) => e.event === "text").map((e) => JSON.stringify(e.data)).join("");
    expect(text, "the tool answer never became a sentence").toContain("136 dokumenter");
  });

  it("the strict model really can say no — otherwise the test above proves nothing", () => {
    // The positive control on the instrument itself. Today's lesson, applied to
    // the thing that is supposed to catch today's lesson: a guard that cannot
    // fail is not a guard.
    expect(() =>
      assertProviderTranscript([
        { role: "user", content: "hvor mange dokumenter?" },
        { role: "tool", content: "136", toolCallId: "c1" },
      ]),
    ).toThrow(InvalidTranscriptError);

    // And it accepts a well-formed one, so it is not simply always throwing.
    expect(() =>
      assertProviderTranscript([
        { role: "user", content: "x" },
        { role: "assistant", content: "", toolCalls: [{ id: "c1", name: "s", args: {} }] },
        { role: "tool", content: "y", toolCallId: "c1" },
      ]),
    ).not.toThrow();
  });
});


describe("what WE hand the provider is a transcript a provider would accept", () => {
  // THE ASSERTION THE FIRST VERSION OF THIS FILE MISSED. Passing the package's
  // own strict model into createCmsChat means `cmsModel` never runs, so the
  // test proved the ENGINE emits a valid transcript and proved nothing about
  // OUR handoff to @broberg/ai-sdk — which is exactly where the outage lived.
  // Measured: stripping the pairing out of cmsModel turned NOTHING red.
  const withPairing = [
    { role: "user" as const, content: "hvor mange dokumenter?" },
    { role: "assistant" as const, content: "", toolCalls: [{ id: "c1", name: "site_summary", args: {} }] },
    { role: "tool" as const, content: "136", toolCallId: "c1" },
  ];

  it("passes the pairing through intact", () => {
    expect(() => assertProviderTranscript(toProviderMessages(withPairing) as never)).not.toThrow();
  });

  it("and the assertion is real: drop the pairing and it refuses", () => {
    const stripped = withPairing.map((m) => ({ role: m.role, content: m.content, toolCallId: m.toolCallId }));
    expect(() => assertProviderTranscript(stripped as never)).toThrow(InvalidTranscriptError);
  });
});
