/**
 * How long a conversation may get, and what happens when it does.
 *
 * Christian chose, 28 Aug 2026: SUMMARISE the oldest, and LONG by default —
 * "når det er CMS så er vi jo ved at bruge AI-chat til at bygge noget content
 * på måske flere sprog, så her er behovet lidt længere end det er hos Sanne og
 * hos fd-sundhed." So the profile is per site, and the CMS default is the long
 * one; a visitor-facing site sets `visitor-qa` and pays less per message.
 *
 * WHY SUMMARISE RATHER THAN FORGET. What falls off the front of a long working
 * session is usually the user's OPENING INSTRUCTION — the language to write in,
 * the tone, the role. Dropping it lets the conversation continue while quietly
 * ignoring the thing it was told first, and nothing looks wrong.
 */
import { estimateTokens as pkgEstimate, type HistoryConfig } from "@broberg/chat/history";
import type { ChatMessage } from "@broberg/chat";

/**
 * OUR measured figure, from prompt-size.ts, on OUR Danish content.
 *
 * The package's own estimator is ~4 characters per token, which is an ENGLISH
 * rule of thumb: æ, ø, å and Danish word forms produce more tokens per
 * character, so it undercounts — and it undercounts in the GREEN direction,
 * where you believe you have room you do not have.
 */
export const CHARS_PER_TOKEN = 3.41;

/**
 * The fixed cost the package's estimator CANNOT see.
 *
 * `estimate(messages, system)` counts exactly those two. Our 64 tool schemas —
 * measured 28 Aug 2026 at 28,266 characters, two thirds of it JSON — are sent
 * on every single call and appear in neither argument. So the ceiling has to be
 * lowered by that amount here, or every conversation gets ~8,300 tokens closer
 * to the wall than the estimate believes. Reported to components; if the
 * package later takes the tool specs into account, this comes out.
 *
 * It is a FLOOR, not an exact figure: measured from source, and web_search /
 * web_fetch are built elsewhere so they are not in it.
 */
export const TOOL_SCHEMA_TOKENS = Math.ceil(28_266 / CHARS_PER_TOKEN);

/**
 * mistral-large-latest's documented context. NOT MEASURED BY US — there is no
 * Mistral key outside production, so components' method (raise the payload until
 * the provider 400s, then take 20% off) could not be run here.
 *
 * This is therefore an ASSUMPTION carrying a date, not a result. A provider's
 * ceiling is not a constant of nature; measure it where the key lives, write
 * down what came back, and replace this.
 */
export const ASSUMED_CONTEXT_TOKENS = 128_000;

export type HistoryProfile = "long-authoring" | "standard" | "visitor-qa";

/** Roughly how much of the window each profile hands to the conversation. */
const PROFILE_SHARE: Record<HistoryProfile, number> = {
  "long-authoring": 0.8,
  standard: 0.5,
  "visitor-qa": 0.2,
};

/**
 * The number the engine actually gets.
 *
 * context − the room the ANSWER needs − the tool schemas the estimator cannot
 * see, then the profile's share of what is left. Every subtraction is a thing
 * that genuinely occupies the window; the share on top is the safety margin.
 */
export function maxInputTokens(profile: HistoryProfile, maxOutputTokens: number): number {
  const usable = ASSUMED_CONTEXT_TOKENS - maxOutputTokens - TOOL_SCHEMA_TOKENS;
  return Math.max(4_000, Math.floor(usable * PROFILE_SHARE[profile]));
}

/** Danish-calibrated, and it counts the system prompt like the package's does. */
export function estimateDanish(messages: ChatMessage[], system?: string): number {
  const chars = (system?.length ?? 0) + messages.reduce((n, m) => n + m.content.length, 0);
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

export function buildHistoryConfig(opts: {
  profile: HistoryProfile;
  maxOutputTokens: number;
  summarise: (older: ChatMessage[]) => Promise<string>;
}): HistoryConfig {
  return {
    strategy: "compact",
    maxInputTokens: maxInputTokens(opts.profile, opts.maxOutputTokens),
    estimate: estimateDanish,
    // The most recent turns are never summarised — a user who just asked
    // something must see it answered, not paraphrased.
    keepRecent: 8,
    summarise: opts.summarise,
    warnAt: 0.8,
  };
}

/** Only these three, and an unknown value falls back rather than throwing. */
export function resolveProfile(value: unknown): HistoryProfile {
  return value === "standard" || value === "visitor-qa" || value === "long-authoring"
    ? value
    : "long-authoring";
}

// Package estimator kept imported so a future switch back is a one-line change
// and the dependency is visible rather than silently unused.
export { pkgEstimate };
