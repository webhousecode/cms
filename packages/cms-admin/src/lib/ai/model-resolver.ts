/**
 * Central AI model resolver.
 *
 * Every AI call in the CMS should use getModel(purpose) instead of
 * hardcoding a model string. This keeps model selection in one place
 * so upgrades and deprecations only need a single change.
 *
 * Purposes:
 *   "content"  — cheap/fast text tasks: SEO, rewrite, proofread, htmldoc, link-fix
 *   "code"     — smart tasks: chat, interactives, generate content, agents
 *   "premium"  — highest quality: brand voice
 *
 * Each purpose maps to a site config field (inheritable from org):
 *   content  → aiContentModel
 *   code     → aiCodeModel
 *   premium  → aiPremiumModel
 */

import { readSiteConfig } from "@/lib/site-config";

export type ModelPurpose = "content" | "code" | "premium";

const DEFAULTS: Record<ModelPurpose, string> = {
  content: "claude-haiku-4-5-20251001",
  code: "claude-sonnet-4-6",
  premium: "claude-opus-4-6",
};

const CONFIG_KEYS: Record<ModelPurpose, string> = {
  content: "aiContentModel",
  code: "aiCodeModel",
  premium: "aiPremiumModel",
};

/** Resolve the model for a given purpose from site config (with org inheritance). */
export async function getModel(purpose: ModelPurpose): Promise<string> {
  try {
    const config = await readSiteConfig();
    const key = CONFIG_KEYS[purpose] as keyof typeof config;
    const value = config[key];
    if (typeof value === "string" && value.length > 0) return value;
  } catch { /* fallback to default */ }
  return DEFAULTS[purpose];
}

/** Synchronous fallback — use when you already have the config loaded. */
export function resolveModel(
  purpose: ModelPurpose,
  config: Record<string, unknown>,
): string {
  const key = CONFIG_KEYS[purpose];
  const value = config[key];
  if (typeof value === "string" && value.length > 0) return value;
  return DEFAULTS[purpose];
}
