/**
 * What kind of address did the editor actually type?
 *
 * The reason this is a module and not three lines inside the dialog: the
 * content scanner (`scripts/scan-schemeless-links.mjs`) has to agree with the
 * editor about what counts as a doubtful address. Two copies of the rule drift,
 * and then the scanner reports a clean site the editor is still producing dead
 * links on.
 */

/**
 * True when the browser will read this address as a path on the CURRENT page.
 *
 * `<a href="www.trailmem.com">` is valid HTML: it renders, it is styled, it
 * lights up on hover. The browser just resolves it relative to the page it sits
 * on, so it lands on /some/article/www.trailmem.com. Nothing about the markup
 * looks wrong — only following the link reveals it.
 *
 * This DELIBERATELY does not try to decide whether the author meant an external
 * host. `trailmem.com` and `index.html` are syntactically identical, and a rule
 * that "fixes" the first breaks the second. It reports doubt; it never rewrites.
 */
export function isSchemeless(raw: string): boolean {
  const v = (raw || "").trim();
  if (!v) return false;
  // An email address typed bare is not an address the browser will read as a
  // path — and offering "add https://" on it produces https://cb@webhouse.dk,
  // which parses as host webhouse.dk with userinfo cb: a dead link that now
  // LOOKS unambiguous, so the notice disappears and nothing warns again.
  if (isBareEmail(v)) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return false; // https: mailto: tel: data:
  if (v.startsWith("//")) return false; // protocol-relative
  if (v.startsWith("/")) return false; // site-absolute
  if (v.startsWith("#")) return false; // anchor on this page
  if (v.startsWith("?")) return false; // query on this page
  return true;
}

/**
 * A bare email address — `name@host.tld`, no scheme, no path.
 *
 * Kept deliberately narrow: anything with a slash, a space or a second @ is
 * not one, so an ordinary URL that happens to contain an @ (userinfo, a query)
 * is untouched.
 */
export function isBareEmail(raw: string): boolean {
  return /^[^\s@/:?#]+@[^\s@/:?#]+\.[a-z]{2,}$/i.test((raw || "").trim());
}

/** The one-click repair the dialog offers. Never applied on its own. */
export function withHttps(raw: string): string {
  return `https://${(raw || "").trim().replace(/^\/+/, "")}`;
}

/**
 * Does this address leave the site the editor is standing on?
 *
 * Used ONLY to decide how the "open in a new tab" box starts out — and that
 * starting state is visible in the box itself, so a wrong guess is something
 * the editor can see and change, not a silent rewrite.
 */
export function isExternalHost(raw: string, currentHost: string): boolean {
  const v = (raw || "").trim();
  if (!/^https?:\/\//i.test(v)) return false;
  try {
    return new URL(v).host.toLowerCase() !== (currentHost || "").toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Every link address inside a stored string — HTML anchors and Markdown links.
 *
 * Markdown IMAGE syntax is excluded on purpose: a relative image path
 * (`![foto](uploads/x.jpg)`) is normal and correct, and flagging it would bury
 * the real findings in noise.
 */
export function extractLinkTargets(text: string): Array<{ syntax: "html" | "markdown"; value: string }> {
  const out: Array<{ syntax: "html" | "markdown"; value: string }> = [];
  if (typeof text !== "string") return out;
  // The unquoted form is legal HTML5 and common in pasted or imported markup —
  // which is exactly the content this scanner exists to audit. Requiring quotes
  // made `<a href=trailmem.com>` invisible, so a site scanned clean while the
  // dead link was live.
  for (const m of text.matchAll(/<a\b[^>]*?\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/gi)) {
    out.push({ syntax: "html", value: m[2] ?? m[3] ?? m[4] ?? "" });
  }
  // `[` ... `]` is allowed to contain a nested image, so a linked image
  // (`[![alt](a.png)](https://x)`) reports the LINK's address, not the image's.
  // A bare `![alt](src)` is still skipped: a relative image path is normal.
  for (const m of text.matchAll(/(!)?\[(?:[^\]\[]|\[[^\]]*\])*\]\(([^)\s]+)/g)) {
    if (m[1]) continue;
    out.push({ syntax: "markdown", value: m[2] ?? "" });
  }
  return out;
}

/**
 * Schemes that must never reach an `href`.
 *
 * `javascript:` in a link is script execution on click, in the SITE's own
 * origin — which is where the editor's own edit-session token lives in
 * localStorage. So one editor planting such a link, and any colleague clicking
 * it, is a token handover. `data:` and `vbscript:` are the same class.
 *
 * The package ALREADY refuses these on every other attribute
 * (preservedLinkAttrs drops `javascript:` values and every `on*` handler) —
 * href was the one that escaped, because it is emitted separately from the
 * attributes it sits beside.
 *
 * Whitespace and control characters are stripped first: browsers ignore them
 * inside a scheme, so `java\tscript:` and ` javascript:` both run.
 */
export function isDangerousUrl(raw: string): boolean {
  const v = (raw || "").replace(/[\u0000-\u0020]/g, "");
  return /^(?:javascript|data|vbscript):/i.test(v);
}
