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
      return frame.action === "warned"
        ? []
        : [{ event: "text", data: { text: `\n\n_${frame.note}_\n\n` } }];

    case "limit":
      // Reaching a ceiling is an ANSWER. Sent as text so the user reads a
      // sentence rather than watching the stream stop for no stated reason.
      return [{ event: "text", data: { text: `\n\n${frame.note}` } }];

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
