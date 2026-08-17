/**
 * Model resolution for the CMS AI chat.
 *
 * The chat is PINNED to the Mistral (EU/GDPR) provider — `route.ts` wraps every
 * call in `mistralModel()`. So whatever model id we resolve MUST be one the
 * Mistral API accepts. A stale `"claude-…"` value in `site-config.aiChatModel`
 * (or a Claude id in the requestable list) sent to Mistral 400s with
 * "Invalid model" and the whole chat errors out — this was a live production
 * bug across every site whose aiChatModel defaulted to a Claude id.
 *
 * This resolver is the guard: whatever id we land on, if it isn't a Mistral
 * model we fall back to the code-tier Mistral model (`codeModel`, which the
 * caller passes as `getModel("code")`). And because that fallback is ALSO
 * site-config-driven (`aiCodeModel`) and can be poisoned with a Claude id on
 * the same sites, we finally guarantee a Mistral id via the canonical
 * `DEFAULTS.code` constant — so the chat can never send a non-Mistral model to
 * Mistral no matter how the config drifted.
 */

import { DEFAULTS, isMistralModel } from "../ai/model-defaults";

// Re-exported for the existing importers/tests. The predicate now lives with
// the defaults because it guards every Mistral-pinned call, not only the chat's
// — see mistralModel() in ai/client.ts.
export { isMistralModel };

/** Models a chat request may explicitly ask for via the `model` param. */
export const CHAT_REQUESTABLE_MODELS = [
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-20250514",
  "claude-sonnet-4-6",
  "claude-opus-4-20250514",
  "claude-opus-4-6",
] as const;

export function resolveChatModel(
  requestedModel: string | undefined,
  siteModel: string | undefined,
  codeModel: string,
): string {
  const candidate =
    requestedModel && (CHAT_REQUESTABLE_MODELS as readonly string[]).includes(requestedModel)
      ? requestedModel
      : siteModel || codeModel;
  // Guard: the chat can only talk to Mistral. Prefer the candidate, else the
  // code-tier model — but both are site-config-driven and can be Claude-poisoned
  // on the same site, so the last resort is the canonical Mistral default.
  if (isMistralModel(candidate)) return candidate;
  if (isMistralModel(codeModel)) return codeModel;
  return DEFAULTS.code;
}
