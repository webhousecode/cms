/**
 * F150 — Paste formatting sanitization.
 *
 * Strips Microsoft Word / Office clipboard cruft from pasted HTML *before*
 * ProseMirror parses it, so the junk never reaches the editor schema and never
 * round-trips into stored Markdown (the editor serialises with `html: true`,
 * which otherwise re-emits leftover inline wrappers as literal `<span>` text on
 * public sites — the sanneandersen "fordjelsen" bug).
 *
 * Pure string transform on purpose: no DOM dependency, so it runs unchanged in
 * the browser paste path AND is unit-testable under the repo's `node` vitest env.
 *
 * What it removes:
 *  - Office conditional comments + all HTML comments (StartFragment/EndFragment)
 *  - `<style>` / `<xml>` blocks Word injects
 *  - XML-namespace tags: `<o:p>`, `<w:…>`, `<m:…>`, `<v:…>`, `<st1:…>`, …
 *  - `<font>` tags (unwrapped — content kept)
 *  - `mso-*` declarations inside `style=""` (and the attribute if it empties)
 *  - `class="Mso…"` attributes
 *  - noise-only `<span>` wrappers (unwrapped — content kept)
 *
 * What it preserves:
 *  - all real content + intentional inline markup (`<u>`, `<strong>`, `<a>`, …)
 *  - spans that carry a deliberate `color`/`background-color` (TextStyle/Color),
 *    or a real `class`/`id`/`data-*` attribute
 */

/** Remove `mso-*` declarations from a CSS string; return the cleaned remainder. */
function stripMsoFromCss(css: string): string {
  return css
    .split(";")
    .map((d) => d.trim())
    .filter((d) => d.length > 0)
    .filter((d) => !/^mso-/i.test(d.split(":")[0].trim()))
    .join("; ");
}

/** True if a span's attribute string carries something worth keeping the span for. */
function spanIsSemantic(attrs: string): boolean {
  // a deliberate colour (covers `color:` and `background-color:`)
  if (/\bcolor\s*:/i.test(attrs)) return true;
  // a real structural attribute another feature may rely on
  if (/\s(?:class|id|data-[\w-]+)\s*=/i.test(attrs)) return true;
  return false;
}

/** Unwrap noise-only `<span>` wrappers from innermost out, keeping semantic ones. */
function unwrapNoiseSpans(html: string): string {
  // Match an innermost span (its content holds no further `<span` opening).
  const innermost = /<span((?:\s[^>]*)?)>((?:(?!<span)[\s\S])*?)<\/span>/i;
  let out = html;
  let prev = "";
  let guard = 0;
  while (out !== prev && guard < 100) {
    prev = out;
    out = out.replace(innermost, (_m, attrs: string, inner: string) =>
      spanIsSemantic(attrs)
        ? // park kept spans under a placeholder so the loop can't re-match them
          `<keptspan${attrs}>${inner}</keptspan>`
        : inner,
    );
    guard++;
  }
  // restore parked spans
  return out.replace(/<keptspan/gi, "<span").replace(/<\/keptspan>/gi, "</span>");
}

/**
 * Sanitise pasted HTML, removing Word/Office cruft while preserving real
 * content and intentional formatting. Safe to call on any pasted HTML.
 */
export function sanitizeWordPasteHtml(html: string): string {
  if (!html) return html;
  // Quick exit: nothing that looks like Office cruft → return untouched.
  if (!/<(?:o|w|m|v|st1|x):|<font\b|mso-|class=["']?Mso|<span\b|<!--|<!\[|<style\b|<xml\b/i.test(html)) {
    return html;
  }

  let out = html;

  // 1. Drop `<style>` and `<xml>` blocks Word injects wholesale.
  out = out.replace(/<style\b[\s\S]*?<\/style>/gi, "");
  out = out.replace(/<xml\b[\s\S]*?<\/xml>/gi, "");

  // 2. Drop all HTML comments (incl. Office conditional `<!--[if …]>…<![endif]-->`
  //    and StartFragment/EndFragment markers) + downlevel-revealed `<![if]>` forms.
  out = out.replace(/<!--[\s\S]*?-->/g, "");
  out = out.replace(/<!\[(?:end)?if[^\]]*\]>/gi, "");

  // 3. Drop XML-namespace tags (`<o:p>`, `<w:…>`, …) — open + close, keep content.
  out = out.replace(/<\/?[a-z]+:[^>]*>/gi, "");

  // 4. Unwrap `<font …>` tags — keep their content.
  out = out.replace(/<\/?font\b[^>]*>/gi, "");

  // 5. Drop Office-generated `class="Mso…"` attributes.
  out = out.replace(/\sclass=("|')Mso[^"']*\1/gi, "");

  // 6. Strip `mso-*` declarations from style attributes; drop the attr if empty.
  out = out.replace(/\sstyle=("|')([\s\S]*?)\1/gi, (_m, _q, css: string) => {
    const cleaned = stripMsoFromCss(css);
    return cleaned ? ` style="${cleaned}"` : "";
  });

  // 7. Unwrap noise-only spans (after step 6 mso-only spans are attribute-less).
  out = unwrapNoiseSpans(out);

  return out;
}
