/**
 * An alarm on the chat's system instruction — the half that does NOT grow with
 * the conversation.
 *
 * Two things grow, and they are not the same thing. Christian's question on
 * 27 Aug 2026 — "why does the chat grow per message?" — is what separated them:
 *
 *   THE INSTRUCTION has a FIXED size for a given site and is resent unchanged
 *   on every message. It grows with the SITE'S SCHEMA, not the conversation.
 *   Measured: 132 lines / ~2,500 tokens for an empty site, 333 lines / 6,774
 *   actual input tokens for sanneandersen (19 collections, 143 fields), of
 *   which 56% is schema. There is no brake. This file is that brake's alarm.
 *
 *   THE HISTORY grows with every message and has no brake either — but that
 *   half belongs to @broberg's shared chat module (components F079.9), not
 *   here. Every chat in the fleet has it; a hand-rolled copy would be drift.
 *   NOTHING IN THIS FILE COVERS IT. If a future reader takes a green suite as
 *   proof the chat is bounded, they have read only half the problem.
 *
 * Why an alarm rather than a limit: at 6,774 tokens against a 128k window
 * nothing breaks today. The cost is real (the whole instruction is resent every
 * message) but the failure that actually hurts is SILENT GROWTH — a site
 * doubling its schema, nobody noticing until the bill or a context overflow.
 * So this complains early and loudly rather than refusing to run.
 */

import { renderCollectionBlock, type SiteContext } from "./system-prompt";

/**
 * The ceiling, in characters of the rendered prompt.
 *
 * MEASURED BASELINE 27 Aug 2026: sanneandersen — our largest site — renders
 * 23,093 chars / 6,774 actual input tokens. That is 3.41 chars per token on
 * this content (Danish + English schema labels); a plain length/4 estimate
 * UNDERSHOOTS by ~17%, which is why this counts characters and states the
 * ratio rather than pretending to tokenise.
 *
 * 40,000 chars is ~1.7x that baseline, ~11,700 tokens. Chosen so a site can
 * grow substantially without noise, while a schema that DOUBLES trips it. It
 * is not a functional limit — nothing breaks at 40,001 — it is the point at
 * which someone should look.
 */
export const PROMPT_CEILING_CHARS = 40_000;

/** Measured on the same content the ceiling was set against. */
const CHARS_PER_TOKEN = 3.41;

export interface PromptSizeReport {
  chars: number;
  /** Derived from the measured ratio, not a tokeniser. Named so no caller mistakes it for exact. */
  approxTokens: number;
  ceilingChars: number;
  overCeiling: boolean;
  /** Heaviest collections first — where the weight actually is. */
  biggest: Array<{ name: string; chars: number }>;
}

export function measurePromptSize(
  prompt: string,
  context: SiteContext,
): PromptSizeReport {
  const biggest = context.collections
    // The SAME renderer the prompt uses. An approximation here would name the
    // wrong collection as the heavy one — worse than naming none.
    .map((c) => ({ name: c.name, chars: renderCollectionBlock(c).length }))
    .sort((a, b) => b.chars - a.chars)
    .slice(0, 3);

  return {
    chars: prompt.length,
    approxTokens: Math.round(prompt.length / CHARS_PER_TOKEN),
    ceilingChars: PROMPT_CEILING_CHARS,
    overCeiling: prompt.length > PROMPT_CEILING_CHARS,
    biggest,
  };
}

/**
 * What to say when it trips — or null when it does not.
 *
 * Names the size, the ceiling AND the heaviest collections, so whoever reads it
 * can act without measuring again. A complaint that only says "too big" makes
 * the reader redo the work this function already did.
 */
export function promptSizeComplaint(r: PromptSizeReport): string | null {
  if (!r.overCeiling) return null;
  const worst = r.biggest
    .map((c) => `${c.name} (${c.chars.toLocaleString("da-DK")} tegn)`)
    .join(", ");
  return (
    `Chattens systeminstruktion fylder ${r.chars.toLocaleString("da-DK")} tegn ` +
    `(~${r.approxTokens.toLocaleString("da-DK")} tokens) og sendes ved HVER besked. ` +
    `Loftet er ${r.ceilingChars.toLocaleString("da-DK")}. ` +
    `Tungest: ${worst}. ` +
    `Instruktionen vokser med sitets skema — ikke med samtalen.`
  );
}
