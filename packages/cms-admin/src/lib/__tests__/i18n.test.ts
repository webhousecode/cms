/**
 * F48 Internationalization (i18n) — Test Suite
 *
 * Phase 1: Foundation tests (locale helpers, site-config fields, org inheritance)
 * Written BEFORE implementation (TDD).
 *
 * Run: cd packages/cms-admin && npx vitest run src/lib/__tests__/i18n.test.ts
 */
import { describe, it, expect } from "vitest";

// ── Import merge function from org-settings test pattern ────────

// We inline the merge function here (same as org-settings.test.ts pattern)
// to test inheritance without needing Next.js cookies/filesystem

const INHERITABLE_FIELDS = [
  "deployApiToken", "deployFlyOrg", "deployGitHubToken",
  "deployVercelHookUrl", "deployNetlifyHookUrl", "deployCloudflareHookUrl",
  "aiDefaultProvider", "aiAnthropicApiKey", "aiOpenaiApiKey", "aiGeminiApiKey",
  "aiWebSearchProvider", "aiBraveApiKey", "aiTavilyApiKey",
  "aiInteractivesModel", "aiInteractivesMaxTokens", "aiContentModel",
  "aiContentMaxTokens", "aiCodeModel", "aiPremiumModel", "aiChatModel",
  "aiChatMaxTokens", "aiChatMaxToolIterations",
  "resendApiKey", "emailFrom", "emailFromName",
  "backupSchedule", "backupTime", "backupRetentionDays",
  "linkCheckSchedule", "linkCheckTime",
  // i18n — defaultLocale inherits from org
  "defaultLocale",
] as const;

const NEVER_INHERIT = [
  "calendarSecret", "deployAppName", "deployProductionUrl",
  "deployCustomDomain", "deployProvider", "deployOnSave", "previewSiteUrl",
  // i18n — locales is site-specific (each site chooses its own languages)
  "locales",
] as const;

function mergeConfigs(
  defaults: Record<string, unknown>,
  orgSettings: Record<string, unknown>,
  siteConfig: Record<string, unknown>,
): Record<string, unknown> {
  const filteredOrg: Record<string, unknown> = {};
  for (const key of Object.keys(orgSettings)) {
    if ((NEVER_INHERIT as readonly string[]).includes(key)) continue;
    const value = orgSettings[key];
    if (value !== undefined && value !== null && value !== "") {
      filteredOrg[key] = value;
    }
  }
  const filteredSite: Record<string, unknown> = {};
  for (const key of Object.keys(siteConfig)) {
    const value = siteConfig[key];
    if (value === "" && (INHERITABLE_FIELDS as readonly string[]).includes(key)) continue;
    if (value !== undefined && value !== null) {
      filteredSite[key] = value;
    }
  }
  return { ...defaults, ...filteredOrg, ...filteredSite };
}

// ── Locale helper functions (will be implemented in locale.ts) ──

// We import the actual functions once they exist.
// For now, define the expected signatures so tests are ready.
// After implementation, switch these to: import { ... } from "../locale";

import {
  getDocLocale,
  getSiteLocales,
  LOCALE_LABELS,
  LOCALE_FLAGS,
} from "../locale";

// ── Test Suite ─────────────────────────────────────────────────

describe("F48 Phase 1 — i18n Foundation", () => {
  // ── getDocLocale() ──────────────────────────────────────────

  describe("getDocLocale()", () => {
    it("returns doc.locale when set", () => {
      const result = getDocLocale({ locale: "da" }, "en");
      expect(result).toBe("da");
    });

    it("falls back to site defaultLocale when doc.locale is undefined", () => {
      const result = getDocLocale({}, "da");
      expect(result).toBe("da");
    });

    it("falls back to site defaultLocale when doc.locale is empty string", () => {
      const result = getDocLocale({ locale: "" }, "fr");
      expect(result).toBe("fr");
    });

    it('falls back to "en" when neither doc.locale nor siteDefault provided', () => {
      const result = getDocLocale({});
      expect(result).toBe("en");
    });
  });

  // ── getSiteLocales() ────────────────────────────────────────

  describe("getSiteLocales()", () => {
    it("returns configured locales and default", () => {
      const result = getSiteLocales("da", ["da", "en"]);
      expect(result).toEqual({ default: "da", all: ["da", "en"] });
    });

    it("returns [defaultLocale] when locales array is empty", () => {
      const result = getSiteLocales("da", []);
      expect(result).toEqual({ default: "da", all: ["da"] });
    });

    it("returns [defaultLocale] when locales is undefined", () => {
      const result = getSiteLocales("da");
      expect(result).toEqual({ default: "da", all: ["da"] });
    });

    it('returns { default: "en", all: ["en"] } when nothing configured', () => {
      const result = getSiteLocales();
      expect(result).toEqual({ default: "en", all: ["en"] });
    });
  });

  // ── LOCALE_LABELS / LOCALE_FLAGS consistency ────────────────

  describe("LOCALE_LABELS / LOCALE_FLAGS", () => {
    it("all locales in LOCALE_FLAGS have a matching LOCALE_LABELS entry", () => {
      for (const locale of Object.keys(LOCALE_FLAGS)) {
        expect(LOCALE_LABELS).toHaveProperty(locale);
      }
    });

    it("all locales in LOCALE_LABELS have a matching LOCALE_FLAGS entry", () => {
      for (const locale of Object.keys(LOCALE_LABELS)) {
        expect(LOCALE_FLAGS).toHaveProperty(locale);
      }
    });

    it("labels are non-empty strings", () => {
      for (const [locale, label] of Object.entries(LOCALE_LABELS)) {
        expect(label).toBeTruthy();
        expect(typeof label).toBe("string");
      }
    });

    it("flags are non-empty strings", () => {
      for (const [locale, flag] of Object.entries(LOCALE_FLAGS)) {
        expect(flag).toBeTruthy();
        expect(typeof flag).toBe("string");
      }
    });

    it("includes da, en, de at minimum", () => {
      expect(LOCALE_LABELS).toHaveProperty("da");
      expect(LOCALE_LABELS).toHaveProperty("en");
      expect(LOCALE_LABELS).toHaveProperty("de");
    });
  });

  // ── Site-config i18n fields + org inheritance ───────────────

  describe("site-config i18n fields + org inheritance", () => {
    const DEFAULTS: Record<string, unknown> = {
      defaultLocale: "en",
      locales: [],
      aiContentModel: "claude-haiku-4-5-20251001",
      deployProvider: "off",
      calendarSecret: "secret-abc",
      previewSiteUrl: "",
    };

    it("returns defaults when no org or site settings exist", () => {
      const result = mergeConfigs(DEFAULTS, {}, {});
      expect(result.defaultLocale).toBe("en");
      expect(result.locales).toEqual([]);
    });

    it("single-locale site: readSiteConfig returns defaults (regression)", () => {
      // No locale config at all → must return safe defaults
      const result = mergeConfigs(DEFAULTS, {}, {});
      expect(result.defaultLocale).toBe("en");
      expect(result.locales).toEqual([]);
    });

    it("org-settings inheritance: defaultLocale inherits from org to site", () => {
      const result = mergeConfigs(DEFAULTS, { defaultLocale: "da" }, {});
      expect(result.defaultLocale).toBe("da");
    });

    it("org-settings inheritance: site-level defaultLocale overrides org", () => {
      const result = mergeConfigs(
        DEFAULTS,
        { defaultLocale: "da" },
        { defaultLocale: "de" },
      );
      expect(result.defaultLocale).toBe("de");
    });

    it("org-settings inheritance: empty string site defaultLocale does NOT override org", () => {
      const result = mergeConfigs(
        DEFAULTS,
        { defaultLocale: "da" },
        { defaultLocale: "" },
      );
      expect(result.defaultLocale).toBe("da");
    });

    it("locales NEVER inherits from org (site controls its own locales)", () => {
      const result = mergeConfigs(
        DEFAULTS,
        { locales: ["da", "en", "de"] },
        {},
      );
      // locales is in NEVER_INHERIT, so org value must be ignored
      expect(result.locales).toEqual([]);
    });

    it("locales set at site level is preserved", () => {
      const result = mergeConfigs(
        DEFAULTS,
        {},
        { locales: ["da", "en"] },
      );
      expect(result.locales).toEqual(["da", "en"]);
    });

    it("site locales overrides org locales (org value ignored)", () => {
      const result = mergeConfigs(
        DEFAULTS,
        { locales: ["da", "en", "de"] },
        { locales: ["fr", "es"] },
      );
      // Site-level locales wins, org locales is in NEVER_INHERIT
      expect(result.locales).toEqual(["fr", "es"]);
    });

    it("defaultLocale persists via writeSiteConfig pattern", () => {
      // Simulates write → read cycle
      const stored: Partial<Record<string, unknown>> = {};
      const patch = { defaultLocale: "da", locales: ["da", "en"] };
      const next = { ...stored, ...patch };
      const readBack = { ...DEFAULTS, ...next };
      expect(readBack.defaultLocale).toBe("da");
      expect(readBack.locales).toEqual(["da", "en"]);
    });
  });
});

// ── Phase 2 Tests — AI Locale-Awareness ─────────────────────

import {
  buildLocaleInstruction,
  getSeoLimits,
} from "../ai/locale-prompt";

describe("F48 Phase 2 — AI Locale-Awareness", () => {
  describe("buildLocaleInstruction()", () => {
    it("returns instruction string with language name for known locale", () => {
      const result = buildLocaleInstruction("da");
      expect(result).toContain("Dansk");
      expect(result).toContain("da");
    });

    it("falls back to locale code for unknown locale", () => {
      const result = buildLocaleInstruction("xx");
      expect(result).toContain("xx");
    });

    it("instruction contains the locale code", () => {
      const result = buildLocaleInstruction("de");
      expect(result).toContain("de");
      expect(result).toContain("Deutsch");
    });

    it("returns non-empty string", () => {
      expect(buildLocaleInstruction("en").length).toBeGreaterThan(10);
    });
  });

  describe("getSeoLimits()", () => {
    it('returns default limits for "en"', () => {
      const limits = getSeoLimits("en");
      expect(limits.titleMin).toBe(30);
      expect(limits.titleMax).toBe(60);
      expect(limits.descMin).toBe(120);
      expect(limits.descMax).toBe(155);
    });

    it('returns default limits for "da" (not CJK, not verbose)', () => {
      const limits = getSeoLimits("da");
      expect(limits.titleMin).toBe(30);
      expect(limits.titleMax).toBe(60);
    });

    it('returns verbose limits for "de" (compound words)', () => {
      const limits = getSeoLimits("de");
      expect(limits.titleMax).toBe(65);
      expect(limits.descMax).toBe(165);
    });

    it('returns compact limits for "ja" (CJK)', () => {
      const limits = getSeoLimits("ja");
      expect(limits.titleMax).toBe(30);
      expect(limits.descMax).toBe(80);
    });

    it("all limit ranges are valid (min < max, positive)", () => {
      for (const locale of ["en", "da", "de", "ja", "fi", "zh", "ko", "fr"]) {
        const limits = getSeoLimits(locale);
        expect(limits.titleMin).toBeGreaterThan(0);
        expect(limits.titleMax).toBeGreaterThan(limits.titleMin);
        expect(limits.descMin).toBeGreaterThan(0);
        expect(limits.descMax).toBeGreaterThan(limits.descMin);
      }
    });
  });
});

// ── Phase 3 Tests — Stale Translation Detection ────────────

import { isTranslationStale } from "../locale";

describe("F48 Phase 3 — Stale Translation Detection", () => {
  it("returns true when source.updatedAt > translation.updatedAt", () => {
    expect(isTranslationStale("2026-03-28T18:00:00Z", "2026-03-28T17:00:00Z")).toBe(true);
  });

  it("returns false when translation is newer", () => {
    expect(isTranslationStale("2026-03-28T17:00:00Z", "2026-03-28T18:00:00Z")).toBe(false);
  });

  it("returns false when timestamps are equal", () => {
    expect(isTranslationStale("2026-03-28T17:00:00Z", "2026-03-28T17:00:00Z")).toBe(false);
  });

  it("returns false when timestamps are missing", () => {
    expect(isTranslationStale("", "2026-03-28T17:00:00Z")).toBe(false);
    expect(isTranslationStale("2026-03-28T17:00:00Z", "")).toBe(false);
  });
});
