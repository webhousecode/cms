/**
 * F162.3 — token-safe serialization.
 *
 * Some CMS fields store auto-resolve TOKENS that expand at render time, e.g.
 * `"{år} års erfaring"` → `"26 års erfaring"` ({år} = years-since-2000). Plain
 * inline-edit saves the rendered `textContent`, which overwrites the token with
 * its expanded value ("26") and freezes the number forever.
 *
 * Fix without fragile re-alignment: the site renders each token as an ATOMIC
 * inline chip inside the editable field —
 *   `{år}` → `<span data-cms-token="{år}">26</span>`
 * — where the chip's TEXT is the rendered value and its `data-cms-token`
 * attribute holds the original token. While editing, the chip is made
 * contenteditable=false (an unbreakable unit: the user edits the words AROUND
 * it, never inside it). On save we serialise by walking child nodes: text nodes
 * contribute their text verbatim, a chip contributes its TOKEN. The stored
 * template's tokens therefore survive the edit — no diffing, no guessing.
 */

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

/** True when the element contains at least one token chip → its save path must
 *  use serializeTokenSafe instead of textContent. */
export function hasTokenChips(el: Element): boolean {
  return el.querySelector('[data-cms-token]') !== null;
}

/**
 * Re-tokenise an edited token-safe element back to its stored template form:
 * text nodes verbatim; each `[data-cms-token]` chip → its token value (NOT the
 * rendered value). Recurses so a chip wrapped in other markup still resolves.
 * A deleted chip simply drops its token — an intentional edit, not a bug.
 */
export function serializeTokenSafe(el: Node): string {
  let out = '';
  el.childNodes.forEach((node) => {
    if (node.nodeType === TEXT_NODE) {
      out += node.textContent ?? '';
      return;
    }
    if (node.nodeType !== ELEMENT_NODE) return;
    const element = node as Element;
    const token = element.getAttribute('data-cms-token');
    if (token) {
      out += token; // atomic chip → its token, NEVER the rendered value
    } else {
      out += serializeTokenSafe(element); // wrapper markup → recurse into it
    }
  });
  return out;
}

/** Lock every token chip so it edits as one unit (called on edit-enter). */
export function lockTokenChips(el: Element): void {
  el.querySelectorAll('[data-cms-token]').forEach((chip) => {
    chip.setAttribute('contenteditable', 'false');
  });
}
