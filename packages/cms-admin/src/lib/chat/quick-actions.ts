/**
 * Canonical cacheable quick-actions (F158).
 *
 * These are the "standard" chat prompts a customer clicks first — the same set
 * across cms-admin's own welcome screen and the site clients (broberg, sanne).
 * Each answer is cached per-site so the click is instant; see quick-cache.ts.
 *
 * `contentDependent` classifies whether the answer changes with the site's
 * content/schema/settings (invalidated on write) vs the near-static tool list.
 *
 * The prompts ask for the site's primary language so a Danish site (broberg)
 * gets a Danish cached answer without a per-locale cache dimension.
 */
export interface QuickAction {
  key: string;
  prompt: string;
  contentDependent: boolean;
}

const LANG_HINT = " Answer in the site's primary content language.";

export const QUICK_ACTIONS: QuickAction[] = [
  { key: "overview", contentDependent: true, prompt: "Give me an overview of my site — how many collections, documents and drafts do I have?" + LANG_HINT },
  { key: "drafts", contentDependent: true, prompt: "Show me all unpublished drafts across all collections." + LANG_HINT },
  { key: "site-info", contentDependent: true, prompt: "Tell me everything about my site — collections, fields, settings, deploy config and content stats." + LANG_HINT },
  { key: "capabilities", contentDependent: false, prompt: "List all the tools and capabilities you have — what can I ask you to do?" + LANG_HINT },
];

export const quickActionByKey = (key: string): QuickAction | undefined =>
  QUICK_ACTIONS.find((q) => q.key === key);
