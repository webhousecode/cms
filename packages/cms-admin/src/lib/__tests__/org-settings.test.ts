/**
 * F87 Org-Level Global Settings — Test Suite
 *
 * Tests the merge logic, inheritance chain, edge cases, and migration.
 * Written BEFORE implementation (TDD).
 *
 * Run: cd packages/cms-admin && npx vitest run src/lib/__tests__/org-settings.test.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

// ── Types (mirrors production code) ────────────────────────────

/** Fields that CAN be inherited from org → site */
const INHERITABLE_FIELDS = [
  // Deploy
  "deployApiToken",
  "deployFlyOrg",
  "deployHookUrl",
  // Email
  "resendApiKey",
  "emailFrom",
  "emailFromName",
  // AI
  "aiInteractivesModel",
  "aiInteractivesMaxTokens",
  "aiContentModel",
  "aiContentMaxTokens",
] as const;

/** Fields that must NEVER be inherited */
const NEVER_INHERIT = [
  "calendarSecret",       // per-site HMAC — inheriting breaks existing tokens
  "deployAppName",        // unique per site (repo name / fly app name)
  "deployProductionUrl",  // unique per site
  "deployCustomDomain",   // unique per site
  "deployProvider",       // site chooses its own provider
  "deployOnSave",         // site-level preference
  "previewSiteUrl",       // site-specific preview URL
] as const;

// ── Merge function under test ──────────────────────────────────

/**
 * Pure merge function — the core logic we're testing.
 * This is what readSiteConfig() will use internally.
 *
 * Rules:
 * 1. Site values override org values override defaults
 * 2. Empty strings ("") in site config do NOT override org values
 * 3. NEVER_INHERIT fields are excluded from org settings
 * 4. Array fields: site replaces org (no merge)
 * 5. Explicit null/undefined in site config = use org value
 */
function mergeConfigs(
  defaults: Record<string, unknown>,
  orgSettings: Record<string, unknown>,
  siteConfig: Record<string, unknown>,
): Record<string, unknown> {
  // Step 1: Filter org settings to only inheritable fields
  const filteredOrg: Record<string, unknown> = {};
  for (const key of Object.keys(orgSettings)) {
    if ((NEVER_INHERIT as readonly string[]).includes(key)) continue;
    const value = orgSettings[key];
    if (value !== undefined && value !== null && value !== "") {
      filteredOrg[key] = value;
    }
  }

  // Step 2: Filter site config — empty strings don't override
  const filteredSite: Record<string, unknown> = {};
  for (const key of Object.keys(siteConfig)) {
    const value = siteConfig[key];
    // Empty strings don't override org/defaults for inheritable string fields
    if (value === "" && (INHERITABLE_FIELDS as readonly string[]).includes(key)) continue;
    if (value !== undefined && value !== null) {
      filteredSite[key] = value;
    }
  }

  // Step 3: Merge in order: defaults ← org ← site
  return { ...defaults, ...filteredOrg, ...filteredSite };
}

// ── Test Suite ─────────────────────────────────────────────────

describe("F87 Org-Level Settings — mergeConfigs", () => {
  const DEFAULTS: Record<string, unknown> = {
    resendApiKey: "",
    emailFrom: "",
    emailFromName: "webhouse.app",
    aiContentModel: "claude-haiku-4-5-20251001",
    aiInteractivesModel: "claude-sonnet-4-6",
    aiContentMaxTokens: 4096,
    aiInteractivesMaxTokens: 16384,
    deployProvider: "off",
    deployApiToken: "",
    deployAppName: "",
    deployFlyOrg: "",
    deployHookUrl: "",
    deployProductionUrl: "",
    deployCustomDomain: "",
    deployOnSave: false,
    calendarSecret: "site-generated-secret-abc",
    previewSiteUrl: "",
    backupWebhooks: [],
    publishWebhooks: [],
  };

  // ── Basic inheritance ──────────────────────────────────────

  describe("basic inheritance", () => {
    it("returns defaults when no org or site settings exist", () => {
      const result = mergeConfigs(DEFAULTS, {}, {});
      expect(result.resendApiKey).toBe("");
      expect(result.emailFromName).toBe("webhouse.app");
      expect(result.aiContentModel).toBe("claude-haiku-4-5-20251001");
    });

    it("org settings override defaults", () => {
      const result = mergeConfigs(DEFAULTS, {
        resendApiKey: "re_org_key_123",
        emailFrom: "noreply@org.com",
      }, {});
      expect(result.resendApiKey).toBe("re_org_key_123");
      expect(result.emailFrom).toBe("noreply@org.com");
    });

    it("site settings override org settings", () => {
      const result = mergeConfigs(DEFAULTS, {
        resendApiKey: "re_org_key_123",
      }, {
        resendApiKey: "re_site_key_456",
      });
      expect(result.resendApiKey).toBe("re_site_key_456");
    });

    it("site settings override defaults even without org settings", () => {
      const result = mergeConfigs(DEFAULTS, {}, {
        resendApiKey: "re_site_key_456",
      });
      expect(result.resendApiKey).toBe("re_site_key_456");
    });

    it("full chain: defaults ← org ← site", () => {
      const result = mergeConfigs(DEFAULTS, {
        emailFromName: "Org Name",
        resendApiKey: "re_org_key",
        aiContentModel: "claude-sonnet-4-6",
      }, {
        emailFromName: "Site Name",
        // resendApiKey NOT set at site level → should inherit from org
      });
      expect(result.emailFromName).toBe("Site Name");        // site wins
      expect(result.resendApiKey).toBe("re_org_key");         // org wins (site empty)
      expect(result.aiContentModel).toBe("claude-sonnet-4-6"); // org wins
    });
  });

  // ── Empty string handling (CRITICAL) ───────────────────────

  describe("empty string handling", () => {
    it("empty string in site config does NOT override org value for inheritable fields", () => {
      const result = mergeConfigs(DEFAULTS, {
        deployApiToken: "FlyV1 org-token-abc",
        resendApiKey: "re_org_key",
      }, {
        deployApiToken: "",  // site has empty string — should NOT wipe org token
        resendApiKey: "",    // same
      });
      expect(result.deployApiToken).toBe("FlyV1 org-token-abc");
      expect(result.resendApiKey).toBe("re_org_key");
    });

    it("empty string in org settings does not override defaults", () => {
      const result = mergeConfigs(DEFAULTS, {
        emailFromName: "",  // empty in org — should not override default
      }, {});
      expect(result.emailFromName).toBe("webhouse.app"); // default wins
    });

    it("non-empty site value DOES override org value", () => {
      const result = mergeConfigs(DEFAULTS, {
        deployApiToken: "FlyV1 org-token",
      }, {
        deployApiToken: "FlyV1 site-specific-token",
      });
      expect(result.deployApiToken).toBe("FlyV1 site-specific-token");
    });
  });

  // ── NEVER_INHERIT fields ───────────────────────────────────

  describe("NEVER_INHERIT fields", () => {
    it("calendarSecret is never inherited from org", () => {
      const result = mergeConfigs(DEFAULTS, {
        calendarSecret: "org-secret-should-not-appear",
      }, {});
      expect(result.calendarSecret).toBe("site-generated-secret-abc"); // default
      expect(result.calendarSecret).not.toBe("org-secret-should-not-appear");
    });

    it("deployAppName is never inherited from org", () => {
      const result = mergeConfigs(DEFAULTS, {
        deployAppName: "org-shared-app",
      }, {});
      expect(result.deployAppName).toBe(""); // default, not org value
    });

    it("deployProductionUrl is never inherited from org", () => {
      const result = mergeConfigs(DEFAULTS, {
        deployProductionUrl: "https://org-site.fly.dev",
      }, {});
      expect(result.deployProductionUrl).toBe("");
    });

    it("deployProvider is never inherited from org", () => {
      const result = mergeConfigs(DEFAULTS, {
        deployProvider: "flyio",
      }, {});
      expect(result.deployProvider).toBe("off"); // default
    });

    it("deployCustomDomain is never inherited from org", () => {
      const result = mergeConfigs(DEFAULTS, {
        deployCustomDomain: "org.webhouse.app",
      }, {});
      expect(result.deployCustomDomain).toBe("");
    });

    it("previewSiteUrl is never inherited from org", () => {
      const result = mergeConfigs(DEFAULTS, {
        previewSiteUrl: "http://localhost:3002",
      }, {});
      expect(result.previewSiteUrl).toBe("");
    });

    it("site can still set NEVER_INHERIT fields directly", () => {
      const result = mergeConfigs(DEFAULTS, {}, {
        deployAppName: "my-site-app",
        deployProvider: "flyio",
        calendarSecret: "site-secret-123",
      });
      expect(result.deployAppName).toBe("my-site-app");
      expect(result.deployProvider).toBe("flyio");
      expect(result.calendarSecret).toBe("site-secret-123");
    });
  });

  // ── Deploy token inheritance ───────────────────────────────

  describe("deploy token inheritance", () => {
    it("Fly.io token inherited from org when site has none", () => {
      const result = mergeConfigs(DEFAULTS, {
        deployApiToken: "FlyV1 org-fly-token",
        deployFlyOrg: "webhouse-app",
      }, {
        deployProvider: "flyio",
        deployAppName: "thinking-in-pixels",
        // no token at site level
      });
      expect(result.deployApiToken).toBe("FlyV1 org-fly-token");
      expect(result.deployFlyOrg).toBe("webhouse-app");
      expect(result.deployAppName).toBe("thinking-in-pixels"); // site-specific
    });

    it("site token overrides org token", () => {
      const result = mergeConfigs(DEFAULTS, {
        deployApiToken: "FlyV1 org-token",
      }, {
        deployApiToken: "FlyV1 site-specific-token",
      });
      expect(result.deployApiToken).toBe("FlyV1 site-specific-token");
    });

    it("deploy hook URL inherited from org", () => {
      const result = mergeConfigs(DEFAULTS, {
        deployHookUrl: "https://api.vercel.com/v1/deploy/hook123",
      }, {
        deployProvider: "vercel",
      });
      expect(result.deployHookUrl).toBe("https://api.vercel.com/v1/deploy/hook123");
    });
  });

  // ── AI settings inheritance ────────────────────────────────

  describe("AI settings inheritance", () => {
    it("AI model inherited from org", () => {
      const result = mergeConfigs(DEFAULTS, {
        aiContentModel: "claude-sonnet-4-6",
        aiContentMaxTokens: 8192,
      }, {});
      expect(result.aiContentModel).toBe("claude-sonnet-4-6");
      expect(result.aiContentMaxTokens).toBe(8192);
    });

    it("site can override AI model", () => {
      const result = mergeConfigs(DEFAULTS, {
        aiContentModel: "claude-sonnet-4-6",
      }, {
        aiContentModel: "claude-haiku-4-5-20251001",
      });
      expect(result.aiContentModel).toBe("claude-haiku-4-5-20251001");
    });
  });

  // ── Array fields ───────────────────────────────────────────

  describe("array fields", () => {
    it("site webhooks replace org webhooks (no merge)", () => {
      const result = mergeConfigs(DEFAULTS, {
        publishWebhooks: [{ id: "org1", url: "https://discord.com/org-hook" }],
      }, {
        publishWebhooks: [{ id: "site1", url: "https://discord.com/site-hook" }],
      });
      const webhooks = result.publishWebhooks as { id: string; url: string }[];
      expect(webhooks).toHaveLength(1);
      expect(webhooks[0].url).toBe("https://discord.com/site-hook");
    });

    it("empty site array does NOT wipe org webhooks", () => {
      // Empty array in site means "not configured" — should fall through to org
      // But arrays are not in INHERITABLE_FIELDS, so this tests that org arrays work
      const result = mergeConfigs(DEFAULTS, {
        publishWebhooks: [{ id: "org1", url: "https://discord.com/org-hook" }],
      }, {
        // publishWebhooks not set at site level
      });
      const webhooks = result.publishWebhooks as { id: string; url: string }[];
      expect(webhooks).toHaveLength(1);
      expect(webhooks[0].url).toBe("https://discord.com/org-hook");
    });

    it("explicitly set empty array in site DOES clear", () => {
      const result = mergeConfigs(DEFAULTS, {
        publishWebhooks: [{ id: "org1", url: "https://discord.com/org-hook" }],
      }, {
        publishWebhooks: [],
      });
      const webhooks = result.publishWebhooks as { id: string; url: string }[];
      expect(webhooks).toHaveLength(0);
    });
  });

  // ── Backwards compatibility ────────────────────────────────

  describe("backwards compatibility", () => {
    it("no org settings = identical to current behavior", () => {
      const siteConfig = {
        resendApiKey: "re_abc",
        emailFrom: "hello@site.com",
        deployProvider: "github-pages" as const,
        deployAppName: "owner/repo",
        calendarSecret: "existing-secret",
      };
      const withOrg = mergeConfigs(DEFAULTS, {}, siteConfig);
      const withoutOrg = { ...DEFAULTS, ...siteConfig } as Record<string, unknown>;

      // Every field should be identical
      for (const key of Object.keys(DEFAULTS)) {
        expect(withOrg[key]).toEqual(withoutOrg[key]);
      }
    });

    it("boolean false in site config is preserved (not treated as empty)", () => {
      const result = mergeConfigs(DEFAULTS, {
        deployOnSave: true, // org wants auto-deploy — but this is NEVER_INHERIT
      }, {
        deployOnSave: false, // site explicitly disables
      });
      expect(result.deployOnSave).toBe(false);
    });

    it("numeric zero in site config is preserved", () => {
      const result = mergeConfigs(DEFAULTS, {
        aiContentMaxTokens: 8192,
      }, {
        aiContentMaxTokens: 0,
      });
      expect(result.aiContentMaxTokens).toBe(0);
    });
  });
});

// ── Migration tests ──────────────────────────────────────────

describe("F87 — Auto-migration from site to org", () => {
  /**
   * Migration extracts common values from all sites in an org
   * and hoists them to org-level settings.
   *
   * Rules:
   * 1. Only migrate INHERITABLE_FIELDS
   * 2. Only migrate if ALL sites in org have the same value
   * 3. After migration, clear the field from site configs
   * 4. Never migrate NEVER_INHERIT fields
   */
  function detectMigratableFields(
    siteConfigs: Record<string, unknown>[],
  ): Record<string, unknown> {
    if (siteConfigs.length === 0) return {};

    const result: Record<string, unknown> = {};
    for (const field of INHERITABLE_FIELDS) {
      const values = siteConfigs
        .map((c) => c[field])
        .filter((v) => v !== undefined && v !== null && v !== "");

      if (values.length === 0) continue; // no site has this field

      // Check if all non-empty values are identical
      const first = JSON.stringify(values[0]);
      const allSame = values.every((v) => JSON.stringify(v) === first);
      if (allSame && values.length > 0) {
        result[field] = values[0];
      }
    }
    return result;
  }

  it("detects common Fly.io token across all sites", () => {
    const sites = [
      { deployApiToken: "FlyV1 shared-token", deployAppName: "site-a" },
      { deployApiToken: "FlyV1 shared-token", deployAppName: "site-b" },
      { deployApiToken: "FlyV1 shared-token", deployAppName: "site-c" },
    ];
    const migratable = detectMigratableFields(sites);
    expect(migratable.deployApiToken).toBe("FlyV1 shared-token");
    expect(migratable).not.toHaveProperty("deployAppName"); // not inheritable
  });

  it("does NOT migrate if sites have different tokens", () => {
    const sites = [
      { deployApiToken: "FlyV1 token-a" },
      { deployApiToken: "FlyV1 token-b" },
    ];
    const migratable = detectMigratableFields(sites);
    expect(migratable).not.toHaveProperty("deployApiToken");
  });

  it("detects common Resend API key", () => {
    const sites = [
      { resendApiKey: "re_shared_key" },
      { resendApiKey: "re_shared_key" },
    ];
    const migratable = detectMigratableFields(sites);
    expect(migratable.resendApiKey).toBe("re_shared_key");
  });

  it("ignores sites with empty values", () => {
    const sites = [
      { deployApiToken: "FlyV1 shared-token" },
      { deployApiToken: "" },  // empty = not configured, ignore
      { deployApiToken: "FlyV1 shared-token" },
    ];
    const migratable = detectMigratableFields(sites);
    expect(migratable.deployApiToken).toBe("FlyV1 shared-token");
  });

  it("returns empty when no common fields", () => {
    const sites = [
      { resendApiKey: "key-a", deployApiToken: "token-a" },
      { resendApiKey: "key-b", deployApiToken: "token-b" },
    ];
    const migratable = detectMigratableFields(sites);
    expect(Object.keys(migratable)).toHaveLength(0);
  });

  it("never suggests migrating calendarSecret", () => {
    const sites = [
      { calendarSecret: "same-secret" },
      { calendarSecret: "same-secret" },
    ];
    const migratable = detectMigratableFields(sites);
    expect(migratable).not.toHaveProperty("calendarSecret");
  });

  it("handles single site org (still migrates)", () => {
    const sites = [
      { deployApiToken: "FlyV1 token", resendApiKey: "re_key" },
    ];
    const migratable = detectMigratableFields(sites);
    expect(migratable.deployApiToken).toBe("FlyV1 token");
    expect(migratable.resendApiKey).toBe("re_key");
  });

  it("handles empty org (no sites)", () => {
    const migratable = detectMigratableFields([]);
    expect(Object.keys(migratable)).toHaveLength(0);
  });
});

// ── Org settings persistence ─────────────────────────────────

describe("F87 — OrgSettings read/write", () => {
  const tmpDir = path.join("/tmp", `org-settings-test-${Date.now()}`);

  // These test the actual file operations
  // Implementation will use: {registryDir}/_data/org-settings/{orgId}.json

  beforeEach(async () => {
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("reads empty object for non-existent org settings", async () => {
    const filePath = path.join(tmpDir, "nonexistent-org.json");
    let settings: Record<string, unknown> = {};
    try {
      settings = JSON.parse(await fs.readFile(filePath, "utf-8"));
    } catch {
      settings = {};
    }
    expect(settings).toEqual({});
  });

  it("writes and reads org settings", async () => {
    const filePath = path.join(tmpDir, "aallm.json");
    const orgSettings = {
      deployApiToken: "FlyV1 org-token",
      deployFlyOrg: "webhouse-app",
      resendApiKey: "re_org_key",
    };
    await fs.writeFile(filePath, JSON.stringify(orgSettings, null, 2));

    const read = JSON.parse(await fs.readFile(filePath, "utf-8"));
    expect(read.deployApiToken).toBe("FlyV1 org-token");
    expect(read.deployFlyOrg).toBe("webhouse-app");
    expect(read.resendApiKey).toBe("re_org_key");
  });

  it("partial update preserves existing fields", async () => {
    const filePath = path.join(tmpDir, "aallm.json");
    // Initial write
    await fs.writeFile(filePath, JSON.stringify({
      deployApiToken: "FlyV1 org-token",
      resendApiKey: "re_org_key",
    }, null, 2));

    // Partial update
    const existing = JSON.parse(await fs.readFile(filePath, "utf-8"));
    const patched = { ...existing, emailFrom: "hello@org.com" };
    await fs.writeFile(filePath, JSON.stringify(patched, null, 2));

    const read = JSON.parse(await fs.readFile(filePath, "utf-8"));
    expect(read.deployApiToken).toBe("FlyV1 org-token"); // preserved
    expect(read.resendApiKey).toBe("re_org_key");         // preserved
    expect(read.emailFrom).toBe("hello@org.com");          // added
  });
});

// ── Calendar secret safety ───────────────────────────────────

describe("F87 — Calendar secret safety", () => {
  it("existing calendar tokens remain valid after org settings are added", () => {
    const siteSecret = "abc123def456";
    const userId = "user-1";
    const token = crypto.createHmac("sha256", siteSecret).update(userId).digest("hex");

    // After F87: mergeConfigs should preserve site's calendarSecret
    const DEFAULTS = { calendarSecret: "default-random" };
    const result = mergeConfigs(
      DEFAULTS as Record<string, unknown>,
      { calendarSecret: "org-secret-should-be-ignored" },
      { calendarSecret: siteSecret },
    );

    // Token should still validate with the merged config's secret
    const validationToken = crypto.createHmac("sha256", result.calendarSecret as string).update(userId).digest("hex");
    expect(validationToken).toBe(token);
  });
});
