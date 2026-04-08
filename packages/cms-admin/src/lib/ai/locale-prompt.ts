/**
 * F48 — Locale-aware AI prompt helpers
 *
 * Used by every AI route to ensure content is generated in the correct language.
 */
import { LOCALE_LABELS } from "../locale";

/**
 * Build a locale instruction to prepend to any AI system prompt.
 * This ensures all generated content is in the correct language.
 *
 * Defaults to English when given an empty/undefined locale — otherwise
 * the prompt would say "Write ALL output in undefined (undefined)"
 * which the LLM helpfully ignores, producing nondeterministic
 * language output. Caught during the Phase 6 polish run when a
 * workflow's Translator step inherited an unset siteConfig.defaultLocale.
 */
export function buildLocaleInstruction(locale: string | null | undefined): string {
  const safeLocale = locale && locale.trim() ? locale : "en";
  const langName = LOCALE_LABELS[safeLocale] ?? safeLocale;
  return `LANGUAGE: Write ALL output in ${langName} (${safeLocale}). This is non-negotiable — every word of generated content must be in ${langName}.`;
}

/**
 * SEO character limits vary by language.
 * German/Finnish compound words need more space; CJK needs less.
 */
export function getSeoLimits(locale: string): {
  titleMin: number;
  titleMax: number;
  descMin: number;
  descMax: number;
} {
  const compact = ["ja", "zh", "ko"];
  const verbose = ["de", "fi", "nl"];
  if (compact.includes(locale))
    return { titleMin: 15, titleMax: 30, descMin: 60, descMax: 80 };
  if (verbose.includes(locale))
    return { titleMin: 35, titleMax: 65, descMin: 130, descMax: 165 };
  return { titleMin: 30, titleMax: 60, descMin: 120, descMax: 155 };
}
