import { describe, it, expect } from "vitest";
import { resolveChatModel, isMistralModel } from "../chat/resolve-chat-model";

const CODE = "mistral-large-latest"; // getModel("code")

describe("resolveChatModel — Mistral pin guard", () => {
  it("falls back to the code-tier model when site-config holds a Claude id (the live prod bug)", () => {
    // Every site defaulted aiChatModel to a Claude id → 400 at Mistral. Guard it.
    expect(resolveChatModel(undefined, "claude-sonnet-4-6", CODE)).toBe(CODE);
    expect(resolveChatModel(undefined, "claude-opus-4-6", CODE)).toBe(CODE);
  });

  it("honours a valid Mistral site-config override", () => {
    expect(resolveChatModel(undefined, "mistral-small-latest", CODE)).toBe("mistral-small-latest");
    expect(resolveChatModel(undefined, "mistral-large-latest", CODE)).toBe("mistral-large-latest");
  });

  it("uses the code default when site-config has no model", () => {
    expect(resolveChatModel(undefined, undefined, CODE)).toBe(CODE);
    expect(resolveChatModel(undefined, "", CODE)).toBe(CODE);
  });

  it("guarantees Mistral even when BOTH aiChatModel AND aiCodeModel are poisoned (the webhouse-site case)", () => {
    // getModel("code") reads aiCodeModel, which is ALSO a Claude id on poisoned
    // sites — the fallback must still land on a real Mistral model.
    expect(resolveChatModel(undefined, "claude-sonnet-4-6", "claude-sonnet-4-6")).toBe("mistral-large-latest");
    expect(resolveChatModel("claude-opus-4-6", "claude-opus-4-6", "claude-haiku-4-5-20251001")).toBe("mistral-large-latest");
  });

  it("never sends a requested Claude model to Mistral (requestable list is Claude → overridden)", () => {
    expect(resolveChatModel("claude-sonnet-4-6", "mistral-small-latest", CODE)).toBe(CODE);
  });

  it("ignores an unknown requested model and uses site/code", () => {
    expect(resolveChatModel("gpt-4o", "mistral-small-latest", CODE)).toBe("mistral-small-latest");
    expect(resolveChatModel("bogus", undefined, CODE)).toBe(CODE);
  });
});

describe("isMistralModel", () => {
  it("accepts Mistral-family ids", () => {
    for (const m of ["mistral-large-latest", "mistral-small-latest", "ministral-8b-latest", "codestral-latest", "open-mistral-7b", "pixtral-large-latest"]) {
      expect(isMistralModel(m)).toBe(true);
    }
  });
  it("rejects non-Mistral ids", () => {
    for (const m of ["claude-sonnet-4-6", "claude-opus-4-6", "gpt-4o", "gemini-2.5-flash-lite", "text-embedding-3-small"]) {
      expect(isMistralModel(m)).toBe(false);
    }
  });
});
