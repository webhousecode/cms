/**
 * Canonical AI-model defaults + purpose type.
 *
 * Kept in a dependency-free module (no `@/lib/site-config`, no I/O) so it can be
 * imported by both `model-resolver.ts` and pure, unit-testable guards like
 * `chat/resolve-chat-model.ts` without dragging in server-only deps.
 *
 * These are the single source of truth for the tier default models — the chat
 * (and content/interactives/agents) are pinned to the Mistral (EU/GDPR)
 * provider, so every default here is a Mistral id.
 */
export type ModelPurpose = "content" | "code" | "premium";

export const DEFAULTS: Record<ModelPurpose, string> = {
  content: "mistral-small-latest",
  code: "mistral-large-latest",
  premium: "mistral-large-latest",
};
