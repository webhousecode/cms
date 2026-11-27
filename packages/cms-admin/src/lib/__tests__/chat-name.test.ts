/**
 * @broberg/chat 0.9.0 has no persona of its own: without a name the model is
 * told "You are Assistant." The CMS chat keeps its name until the owner picks
 * another.
 */
import { describe, it, expect } from "vitest";
import { corePrompt } from "@broberg/chat";
import { CMS_CHAT_NAME } from "../chat/engine";

describe("CMS chat name", () => {
  it("the CMS chat is still Aidan", () => {
    expect(CMS_CHAT_NAME).toBe("Aidan");
  });
  it("the package puts that name in the prompt (and a neutral one without it)", () => {
    expect(corePrompt(CMS_CHAT_NAME)).toContain("Aidan");
    expect(corePrompt()).not.toContain("Aidan");
  });
});
