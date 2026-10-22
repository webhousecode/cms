/**
 * Security W41 H3 — site-config GET handed non-admins every secret the named
 * list did not know about (inherited AI keys, deploy token, Fly sync secret…).
 */
import { describe, it, expect } from "vitest";
import { stripSecretsForNonAdmin } from "../site-config-redact";

describe("stripSecretsForNonAdmin", () => {
  it("removes every field whose name says secret, including ones no list mentions", () => {
    const r: Record<string, unknown> = {
      aiAnthropicApiKey: "a", aiOpenaiApiKey: "b", aiGeminiApiKey: "c", deployGitHubToken: "d",
      deployFlyLiveSyncSecret: "e", psiApiKey: "f", someFutureServiceToken: "g", backupPcloudUsername: "h",
      webhookDiscordUrl: "i", deployHookUrl: "j", mcpServers: [{ env: { K: "v" } }],
      previewSiteUrl: "https://x", deployProductionUrl: "https://y", siteName: "S",
    };
    stripSecretsForNonAdmin(r);
    expect(r).toEqual({ previewSiteUrl: "https://x", deployProductionUrl: "https://y", siteName: "S" });
  });
});
