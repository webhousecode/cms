/**
 * Pure SSE-accumulator for the quick-action pre-warm (F158). Dependency-free so
 * it can be unit-tested without the `@/` alias chain (vitest doesn't resolve it;
 * same reason model-defaults.ts is extracted). Consumed by quick-prewarm.ts.
 */

/**
 * Concatenate the `text` deltas out of a chat SSE stream into the final
 * markdown. Ignores thinking/tool_call/tool_result/form/artifact/done/error
 * frames — only the assistant's prose is cached.
 */
export function parseChatSseText(raw: string): string {
  let out = "";
  for (const block of raw.split("\n\n")) {
    let event = "";
    let data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data = line.slice(5).trim();
    }
    if (event === "text" && data) {
      try {
        const parsed = JSON.parse(data) as { text?: unknown };
        if (typeof parsed.text === "string") out += parsed.text;
      } catch {
        /* skip malformed frame */
      }
    }
  }
  return out;
}
