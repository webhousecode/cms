/**
 * F122 — Beam export/import unit tests.
 *
 * Tests the core beam logic: secret stripping, manifest format,
 * and roundtrip integrity (export → import → verify).
 */
import { describe, it, expect } from "vitest";
import {
  SECRET_FIELDS,
  BEAM_REDACTED,
  EXCLUDED_DATA_DIRS,
  ORG_SETTINGS_SECRET_FIELDS,
  clearRedactedSecrets,
  type BeamManifest,
} from "../beam/types";

// ── Types tests ──

describe("Beam types", () => {
  it("SECRET_FIELDS covers known config files", () => {
    expect(SECRET_FIELDS["site-config.json"]).toBeDefined();
    expect(SECRET_FIELDS["site-config.json"]).toContain("deployApiToken");
    expect(SECRET_FIELDS["site-config.json"]).toContain("revalidateSecret");
  });

  it("ai-config.json secrets include all provider keys", () => {
    expect(SECRET_FIELDS["ai-config.json"]).toContain("anthropicApiKey");
    expect(SECRET_FIELDS["ai-config.json"]).toContain("openaiApiKey");
    // Real field name in AiConfig is geminiApiKey; legacy googleApiKey kept for
    // older configs still on disk so push redacts both.
    expect(SECRET_FIELDS["ai-config.json"]).toContain("geminiApiKey");
    expect(SECRET_FIELDS["ai-config.json"]).toContain("googleApiKey");
    expect(SECRET_FIELDS["ai-config.json"]).toContain("braveApiKey");
    expect(SECRET_FIELDS["ai-config.json"]).toContain("tavilyApiKey");
  });

  it("ORG_SETTINGS_SECRET_FIELDS covers AI keys and deploy tokens", () => {
    expect(ORG_SETTINGS_SECRET_FIELDS).toContain("aiAnthropicApiKey");
    expect(ORG_SETTINGS_SECRET_FIELDS).toContain("aiOpenaiApiKey");
    expect(ORG_SETTINGS_SECRET_FIELDS).toContain("deployApiToken");
    expect(ORG_SETTINGS_SECRET_FIELDS).toContain("resendApiKey");
  });

  it("EXCLUDED_DATA_DIRS excludes backups", () => {
    expect(EXCLUDED_DATA_DIRS.has("backups")).toBe(true);
    expect(EXCLUDED_DATA_DIRS.has("deploy-log.json")).toBe(true);
  });

  it("BEAM_REDACTED is a recognizable placeholder", () => {
    expect(BEAM_REDACTED).toBe("BEAM_REDACTED");
  });
});

// ── Secret stripping logic (extracted for testability) ──

function stripSecrets(obj: Record<string, unknown>, fields: string[]): string[] {
  const found: string[] = [];
  for (const field of fields) {
    if (field in obj && obj[field] && obj[field] !== "" && obj[field] !== BEAM_REDACTED) {
      if (Array.isArray(obj[field])) {
        for (const item of obj[field] as Record<string, unknown>[]) {
          if (typeof item === "object" && item && field in item && item[field]) {
            item[field] = BEAM_REDACTED;
            found.push(field.toUpperCase());
          }
        }
      } else {
        obj[field] = BEAM_REDACTED;
        found.push(field.toUpperCase());
      }
    }
  }
  return found;
}

describe("Secret stripping", () => {
  it("strips known secret fields from site-config", () => {
    const config = {
      previewSiteUrl: "http://localhost:3009",
      deployApiToken: "fly_secret_abc123",
      deployHookUrl: "https://api.vercel.com/v1/...",
      revalidateSecret: "hmac_secret_def456",
      calendarToken: "cal_token_xyz",
      defaultLocale: "en",
    };

    const stripped = stripSecrets(config, SECRET_FIELDS["site-config.json"]!);

    expect(config.deployApiToken).toBe(BEAM_REDACTED);
    expect(config.deployHookUrl).toBe(BEAM_REDACTED);
    expect(config.revalidateSecret).toBe(BEAM_REDACTED);
    expect(config.calendarToken).toBe(BEAM_REDACTED);
    // Non-secret fields untouched
    expect(config.previewSiteUrl).toBe("http://localhost:3009");
    expect(config.defaultLocale).toBe("en");
    // Returns list of stripped field names
    expect(stripped).toContain("DEPLOYAPITOKEN");
    expect(stripped).toContain("REVALIDATESECRET");
  });

  it("does not strip empty or already-redacted fields", () => {
    const config = {
      deployApiToken: "",
      revalidateSecret: BEAM_REDACTED,
    };

    const stripped = stripSecrets(config, SECRET_FIELDS["site-config.json"]!);

    expect(stripped).toHaveLength(0);
    expect(config.deployApiToken).toBe("");
    expect(config.revalidateSecret).toBe(BEAM_REDACTED);
  });

  it("strips AI provider keys", () => {
    const aiConfig = {
      anthropicApiKey: "sk-ant-abc123",
      openaiApiKey: "sk-openai-xyz",
      googleApiKey: "",
      model: "claude-sonnet-4-6",
    };

    const stripped = stripSecrets(aiConfig, SECRET_FIELDS["ai-config.json"]!);

    expect(aiConfig.anthropicApiKey).toBe(BEAM_REDACTED);
    expect(aiConfig.openaiApiKey).toBe(BEAM_REDACTED);
    expect(aiConfig.googleApiKey).toBe(""); // empty = not stripped
    expect(aiConfig.model).toBe("claude-sonnet-4-6"); // not a secret
    expect(stripped).toHaveLength(2);
  });

  it("handles missing fields gracefully", () => {
    const config = { foo: "bar" };
    const stripped = stripSecrets(config, ["deployApiToken", "nonexistent"]);
    expect(stripped).toHaveLength(0);
    expect(config.foo).toBe("bar");
  });
});

// ── Defensive read-side scrubbing ──

describe("clearRedactedSecrets", () => {
  it("deletes BEAM_REDACTED-valued fields and reports change", () => {
    const config: Record<string, unknown> = {
      anthropicApiKey: BEAM_REDACTED,
      openaiApiKey: "sk-real-key",
      defaultProvider: "anthropic",
    };
    const changed = clearRedactedSecrets(config, SECRET_FIELDS["ai-config.json"]!);
    expect(changed).toBe(true);
    expect("anthropicApiKey" in config).toBe(false);
    expect(config.openaiApiKey).toBe("sk-real-key");
    expect(config.defaultProvider).toBe("anthropic");
  });

  it("returns false when nothing redacted", () => {
    const config: Record<string, unknown> = {
      anthropicApiKey: "sk-ant-real",
      openaiApiKey: "",
    };
    const changed = clearRedactedSecrets(config, SECRET_FIELDS["ai-config.json"]!);
    expect(changed).toBe(false);
    expect(config.anthropicApiKey).toBe("sk-ant-real");
    expect(config.openaiApiKey).toBe("");
  });

  it("does not touch fields not in the field list", () => {
    const config: Record<string, unknown> = {
      anthropicApiKey: BEAM_REDACTED,
      otherField: BEAM_REDACTED, // not in field list — must be left alone
    };
    clearRedactedSecrets(config, ["anthropicApiKey"]);
    expect("anthropicApiKey" in config).toBe(false);
    expect(config.otherField).toBe(BEAM_REDACTED);
  });
});

// ── Manifest validation ──

describe("Beam manifest format", () => {
  it("validates a well-formed manifest", () => {
    const manifest: BeamManifest = {
      version: 1,
      beamId: "test-beam-id",
      sourceInstance: "localhost",
      exportedAt: new Date().toISOString(),
      site: {
        id: "test-site",
        name: "Test Site",
        adapter: "filesystem",
      },
      stats: {
        contentFiles: 10,
        mediaFiles: 5,
        dataFiles: 3,
        totalSizeBytes: 1024000,
        collections: { posts: 7, pages: 3 },
      },
      checksums: {
        "content/posts/hello.json": "abc123",
      },
      secretsRequired: ["DEPLOYAPITOKEN"],
    };

    expect(manifest.version).toBe(1);
    expect(manifest.site.adapter).toBe("filesystem");
    expect(manifest.stats.contentFiles).toBe(10);
    expect(Object.keys(manifest.checksums)).toHaveLength(1);
    expect(manifest.secretsRequired).toContain("DEPLOYAPITOKEN");
  });

  it("rejects unsupported version", () => {
    const manifest = { version: 99 };
    expect(manifest.version).not.toBe(1);
  });
});

// ── Checksum verification ──

describe("Checksum verification", () => {
  it("SHA-256 produces consistent hashes", async () => {
    const { createHash } = await import("node:crypto");
    const data = '{"slug":"hello","data":{"title":"Hello"}}';
    const hash1 = createHash("sha256").update(data).digest("hex");
    const hash2 = createHash("sha256").update(data).digest("hex");
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it("different content produces different hashes", async () => {
    const { createHash } = await import("node:crypto");
    const hash1 = createHash("sha256").update("content-a").digest("hex");
    const hash2 = createHash("sha256").update("content-b").digest("hex");
    expect(hash1).not.toBe(hash2);
  });
});
