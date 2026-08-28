import { describe, it, expect } from "vitest";
import { buildSummarisePrompt, SUMMARISE_INSTRUCTION } from "@/lib/chat/summarise";

/**
 * Measured live in production, 28 Aug 2026: the summariser ANSWERED the
 * conversation instead of summarising it, and the answer was then inserted into
 * the transcript as the summary. A long session's real history would have been
 * replaced by a fabricated continuation, with the user's opening instruction
 * lost inside it — and nothing errored.
 *
 * Cause: the transcript was the `prompt` and the instruction was in `system`.
 * The model saw a question at the END of its input and did the obvious thing.
 * A system prompt loses to a question sitting last.
 */
const older = [
  { role: "user" as const, content: "Svar altid på engelsk resten af samtalen." },
  { role: "assistant" as const, content: "OK." },
  { role: "user" as const, content: "Hvad er zoneterapi?" },
];

describe("the transcript is handed over as DATA, not as a conversation to continue", () => {
  it("the instruction travels WITH the data, not in a system prompt", () => {
    // The whole fix. If this ever splits again, the model answers again.
    const p = buildSummarisePrompt(older);
    expect(p.startsWith(SUMMARISE_INSTRUCTION), "the instruction is no longer in the prompt").toBe(true);
  });

  it("refuses answering in as many words", () => {
    const p = buildSummarisePrompt(older);
    expect(p).toContain("BESVAR IKKE");
    expect(p).toContain("Fortsæt ikke samtalen");
  });

  it("fences the transcript so the last line is not addressed to the model", () => {
    const p = buildSummarisePrompt(older);
    const start = p.indexOf("<<<UDDRAG");
    const end = p.indexOf("UDDRAG>>>");
    expect(start, "the transcript is not fenced").toBeGreaterThan(-1);
    expect(end, "the fence is not closed").toBeGreaterThan(start);
    // And the model's own cue comes AFTER the fence, so the final thing it
    // reads is "write a summary" rather than a user's question.
    expect(p.trimEnd().endsWith("Referat:"), "the prompt still ends on the user's question").toBe(true);
  });

  it("keeps every turn, and marks who said what", () => {
    const p = buildSummarisePrompt(older);
    for (const m of older) expect(p, `${m.role} turn missing`).toContain(m.content);
    expect(p).toContain("[user]");
    expect(p).toContain("[assistant]");
  });

  it("names the things that must survive a summary", () => {
    // Not decoration: the opening instruction is what a long working session
    // loses, and it is the whole reason CMS chose compact over window.
    for (const kind of ["instrukser", "beslutninger", "slugs"]) {
      expect(SUMMARISE_INSTRUCTION, `${kind} not named as must-keep`).toContain(kind);
    }
  });
});
