import { describe, it, expect } from "vitest";
import { createCmsChat, toChatTools, type ToolPair } from "@/lib/chat/engine";
import { frameToEvents } from "@/lib/chat/frames";
import type { ModelFn } from "@broberg/chat";

/**
 * A WHOLE CONVERSATION, through the real engine, with a stub model.
 *
 * The live browser proof is unavailable and correctly so: Lens is a read-only
 * principal, and sending a chat message can invoke tools that WRITE. Measured
 * 28 Aug 2026 against production — POST /api/cms/chat with the Lens session
 * returns 403 "Lens session is read-only" at the proxy, before the route is
 * even reached. Opening that door for a read-only principal to get a green tick
 * would be the exact trade this repo forbids.
 *
 * So everything except the provider call is exercised here: @broberg/chat's own
 * loop, our tool registry, the permission gate, our handlers actually running,
 * and the frame → SSE translation a browser would receive. What remains unproven
 * is `cmsModel()` talking to Mistral, and that is stated rather than implied.
 */

const pair = (name: string, permission: string, answer: string): ToolPair => ({
  definition: { name, description: `test ${name}`, input_schema: { type: "object", properties: {} } },
  handler: async () => answer,
  permission,
});

let offered: string[] = [];

/** Round 1: call a tool. Round 2: answer with text. Like a real turn. */
function stubModel(toolName: string): ModelFn {
  let round = 0;
  return async function* (req) {
    round++;
    if (round === 1) {
      // Proves the model was only ever OFFERED what the caller may use.
      offered = req.tools.map((t) => t.name);
      yield { type: "text", text: "Lad mig se efter. " };
      yield { type: "tool-call", id: "c1", name: toolName, args: {} };
    } else {
      yield { type: "text", text: "Der er 42 dokumenter." };
    }
  };
}

describe("a whole conversation runs through the engine", () => {
  it("streams text, calls the tool, and answers — in that order", async () => {
    offered = [];
    const tools = toChatTools([pair("count_documents", "content.read", "42")]);
    const chat = createCmsChat({ tools, model: stubModel("count_documents") });

    const events: { event: string; data: unknown }[] = [];
    for await (const frame of chat.run({
      messages: [{ role: "user", content: "Hvor mange dokumenter?" }],
      caller: ["content.read"],
      ctx: undefined,
    })) {
      events.push(...frameToEvents(frame));
    }

    const kinds = events.map((e) => e.event);
    expect(kinds, `the browser would have received: ${kinds.join(" -> ")}`).toContain("tool_call");
    expect(kinds).toContain("tool_result");
    expect(kinds).toContain("done");

    // THE HANDLER REALLY RAN. A loop that emits a tool_call frame and never
    // executes anything would satisfy every assertion above.
    const result = events.find((e) => e.event === "tool_result");
    expect(JSON.stringify(result?.data), "the tool's own answer never came back").toContain("42");

    // And the user got a real answer after the tool, not just the tool noise.
    const text = events.filter((e) => e.event === "text").map((e) => JSON.stringify(e.data)).join("");
    expect(text).toContain("42 dokumenter");
  });

  it("the model is never OFFERED a tool the caller may not use", async () => {
    // The gate is not "the tool refuses when called" — it is that the model
    // cannot ask for it, because it is never told the tool exists.
    offered = [];
    const tools = toChatTools([
      pair("count_documents", "content.read", "42"),
      pair("delete_everything", "content.delete", "gone"),
    ]);
    const chat = createCmsChat({ tools, model: stubModel("count_documents") });

    for await (const f of chat.run({
      messages: [{ role: "user", content: "hej" }],
      caller: ["content.read"],
      ctx: undefined,
    })) { void f; }

    expect(offered, "a read-only caller was shown a tool that deletes").toEqual(["count_documents"]);
  });

  it("a caller with nothing is offered nothing, and no ungranted tool runs", async () => {
    offered = [];
    const tools = toChatTools([pair("count_documents", "content.read", "42")]);
    // The stub still ASKS for the tool, which is the harsher test: the engine
    // must not execute one it never granted just because the model named it.
    const chat = createCmsChat({ tools, model: stubModel("count_documents") });

    const events: { event: string; data: unknown }[] = [];
    for await (const frame of chat.run({
      messages: [{ role: "user", content: "hej" }],
      caller: [],
      ctx: undefined,
    })) {
      events.push(...frameToEvents(frame));
    }

    expect(offered, "a caller with no permissions was offered tools").toEqual([]);
    const ran = events.filter((e) => e.event === "tool_result").some((r) => JSON.stringify(r.data).includes('"42"'));
    expect(ran, "the engine executed a tool it had not granted").toBe(false);
    expect(events.map((e) => e.event), "the stream never finished").toContain("done");
  });
});
