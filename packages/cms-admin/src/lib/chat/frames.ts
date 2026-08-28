/**
 * One frame from @broberg/chat → the SSE events our client already speaks.
 *
 * Extracted from the route so it can be PROVEN. Inside the route it could only
 * be tested by running a whole conversation against a real model; as a pure
 * function every frame the package can emit gets an assertion, including the
 * two the client has no vocabulary for.
 *
 * THE RULE THIS ENCODES: a frame is never dropped silently. `history` and
 * `limit` are not errors and not text the model wrote — they are the system
 * telling the user something about their own conversation, and a user must
 * never be answered from half a transcript, or told nothing at all because a
 * ceiling was reached. Both are turned into something a human reads.
 */
import type { ChatFrame } from "@broberg/chat";

export interface SseEvent {
  event: string;
  data: unknown;
}

/** OUR protocol, not the engine's: two tools answer with a marker. */
const INLINE_FORM = "__INLINE_FORM__";
const ARTIFACT = "__ARTIFACT__";

export function frameToEvents(frame: ChatFrame): SseEvent[] {
  switch (frame.type) {
    case "text":
      // An empty delta is not an event. Sending it makes the client render a
      // blank turn, which reads as the assistant answering with nothing.
      return frame.text ? [{ event: "text", data: { text: frame.text } }] : [];

    case "tool-call":
      return [{ event: "tool_call", data: { tool: frame.name, input: frame.args } }];

    case "tool-result": {
      const out: SseEvent[] = [];
      let result = typeof frame.result === "string" ? frame.result : JSON.stringify(frame.result);
      if (result.startsWith(INLINE_FORM)) {
        out.push({ event: "form", data: safeJson(result.slice(INLINE_FORM.length)) });
        result = "Showing edit form for the user.";
      } else if (result.startsWith(ARTIFACT)) {
        out.push({ event: "artifact", data: safeJson(result.slice(ARTIFACT.length)) });
        result = "Interactive generated and displayed.";
      }
      out.push({ event: "tool_result", data: { tool: frame.name, result: result.slice(0, 3000) } });
      return out;
    }

    case "history":
      // "warned" is for our logs — there is still room, and telling the user
      // their conversation is 80% full mid-answer is noise. "reduced" and
      // "failed" changed what the model saw, so the user is told.
      //
      // IN DANISH, AND NOT THE PACKAGE'S NOTE. `frame.note` is English —
      // measured live in the production container, the user would have been
      // shown "This turn is too large on its own and cannot be shortened by
      // removing older ones." in the middle of a Danish conversation. The note
      // is written for a developer reading a log, not for the person whose
      // conversation just got shorter. It still goes to the log; the sentence
      // the user reads is ours.
      return frame.action === "warned" ? [] : [{ event: "text", data: { text: historyNote(frame) } }];

    case "limit":
      // Reaching a ceiling is an ANSWER. Sent as text so the user reads a
      // sentence rather than watching the stream stop for no stated reason.
      // Danish for the same reason as above.
      return [{ event: "text", data: { text: "\n\nJeg måtte stoppe her: samtalen har nået sin grænse for denne omgang. Start en ny samtale, så kan vi fortsætte." } }];

    case "error":
      return [{ event: "error", data: { message: frame.message, scope: frame.scope } }];

    case "done":
      return [{ event: "done", data: {} }];
  }
}

/**
 * A malformed marker payload must not take the whole stream down.
 *
 * The old route did a bare `JSON.parse` inside the loop: one tool returning a
 * truncated payload threw, the catch fired, and the user got "Chat error" with
 * the real answer already half-written above it.
 */
function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return { error: "malformed payload" };
  }
}


/**
 * What the USER reads when their conversation was shortened.
 *
 * FOUR SENTENCES FROM THE CODES, NEVER FROM `note`. 0.6.0 forwards `reason` and
 * `strategy` on these frames precisely so a consumer can say the right thing —
 * before that, all three failure states arrived as one `action` and the note was
 * the only distinguishing text, in English. We reported it; they shipped the
 * codes and deliberately shipped NO user text, because they do not know our
 * language, tone or audience. The codes are theirs; the words are ours.
 *
 * Each sentence says what it means for HER and what she can do — never what the
 * mechanism did. "cannot_reduce" and "compaction_failed" are different advice:
 * shorten THIS message vs. try again. Merging them would send her to fix the
 * wrong thing.
 */
function historyNote(frame: {
  action: string;
  dropped?: number;
  reason?: string;
  strategy?: string;
}): string {
  if (frame.action === "reduced") {
    const n = frame.dropped;
    // `strategy` distinguishes "I summarised it" from "I dropped it" — and they
    // are not the same promise to make. Measured live: with `window` the model
    // forgot the whole conversation and said so politely, with zero errors.
    return frame.strategy === "window"
      ? `\n\n_Samtalen er blevet lang, så de ældste beskeder${n ? ` (${n})` : ""} er ikke længere med. Det nyeste er uændret._\n\n`
      : `\n\n_Samtalen er blevet lang, så jeg har sammenfattet det ældste${n ? ` (${n} beskeder)` : ""}. Det nyeste er uændret._\n\n`;
  }
  switch (frame.reason) {
    case "cannot_reduce":
      return `\n\n_Din seneste besked er for lang til at jeg kan behandle den. Prøv at dele den op i mindre dele._\n\n`;
    case "compaction_failed":
      return `\n\n_Jeg kunne ikke sammenfatte den tidligere del af samtalen. Prøv igen, eller start en ny samtale hvis det bliver ved._\n\n`;
    case "overhead_exceeds_limit":
      // Not the user's doing at all — nothing she writes can fix it, so she is
      // not asked to try. This is ours to notice in the log.
      return `\n\n_Der er ikke plads til denne samtale i den nuværende opsætning. Det er ikke noget du kan gøre ved — vi kigger på det._\n\n`;
    default:
      return `\n\n_Samtalen kunne ikke forkortes. Prøv at starte en ny samtale._\n\n`;
  }
}
