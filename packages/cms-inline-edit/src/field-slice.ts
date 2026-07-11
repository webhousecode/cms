/**
 * Replace ONE slice of a larger text field.
 *
 * Used when an element renders a single SEGMENT of a bigger field — e.g. one
 * prose paragraph of a `content` body that is interleaved with `[block:]`
 * embeds — so editing that segment must write back into the full field without
 * clobbering the other segments or the embeds.
 *
 * Safety-first: throws if `original` is not found EXACTLY once, so an ambiguous
 * or stale slice ABORTS the save (surfaced as the error pill) instead of
 * corrupting the whole field. Pure + framework-agnostic; unit-tested.
 */
export function applyFieldSlice(current: string, original: string, next: string): string {
  const first = current.indexOf(original);
  if (first === -1) throw new Error("field-slice: original not found");
  if (current.indexOf(original, first + original.length) !== -1) {
    throw new Error("field-slice: original found more than once (ambiguous)");
  }
  return current.slice(0, first) + next + current.slice(first + original.length);
}
