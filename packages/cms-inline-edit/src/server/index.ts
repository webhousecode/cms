/**
 * Optional server-side helpers (Node/Bun) for sites that want a same-origin
 * relay instead of calling the CMS directly from the browser. Not required
 * for the direct-from-browser flow used by initInlineEdit().
 */

export interface SaveInlineEditFieldOptions {
  cmsBaseUrl: string;
  siteId: string;
  collection: string;
  slug: string;
  field: string;
  value: string;
  sessionToken: string;
}

export type SaveInlineEditFieldResult = { ok: true } | { ok: false; error: string };

/** GET the doc, merge the changed field into .data, PATCH the full merged object back. */
export async function saveInlineEditField(
  options: SaveInlineEditFieldOptions,
): Promise<SaveInlineEditFieldResult> {
  const { cmsBaseUrl, siteId, collection, slug, field, value, sessionToken } = options;
  const headers = { Authorization: `Bearer ${sessionToken}` };

  const getRes = await fetch(`${cmsBaseUrl}/api/cms/${collection}/${slug}?site=${siteId}`, {
    headers,
  });
  if (!getRes.ok) return { ok: false, error: `GET failed: ${getRes.status}` };
  const doc = (await getRes.json()) as { data?: Record<string, unknown> };
  const mergedData = { ...doc.data, [field]: value };

  const patchRes = await fetch(`${cmsBaseUrl}/api/cms/${collection}/${slug}?site=${siteId}`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ data: mergedData }),
  });
  if (!patchRes.ok) return { ok: false, error: `PATCH failed: ${patchRes.status}` };
  return { ok: true };
}

export interface VerifyEditSessionOptions {
  cmsBaseUrl: string;
  token: string;
}

export interface EditSessionUser {
  sub: string;
  email: string;
  name: string;
  role: string;
}

/**
 * Calls the CMS's existing GET /api/auth/me with the token as a Bearer header.
 * That endpoint always returns 200 — {"user": null} for anonymous/invalid
 * tokens, never a 401 — so absence of a user is read from the body, not the
 * status code.
 */
export async function verifyEditSession(
  options: VerifyEditSessionOptions,
): Promise<EditSessionUser | null> {
  const res = await fetch(`${options.cmsBaseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${options.token}` },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { user?: EditSessionUser | null };
  return body.user ?? null;
}

/* ------------------------------------------------------------------ F164 --
 * Live page references.
 *
 * A link the editor made to a PAGE is stored as inline HTML carrying
 * `data-cms-ref="collection:slug"` next to a real, working href — and
 * optionally `data-cms-ref-label="auto"`, meaning "show the page's current
 * title". Call resolveCmsLinks() when you render a richtext field and the link
 * re-points itself after the page moves or is renamed, without anything having
 * to rewrite stored content.
 *
 * Deliberately degrades: a site that never calls this still ships links that
 * work — they just stop following the page. And an unknown reference (deleted
 * page) keeps whatever href it had rather than emitting a dead or empty link.
 * -------------------------------------------------------------------------- */

export interface CmsLinkTarget {
  /** Current public path or URL of the referenced page. */
  url: string;
  /** Current title, used when the link opted into the auto label. */
  title?: string;
}

/** Resolve `collection:slug` → its current url + title, or null if it is gone. */
export type CmsLinkLookup = (
  collection: string,
  slug: string,
) => CmsLinkTarget | null | undefined;

const ANCHOR_RE = /<a\b([^>]*\bdata-cms-ref="[^"]*"[^>]*)>([\s\S]*?)<\/a>/gi;
/**
 * Every anchor, not only the ones carrying a page reference.
 *
 * Quote-aware on purpose. A naive `[^>]*` ends the tag at the first `>` — but a
 * BROWSER does not: inside a quoted attribute value `>` is ordinary text. So
 * `<a href="data:text/html,<script>…">` was read by the regex as a tag ending
 * mid-attribute, escaped the check, and still executed. A sanitiser that
 * tokenises differently from the parser it protects is a bypass, not a guard.
 * Caught by this file's own negative-case test.
 */
const ANY_ANCHOR_RE = /<a\b((?:"[^"]*"|'[^']*'|[^>])*)>([\s\S]*?)<\/a>/gi;
/** href, quoted or bare — an unquoted attribute is legal HTML5. */
const HREF_RE = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;
const attr = (tag: string, name: string): string => {
  const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`, "i"));
  return m?.[1] ?? "";
};
const escapeAttr = (v: string): string =>
  v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const escapeText = (v: string): string =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Neutralise a link whose address would EXECUTE when clicked.
 *
 * The editor refuses these at three points on the way IN, but that only covers
 * text this dialog wrote. Content also arrives from cms-admin's own richtext
 * editor, the REST API, MCP and AI agents, and `marked` renders
 * `[k](javascript:…)` and a raw `<a href="javascript:…">` through untouched —
 * measured with this repo's own version. So the render side needs its own gate.
 *
 * The link's WORDS survive; only the link is removed. Dropping the text as well
 * would silently delete a sentence from a customer's page.
 *
 * Honest limit: this runs only where a site calls it. It is a chokepoint for a
 * consumer that renders through resolveCmsLinks (or sanitizeCmsHtml directly),
 * not a guarantee about every path into every site.
 */
export function sanitizeCmsHtml(html: string): string {
  if (!html) return html;
  return html.replace(ANY_ANCHOR_RE, (whole, attrs: string, inner: string) => {
    const m = attrs.match(HREF_RE);
    const href = m?.[1] ?? m?.[2] ?? m?.[3] ?? "";
    // Whitespace and control characters are stripped first: browsers ignore
    // them inside a scheme, so `java\tscript:` and ` javascript:` both run.
    const bare = href.replace(/[\u0000-\u0020]/g, "");
    return /^(?:javascript|data|vbscript):/i.test(bare) ? inner : whole;
  });
}

export function resolveCmsLinks(html: string, lookup: CmsLinkLookup): string {
  if (!html) return html;
  return sanitizeCmsHtml(html).replace(ANCHOR_RE, (whole, attrs: string, inner: string) => {
    const ref = attr(attrs, "data-cms-ref");
    const sep = ref.indexOf(":");
    if (sep < 1) return whole;
    let target: CmsLinkTarget | null | undefined;
    try {
      target = lookup(ref.slice(0, sep), ref.slice(sep + 1));
    } catch {
      return whole; // a throwing lookup must never take the page down with it
    }
    if (!target?.url) return whole; // page gone → keep the last known href

    const auto = attr(attrs, "data-cms-ref-label") === "auto";
    const label = auto && target.title ? escapeText(target.title) : inner;
    const rebuilt = attrs.replace(/\bhref="[^"]*"/i, `href="${escapeAttr(target.url)}"`);
    const withHref = /\bhref=/i.test(attrs) ? rebuilt : `${attrs} href="${escapeAttr(target.url)}"`;
    return `<a${withHref}>${label}</a>`;
  });
}
