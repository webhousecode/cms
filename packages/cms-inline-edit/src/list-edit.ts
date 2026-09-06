/**
 * F157.16 — a list must be able to GROW from the page.
 *
 * Christian wanted one more chip on /flagskibe/trail. Every chip was already
 * individually editable, and there was no way to add one: inline editing can
 * change an element that exists, never create one. In the admin editor the same
 * list is raw JSON.
 *
 * THE PACKAGE MUST NOT GUESS WHICH LISTS ARE SAFE. Measured on the live page,
 * three shapes reach the same code:
 *
 *   slides.0.blocks.2.items.3     a chip          — safe to add
 *   slides.1.blocks.0.items.0.1   a step [t,d]    — a bare string would corrupt it
 *   slides.1.blocks.1.cols.0      a table COLUMN  — a string list, and adding one
 *                                                   leaves every row a cell short
 *
 * The third is why a structural rule ("last segment is a number, the one before
 * is not") is not enough: `cols` passes it and is still unsafe. Whether a list
 * can take a new member is a fact about the SITE's markup, not about the path.
 * So the site opts in per list with `data-cms-list-add`, and a list that says
 * nothing gets no buttons. Safe by construction rather than by a blacklist we
 * would have to keep in step with someone else's component.
 */

/** `slides.0.blocks.2.items.3` -> `{ arrayPath: "slides.0.blocks.2.items", index: 3 }` */
export function parseListItemPath(field: string): { arrayPath: string; index: number } | null {
  const at = field.lastIndexOf(".");
  if (at <= 0) return null;
  const last = field.slice(at + 1);
  if (!/^\d+$/.test(last)) return null;
  return { arrayPath: field.slice(0, at), index: Number(last) };
}

/**
 * The list an element belongs to.
 *
 * collection + slug + the FULL path — never the path alone. Two documents on one
 * page can carry the same tail (a footer and an article both have `tags`), and
 * keying on the tail would let one list's buttons write into the other's data.
 */
export function listKey(collection: string, slug: string, arrayPath: string): string {
  return `${collection} ${slug} ${arrayPath}`;
}

function arrayAt(data: Record<string, unknown>, path: string): unknown[] | null {
  const parts = path.split(".");
  let obj: unknown = data;
  for (const p of parts) {
    if (obj == null || typeof obj !== "object") return null;
    const key: string | number = /^\d+$/.test(p) ? Number(p) : p;
    obj = (obj as Record<string | number, unknown>)[key];
  }
  return Array.isArray(obj) ? obj : null;
}

/** Every member is a string — the only shape we know how to extend or shrink. */
function isStringList(a: unknown[]): boolean {
  return a.every((v) => typeof v === "string");
}

/**
 * Append an empty member. Returns the new index, or null if the target is not a
 * list of strings — a refusal rather than a write, because the alternative is
 * putting "" where a [title, description] pair belongs and only finding out when
 * the page renders half a row.
 */
export function addListItem(data: Record<string, unknown>, arrayPath: string): number | null {
  const arr = arrayAt(data, arrayPath);
  if (!arr || !isStringList(arr)) return null;
  arr.push("");
  return arr.length - 1;
}

/** Remove one member. Same refusal, plus an out-of-range guard. */
export function removeListItem(
  data: Record<string, unknown>,
  arrayPath: string,
  index: number,
): boolean {
  const arr = arrayAt(data, arrayPath);
  if (!arr || !isStringList(arr)) return false;
  if (!Number.isInteger(index) || index < 0 || index >= arr.length) return false;
  arr.splice(index, 1);
  return true;
}

/**
 * After a removal the DOM still carries the OLD indices, so element 3 would write
 * to what is now element 2's slot — the next edit silently overwrites its
 * neighbour. Renumber the survivors instead of re-rendering the page.
 */
export function renumberAfterRemoval(
  fields: string[],
  arrayPath: string,
  removed: number,
): string[] {
  return fields.map((f) => {
    const p = parseListItemPath(f);
    if (!p || p.arrayPath !== arrayPath || p.index <= removed) return f;
    return `${arrayPath}.${p.index - 1}`;
  });
}
