/**
 * F158 — quick-action pre-warm SSE accumulator.
 *
 * parseChatSseText is the load-bearing step of server-side pre-warm: it turns
 * the chat's SSE stream into the markdown that gets cached. If it mis-parses,
 * pre-warm stores garbage (or nothing) and every "instant" click is wrong.
 *
 * Run: cd packages/cms-admin && npx vitest run src/lib/__tests__/quick-prewarm.test.ts
 */
import { describe, it, expect } from "vitest";
import { parseChatSseText } from "../chat/quick-sse";

function frame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

describe("parseChatSseText", () => {
  it("concatenates text deltas in order", () => {
    const raw =
      frame("text", { text: "Her er " }) +
      frame("text", { text: "et overblik " }) +
      frame("text", { text: "over dit site." });
    expect(parseChatSseText(raw)).toBe("Her er et overblik over dit site.");
  });

  it("ignores thinking / tool_call / tool_result / done / error frames", () => {
    const raw =
      frame("thinking", { text: "…" }) +
      frame("tool_call", { name: "listCollections" }) +
      frame("text", { text: "Kollektioner: 9" }) +
      frame("tool_result", { ok: true }) +
      frame("done", {}) +
      frame("error", { message: "should be ignored after done" });
    expect(parseChatSseText(raw)).toBe("Kollektioner: 9");
  });

  it("tolerates missing space after event:/data:", () => {
    const raw = `event:text\ndata:${JSON.stringify({ text: "Hej" })}\n\n`;
    expect(parseChatSseText(raw)).toBe("Hej");
  });

  it("skips a malformed data frame without dropping later text", () => {
    const raw =
      "event: text\ndata: {not json}\n\n" +
      frame("text", { text: "valid" });
    expect(parseChatSseText(raw)).toBe("valid");
  });

  it("ignores a text frame whose data.text is not a string", () => {
    const raw = frame("text", { text: 42 }) + frame("text", { text: " ok" });
    expect(parseChatSseText(raw)).toBe(" ok");
  });

  it("returns empty string for an empty or text-less stream", () => {
    expect(parseChatSseText("")).toBe("");
    expect(parseChatSseText(frame("done", {}))).toBe("");
  });
});
