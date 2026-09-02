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
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return false; // https: mailto: tel: data:
  if (v.startsWith("//")) return false; // protocol-relative
  if (v.startsWith("/")) return false; // site-absolute
  if (v.startsWith("#")) return false; // anchor on this page
  if (v.startsWith("?")) return false; // query on this page
  return true;
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
  for (const m of text.matchAll(/<a\b[^>]*?\bhref\s*=\s*("([^"]*)"|'([^']*)')/gi)) {
    out.push({ syntax: "html", value: m[2] ?? m[3] ?? "" });
  }
  for (const m of text.matchAll(/(!)?\[[^\]]*\]\(([^)\s]+)/g)) {
    if (m[1]) continue;
    out.push({ syntax: "markdown", value: m[2] ?? "" });
  }
  return out;
}
