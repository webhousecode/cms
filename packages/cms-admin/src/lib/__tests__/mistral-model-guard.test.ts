import { describe, it, expect, vi, afterEach } from "vitest";
import { mistralModel } from "../ai/client";
import { DEFAULTS, isMistralModel } from "../ai/model-defaults";

/**
 * mistralModel() is the ONE place the Mistral provider is pinned, so it is the
 * one place the model id can be guaranteed to match it.
 *
 * Every id it receives comes from site config (aiContentModel, aiCodeModel, …),
 * which an admin sets in the UI — and the settings picker offered ONLY Claude
 * ids, so most sites stored one. cms-admin wires up mistral/gemini/openai
 * adapters and no Anthropic adapter at all, so those ids could never work.
 *
 * Measured on production 2026-08-17, sanneandersen.dk bulk SEO optimisation:
 *
 *   {"type":"error","collection":"pages","slug":"text",
 *    "error":"mistral 400: {\"message\":\"Invalid model:
 *             claude-haiku-4-5-20251001\",\"type\":\"invalid_model\"}"}
 *
 * ...on all 121 documents. The chat worked on the same site the whole time,
 * because resolve-chat-model.ts had already guarded itself — the instance was
 * fixed and the class was left open. This test closes the class.
 */

afterEach(() => vi.restoreAllMocks());

const quiet = () => vi.spyOn(console, "warn").mockImplementation(() => {});

describe("mistralModel", () => {
  it("passes a real Mistral model through untouched", () => {
    quiet();
    for (const id of ["mistral-small-latest", "mistral-large-latest"]) {
      expect(mistralModel(id).override.model).toBe(id);
    }
  });

  it("refuses to send the Claude id that broke bulk SEO to Mistral", () => {
    quiet();
    const { override } = mistralModel("claude-haiku-4-5-20251001");
    expect(override.provider).toBe("mistral");
    expect(override.model).toBe(DEFAULTS.code);
    expect(isMistralModel(String(override.model))).toBe(true);
  });

  it("substitutes for ANY foreign provider, not just Claude", () => {
    quiet();
    for (const id of ["gpt-4o", "gemini-2.5-flash", "claude-opus-4-6", "", "nonsense"]) {
      expect(isMistralModel(String(mistralModel(id).override.model))).toBe(true);
    }
  });

  it("says so instead of substituting silently", () => {
    // A silent swap is how config and behaviour drift apart in the first place:
    // the settings page would keep showing a model that is not being used.
    const warn = quiet();
    mistralModel("claude-haiku-4-5-20251001");
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]?.[0])).toContain("claude-haiku-4-5-20251001");
    expect(String(warn.mock.calls[0]?.[0])).toContain("Site Settings");
  });

  it("stays quiet when there is nothing to correct", () => {
    const warn = quiet();
    mistralModel("mistral-small-latest");
    expect(warn).not.toHaveBeenCalled();
  });

  it("keeps pinning the provider — the guard must not weaken the pin", () => {
    quiet();
    expect(mistralModel("claude-opus-4-6").override.provider).toBe("mistral");
    expect(mistralModel("mistral-large-latest").override.provider).toBe("mistral");
  });
});

/**
 * The other half of the same bug: the settings picker is what wrote those ids
 * into site config. Offering a model the CMS has no adapter for is not a
 * cosmetic problem — it is the only way an admin could produce this state.
 */
describe("the defaults an admin is offered", () => {
  it("only ever proposes models the CMS can actually run", () => {
    for (const id of Object.values(DEFAULTS)) {
      expect(isMistralModel(id)).toBe(true);
    }
  });
});
