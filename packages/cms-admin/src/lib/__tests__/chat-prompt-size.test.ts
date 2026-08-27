import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildChatSystemPrompt, type SiteContext } from "@/lib/chat/system-prompt";
import {
  measurePromptSize,
  promptSizeComplaint,
  PROMPT_CEILING_CHARS,
} from "@/lib/chat/prompt-size";

/**
 * A fixture sized like sanneandersen — our largest site, and the one the
 * ceiling was measured against (23,093 chars / 6,774 actual input tokens on
 * 27 Aug 2026). Built rather than imported: a test that reaches into a sibling
 * repo passes on one laptop and fails in CI.
 */
function site(collectionCount: number, fieldsEach: number): SiteContext {
  return {
    siteName: "Fixture",
    adapter: "filesystem",
    collections: Array.from({ length: collectionCount }, (_, i) => ({
      name: `collection-${i}`,
      label: `Samling nummer ${i}`,
      description: "En beskrivelse i den længde en rigtig samling har, så vægten ligner virkeligheden.",
      fields: Array.from({ length: fieldsEach }, (_, j) => ({
        name: `field${j}`,
        type: "text",
        label: `Et felt-navn af realistisk længde ${j}`,
        required: j === 0,
      })),
      documentCount: 10,
      kind: "page" as const,
    })),
    defaultLocale: "da",
    locales: ["da", "en"],
    autoTranslate: false,
  };
}

const report = (ctx: SiteContext) => measurePromptSize(buildChatSystemPrompt(ctx), ctx);

describe("the alarm is quiet today", () => {
  it("a site the size of our largest is under the ceiling", () => {
    const r = report(site(19, 8));
    expect(r.overCeiling, `${r.chars} chars vs ceiling ${r.ceilingChars}`).toBe(false);
    expect(promptSizeComplaint(r)).toBeNull();
  });

  it("an empty site is nowhere near it", () => {
    expect(report(site(0, 0)).overCeiling).toBe(false);
  });
});

describe("the alarm fires on the growth it exists for", () => {
  it("trips when a site's schema roughly doubles", () => {
    const r = report(site(40, 12));
    expect(r.overCeiling, `${r.chars} chars vs ceiling ${r.ceilingChars}`).toBe(true);
    expect(promptSizeComplaint(r)).not.toBeNull();
  });

  it("the complaint says the size, the ceiling AND the heaviest collections", () => {
    // A complaint that only says "too big" makes the reader redo the measuring
    // this function already did.
    const r = report(site(40, 12));
    const msg = promptSizeComplaint(r)!;
    expect(msg).toContain(r.chars.toLocaleString("da-DK"));
    expect(msg).toContain(PROMPT_CEILING_CHARS.toLocaleString("da-DK"));
    expect(msg).toContain("collection-");
    expect(msg).toContain("HVER besked"); // says WHY the size matters
  });
});

describe("weight is attributed with the prompt's own renderer", () => {
  it("names the genuinely heaviest collection, not the first", () => {
    const ctx = site(5, 2);
    // Make the LAST one enormous — a naive implementation reporting insertion
    // order, or re-rendering approximately, would get this wrong.
    ctx.collections[4].fields = Array.from({ length: 60 }, (_, j) => ({
      name: `heavy${j}`,
      type: "text",
      label: `Et meget langt felt-navn der bærer rigtig vægt nummer ${j}`,
    }));
    const r = report(ctx);
    expect(r.biggest[0].name).toBe("collection-4");
    expect(r.biggest[0].chars).toBeGreaterThan(r.biggest[1].chars);
  });

  it("approxTokens is derived, and named so nobody reads it as exact", () => {
    const r = report(site(19, 8));
    // Measured ratio is 3.41 chars/token; a plain /4 undershoots by ~17%.
    expect(r.approxTokens).toBeGreaterThan(r.chars / 4);
    expect(r.approxTokens).toBeLessThan(r.chars / 3);
  });
});

describe("this alarm does NOT cover the half that grows per message", () => {
  it("the module says so in its own text, so a green suite cannot be misread", () => {
    // The history has no brake either, and it belongs to components' shared
    // module — not here. If someone rewrites this file's doc comment and drops
    // the caveat, a future reader would take a green suite as proof the chat is
    // bounded. It is not. That is what this guard protects.
    const src = readFileSync(
      join(process.cwd(), "src/lib/chat/prompt-size.ts"),
      "utf8",
    );
    expect(src).toMatch(/NOTHING IN THIS FILE COVERS IT/);
    expect(src).toMatch(/F079\.9/); // points at who DOES own it
  });
});

describe("the alarm is actually wired to the live chat", () => {
  it("the chat route measures what it is about to send", () => {
    // Without this the whole file is theatre: the fixture tests above prove the
    // MECHANISM, and only this proves anything calls it for a real site.
    const src = readFileSync(
      join(process.cwd(), "src/app/api/cms/chat/route.ts"),
      "utf8",
    );
    expect(src).toContain("promptSizeComplaint");
    expect(src).toContain("measurePromptSize");
    // Must be measured AFTER the memory section is appended — measuring the
    // base alone would understate what is actually sent. Anchored on the CALL,
    // not the identifier: the first `measurePromptSize` in the file is the
    // import line, and asserting against that position passed while proving
    // nothing about where the call sits.
    const memoryAt = src.indexOf("systemPrompt += section");
    const callAt = src.indexOf("measurePromptSize(systemPrompt");
    expect(memoryAt).toBeGreaterThan(-1);
    expect(callAt, "no measurePromptSize(systemPrompt, …) call in the route").toBeGreaterThan(-1);
    expect(callAt).toBeGreaterThan(memoryAt);
  });
});
