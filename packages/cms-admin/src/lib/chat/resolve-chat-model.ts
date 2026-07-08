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
 * caller passes as `getModel("code")` = `mistral-large-latest`).
 */

/** Models a chat request may explicitly ask for via the `model` param. */
export const CHAT_REQUESTABLE_MODELS = [
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-20250514",
  "claude-sonnet-4-6",
  "claude-opus-4-20250514",
  "claude-opus-4-6",
] as const;

/** True for ids the Mistral provider accepts (mistral-large/small/medium,
 *  ministral, codestral, open-mistral/mixtral, pixtral). Everything else
 *  (claude-*, gpt-*, gemini-*, …) is rejected so it never reaches Mistral. */
export function isMistralModel(model: string): boolean {
  return /^(mistral|ministral|codestral|open-m|pixtral)/.test(model);
}

export function resolveChatModel(
  requestedModel: string | undefined,
  siteModel: string | undefined,
  codeModel: string,
): string {
  const candidate =
    requestedModel && (CHAT_REQUESTABLE_MODELS as readonly string[]).includes(requestedModel)
      ? requestedModel
      : siteModel || codeModel;
  // Guard: the chat can only talk to Mistral. Anything non-Mistral (esp. a
  // stale Claude aiChatModel) falls back to the code-tier Mistral model.
  return isMistralModel(candidate) ? candidate : codeModel;
}
