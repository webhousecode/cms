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

// ── Per-locale Media Metadata helpers ─────────────────────────
// These mirror the logic we'll implement — tested here as pure functions.

/** Upgrade legacy single-locale media meta to per-locale format */
function upgradeMediaMeta(entry: {
  aiCaption?: string;
  aiAlt?: string;
  aiCaptions?: Record<string, string>;
  aiAlts?: Record<string, string>;
}, locale: string): { captions: Record<string, string>; alts: Record<string, string> } {
  const captions = entry.aiCaptions ? { ...entry.aiCaptions } : {};
  const alts = entry.aiAlts ? { ...entry.aiAlts } : {};
  // Backwards compat: if legacy single fields exist and per-locale doesn't have that locale
  if (entry.aiCaption && !captions[locale]) captions[locale] = entry.aiCaption;
  if (entry.aiAlt && !alts[locale]) alts[locale] = entry.aiAlt;
  return { captions, alts };
}

/** Pick best alt-text for a given locale with fallback chain */
function pickAlt(
  entry: { aiAlt?: string; aiAlts?: Record<string, string> },
  locale: string,
  defaultLocale?: string,
): string | null {
  // 1. Per-locale match
  if (entry.aiAlts?.[locale]) return entry.aiAlts[locale];
  // 2. Legacy single field
  if (entry.aiAlt) return entry.aiAlt;
  // 3. Default locale fallback
  if (defaultLocale && entry.aiAlts?.[defaultLocale]) return entry.aiAlts[defaultLocale];
  // 4. Any available
  if (entry.aiAlts) {
    const first = Object.values(entry.aiAlts)[0];
    if (first) return first;
  }
  return null;
}

/** Pick best caption for a given locale with fallback chain */
function pickCaption(
  entry: { aiCaption?: string; aiCaptions?: Record<string, string> },
  locale: string,
  defaultLocale?: string,
): string | null {
  if (entry.aiCaptions?.[locale]) return entry.aiCaptions[locale];
  if (entry.aiCaption) return entry.aiCaption;
  if (defaultLocale && entry.aiCaptions?.[defaultLocale]) return entry.aiCaptions[defaultLocale];
  if (entry.aiCaptions) {
    const first = Object.values(entry.aiCaptions)[0];
    if (first) return first;
  }
  return null;
}

/** Extract translatable SEO fields from _seo object */
function extractTranslatableSeo(seo: Record<string, unknown>): {
  metaTitle?: string;
  metaDescription?: string;
  keywords?: string[];
} {
  const result: Record<string, unknown> = {};
  if (typeof seo.metaTitle === "string" && seo.metaTitle.trim()) result.metaTitle = seo.metaTitle;
  if (typeof seo.metaDescription === "string" && seo.metaDescription.trim()) result.metaDescription = seo.metaDescription;
  if (Array.isArray(seo.keywords) && seo.keywords.length > 0) result.keywords = seo.keywords;
  return result as { metaTitle?: string; metaDescription?: string; keywords?: string[] };
}

/** Merge translated SEO fields back into _seo object (preserving non-translatable fields) */
function mergeSeoTranslation(
  originalSeo: Record<string, unknown>,
  translatedSeo: Record<string, unknown>,
): Record<string, unknown> {
  return { ...originalSeo, ...translatedSeo };
}

// ── Tests ─────────────────────────────────────────────────────

describe("F48 — Per-locale Media Metadata", () => {
  describe("upgradeMediaMeta() — backwards compatibility", () => {
    it("upgrades legacy single-field to per-locale", () => {
      const result = upgradeMediaMeta(
        { aiCaption: "Et billede af en kat", aiAlt: "Kat på sofa" },
        "da",
      );
      expect(result.captions).toEqual({ da: "Et billede af en kat" });
      expect(result.alts).toEqual({ da: "Kat på sofa" });
    });

    it("preserves per-locale fields when they exist", () => {
      const result = upgradeMediaMeta(
        {
          aiCaption: "Et billede af en kat",
          aiCaptions: { da: "En kat", en: "A cat" },
          aiAlt: "Kat",
          aiAlts: { da: "Kat på sofa", en: "Cat on sofa" },
        },
        "da",
      );
      expect(result.captions).toEqual({ da: "En kat", en: "A cat" });
      expect(result.alts).toEqual({ da: "Kat på sofa", en: "Cat on sofa" });
    });

    it("does NOT overwrite per-locale with legacy if locale already exists", () => {
      const result = upgradeMediaMeta(
        {
          aiCaption: "LEGACY CAPTION",
          aiCaptions: { da: "PER-LOCALE CAPTION" },
          aiAlt: "LEGACY ALT",
          aiAlts: { da: "PER-LOCALE ALT" },
        },
        "da",
      );
      expect(result.captions.da).toBe("PER-LOCALE CAPTION");
      expect(result.alts.da).toBe("PER-LOCALE ALT");
    });

    it("handles empty entry gracefully", () => {
      const result = upgradeMediaMeta({}, "da");
      expect(result.captions).toEqual({});
      expect(result.alts).toEqual({});
    });
  });

  describe("pickAlt() — locale-aware alt-text selection", () => {
    it("returns exact locale match from per-locale", () => {
      expect(pickAlt({ aiAlts: { da: "Dansk alt", en: "English alt" } }, "en")).toBe("English alt");
    });

    it("falls back to legacy aiAlt when per-locale missing", () => {
      expect(pickAlt({ aiAlt: "Legacy alt" }, "en")).toBe("Legacy alt");
    });

    it("falls back to default locale when requested locale missing", () => {
      expect(pickAlt({ aiAlts: { da: "Dansk alt" } }, "en", "da")).toBe("Dansk alt");
    });

    it("falls back to any available when no match", () => {
      expect(pickAlt({ aiAlts: { fr: "Alt français" } }, "en", "da")).toBe("Alt français");
    });

    it("returns null when no alt available", () => {
      expect(pickAlt({}, "en")).toBeNull();
    });
  });

  describe("pickCaption() — locale-aware caption selection", () => {
    it("returns exact locale match", () => {
      expect(pickCaption({ aiCaptions: { da: "Dansk", en: "English" } }, "da")).toBe("Dansk");
    });

    it("falls back to legacy aiCaption", () => {
      expect(pickCaption({ aiCaption: "Legacy" }, "en")).toBe("Legacy");
    });

    it("returns null when nothing available", () => {
      expect(pickCaption({}, "en")).toBeNull();
    });
  });
});

describe("F48 — SEO Translation in Translate Endpoint", () => {
  describe("extractTranslatableSeo()", () => {
    it("extracts metaTitle, metaDescription, keywords", () => {
      const seo = {
        metaTitle: "Min side",
        metaDescription: "En beskrivelse af min side",
        keywords: ["cms", "webhouse"],
        ogImage: "/uploads/og.jpg",
        canonical: "https://example.com/min-side",
        score: 85,
      };
      const result = extractTranslatableSeo(seo);
      expect(result).toEqual({
        metaTitle: "Min side",
        metaDescription: "En beskrivelse af min side",
        keywords: ["cms", "webhouse"],
      });
    });

    it("skips empty/missing fields", () => {
      const seo = { metaTitle: "", metaDescription: "  ", ogImage: "/og.jpg" };
      const result = extractTranslatableSeo(seo);
      expect(result).toEqual({});
    });

    it("skips when no SEO fields present", () => {
      const result = extractTranslatableSeo({ score: 90 });
      expect(result).toEqual({});
    });

    it("handles keywords as empty array", () => {
      const result = extractTranslatableSeo({ keywords: [] });
      expect(result).toEqual({});
    });
  });

  describe("mergeSeoTranslation()", () => {
    it("merges translated fields into original, preserving non-translatable", () => {
      const original = {
        metaTitle: "Min side",
        metaDescription: "Dansk beskrivelse",
        keywords: ["cms"],
        ogImage: "/uploads/og.jpg",
        canonical: "https://example.com",
        score: 85,
      };
      const translated = {
        metaTitle: "My page",
        metaDescription: "English description",
        keywords: ["cms"],
      };
      const result = mergeSeoTranslation(original, translated);
      expect(result.metaTitle).toBe("My page");
      expect(result.metaDescription).toBe("English description");
      expect(result.ogImage).toBe("/uploads/og.jpg");
      expect(result.canonical).toBe("https://example.com");
      expect(result.score).toBe(85);
    });

    it("preserves original when no translation provided", () => {
      const original = { metaTitle: "Titel", score: 50 };
      const result = mergeSeoTranslation(original, {});
      expect(result).toEqual(original);
    });
  });
});

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
