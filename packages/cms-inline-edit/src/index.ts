/**
 * Browser entry — zero dependencies. Site-wide: activated once per browser
 * via a "connect" link (see docs/features/F157-inline-editing.md), then
 * every page load on the site automatically offers click-to-edit on any
 * element carrying data-cms-collection/data-cms-slug/data-cms-field
 * (F129's attribute convention) — no per-document step.
 */

export interface InlineEditOptions {
  /** Base URL of the CMS API, e.g. "https://webhouse.app". */
  cmsBaseUrl: string;
  /** Site id passed as ?site= on every CMS API call, e.g. "broberg-ai". */
  siteId: string;
  /** URL query param carrying a freshly-minted token from the connect redirect. Default "cms_edit". */
  tokenParam?: string;
  /** localStorage key the token is persisted under — survives across sessions/tabs. Default "wh-inline-edit-token". */
  storageKey?: string;
  /** Label for the "not connected yet" prompt. Default "🔒 Log ind for at redigere". */
  connectLabel?: string;
}

interface ResolvedOptions extends Required<InlineEditOptions> {}

function resolveOptions(options: InlineEditOptions): ResolvedOptions {
  return {
    tokenParam: "cms_edit",
    storageKey: "wh-inline-edit-token",
    connectLabel: "🔒 Log ind for at redigere",
    ...options,
  };
}

export async function initInlineEdit(options: InlineEditOptions): Promise<void> {
  if (typeof window === "undefined") return;
  const resolved = resolveOptions(options);

  captureTokenFromUrl(resolved);

  const enabled = await checkEnabled(resolved);
  if (!enabled) return;

  const token = getConnectedToken(options);
  if (token) {
    activateEditMode(token, resolved);
  } else {
    showConnectPrompt(resolved);
  }
}

/**
 * A valid (non-expired) token already connected in this browser for this
 * site, or null. Also captures a fresh `?cms_edit=` token from the URL
 * first, so a page can call this directly right after the connect redirect
 * without going through initInlineEdit(). Exposed so a site's own /admin
 * page (or any other tool built on the same connected session) can reuse
 * the same storage/expiry logic instead of re-implementing it.
 */
export function getConnectedToken(options: InlineEditOptions): string | null {
  if (typeof window === "undefined") return null;
  const resolved = resolveOptions(options);
  captureTokenFromUrl(resolved);
  const token = localStorage.getItem(resolved.storageKey);
  if (!token) return null;
  if (isExpired(token)) {
    localStorage.removeItem(resolved.storageKey);
    return null;
  }
  return token;
}

/** The URL that mints a fresh 30-day site-scoped token and redirects back to `returnUrl`. */
export function buildConnectUrl(options: InlineEditOptions, returnUrl: string): string {
  const resolved = resolveOptions(options);
  return (
    `${resolved.cmsBaseUrl}/admin/inline-edit/connect?site=${encodeURIComponent(resolved.siteId)}` +
    `&return=${encodeURIComponent(returnUrl)}`
  );
}

/** Clears the connected token in this browser (e.g. a "log out" action in a site's own /admin panel). */
export function disconnect(options: InlineEditOptions): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(resolveOptions(options).storageKey);
}

/** Captures a token minted by /admin/inline-edit/connect, then strips it from the URL. */
function captureTokenFromUrl(options: ResolvedOptions): void {
  const url = new URL(window.location.href);
  const urlToken = url.searchParams.get(options.tokenParam);
  if (!urlToken) return;
  localStorage.setItem(options.storageKey, urlToken);
  url.searchParams.delete(options.tokenParam);
  window.history.replaceState({}, "", url.toString());
}

async function checkEnabled(options: ResolvedOptions): Promise<boolean> {
  try {
    const res = await fetch(`${options.cmsBaseUrl}/api/inline-edit/status?site=${options.siteId}`);
    if (!res.ok) return false;
    const body = (await res.json()) as { enabled?: boolean };
    return body.enabled === true;
  } catch {
    return false;
  }
}

function isExpired(token: string): boolean {
  const claims = decodeJwtPayload(token);
  const exp = typeof claims?.exp === "number" ? claims.exp : 0;
  return exp <= Date.now() / 1000;
}

function showConnectPrompt(options: ResolvedOptions): void {
  const connectUrl = buildConnectUrl(options, window.location.href);

  const link = document.createElement("a");
  link.href = connectUrl;
  link.textContent = options.connectLabel;
  link.setAttribute("data-cms-inline-edit-connect", "");
  link.style.cssText =
    "position:fixed;bottom:16px;left:16px;background:#1c2027;color:#fff;" +
    "font:600 12px system-ui,sans-serif;padding:8px 14px;border-radius:999px;" +
    "text-decoration:none;z-index:2147483647;box-shadow:0 4px 16px rgba(0,0,0,.3);";
  document.body.appendChild(link);
}

function activateEditMode(token: string, options: ResolvedOptions): void {
  injectStyles();
  showActiveBadge(token, options);

  const fields = document.querySelectorAll<HTMLElement>("[data-cms-field]");
  fields.forEach((el) => wireField(el, token, options));
}

function wireField(el: HTMLElement, token: string, options: ResolvedOptions): void {
  // Rich fields get the floating formatting toolbar. Two save modes:
  //  - data-cms-richtext="true" → save as Markdown (article bodies; cms
  //    `richtext` contract renders Markdown via marked).
  //  - data-cms-html="true"     → save innerHTML VERBATIM (intentional-HTML
  //    fields: headings/bios/hero with a branded <em class="o"> accent that
  //    has no Markdown equivalent — converting would strip it).
  // Everything else stays a plain single-line contenteditable saving textContent.
  if (el.dataset.cmsRichtext === "true") {
    wireRichField(el, token, options, "markdown");
    return;
  }
  if (el.dataset.cmsHtml === "true") {
    wireRichField(el, token, options, "html");
    return;
  }

  el.addEventListener("click", (e) => {
    if (el.getAttribute("contenteditable") === "true") return;
    // Many editable fields (card titles/blurbs) sit inside a clickable <a>/
    // <button> ancestor (the card itself) — without this, "click to edit"
    // would immediately navigate away instead of focusing the field.
    e.preventDefault();
    e.stopPropagation();
    el.dataset.cmsOriginalValue = el.textContent ?? "";
    el.setAttribute("contenteditable", "true");
    el.focus();
  });

  el.addEventListener("blur", () => {
    el.removeAttribute("contenteditable");
    const original = el.dataset.cmsOriginalValue ?? "";
    const current = el.textContent ?? "";
    if (current.trim() === original.trim()) return;
    void saveField(el, current.trim(), token, options);
  });

  el.addEventListener("paste", (e) => {
    e.preventDefault();
    const text = e.clipboardData?.getData("text/plain") ?? "";
    document.execCommand("insertText", false, text);
  });

  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      el.blur();
    }
  });
}

/* ─── Rich-text mode (article bodies) ──────────────────────────────────────
 * A single editable region + a floating B/I/U · color · emoji · Done toolbar
 * (the Pitch Vault pattern, minus the iframe/postMessage — we run in the live
 * page's own document). On "Done" the region's innerHTML is converted back to
 * Markdown (the cms `richtext` contract: fields store Markdown, not HTML) and
 * saved. Only ONE region is active at a time. */

type RichMode = "markdown" | "html";
interface RichContext {
  el: HTMLElement;
  token: string;
  options: ResolvedOptions;
  originalHtml: string;
  mode: RichMode;
}
let richCtx: RichContext | null = null;
let richToolbar: HTMLElement | null = null;

function wireRichField(el: HTMLElement, token: string, options: ResolvedOptions, mode: RichMode): void {
  el.addEventListener("click", (e) => {
    if (richCtx && richCtx.el === el) return; // already editing this region
    e.preventDefault();
    e.stopPropagation();
    activateRich(el, token, options, mode);
  });
}

function activateRich(el: HTMLElement, token: string, options: ResolvedOptions, mode: RichMode): void {
  deactivateRich(); // commit any previously-active region first
  richCtx = { el, token, options, originalHtml: el.innerHTML, mode };
  el.setAttribute("contenteditable", "true");
  el.classList.add("cms-rich-editing");
  el.focus();
  showRichToolbar();
  // Let the host page react (e.g. pause a rotating hero carousel while editing).
  document.dispatchEvent(new CustomEvent("cms-inline-edit:activate", { detail: { el } }));
}

function deactivateRich(): void {
  if (!richCtx) return;
  const { el, token, options, originalHtml, mode } = richCtx;
  richCtx = null;
  el.removeAttribute("contenteditable");
  el.classList.remove("cms-rich-editing");
  hideRichToolbar();
  if (el.innerHTML !== originalHtml) {
    const value = mode === "html" ? el.innerHTML : htmlToMarkdown(el.innerHTML);
    void saveField(el, value, token, options);
  }
  document.dispatchEvent(new CustomEvent("cms-inline-edit:deactivate", { detail: { el } }));
}

function showRichToolbar(): void {
  if (!richToolbar) richToolbar = buildRichToolbar();
  richToolbar.style.display = "flex";
}

function hideRichToolbar(): void {
  if (richToolbar) richToolbar.style.display = "none";
  hideEmojiPicker();
}

function toolbarButton(label: string, title: string, onDown: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.innerHTML = label;
  b.title = title;
  b.style.cssText =
    "background:none;border:1px solid #3a3f4a;color:#fff;min-width:30px;height:30px;" +
    "border-radius:6px;cursor:pointer;font-size:14px;padding:0 8px;line-height:1;";
  b.addEventListener("mouseenter", () => (b.style.background = "#2a2f38"));
  b.addEventListener("mouseleave", () => (b.style.background = "none"));
  // mousedown + preventDefault so the contenteditable selection isn't lost.
  b.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onDown();
  });
  return b;
}

function buildRichToolbar(): HTMLElement {
  const t = document.createElement("div");
  t.setAttribute("data-cms-inline-edit-toolbar", "");
  t.style.cssText =
    "position:fixed;top:14px;left:50%;transform:translateX(-50%);" +
    "background:#1c2027;border:1px solid #3a3f4a;border-radius:10px;" +
    "padding:6px 10px;display:flex;gap:6px;align-items:center;" +
    "z-index:2147483647;box-shadow:0 8px 32px rgba(0,0,0,.5);" +
    "font-family:system-ui,sans-serif;";

  t.appendChild(toolbarButton("<b>B</b>", "Fed", () => document.execCommand("bold")));
  t.appendChild(toolbarButton("<i>I</i>", "Kursiv", () => document.execCommand("italic")));
  t.appendChild(toolbarButton("<u>U</u>", "Understreget", () => document.execCommand("underline")));

  const sep = () => {
    const s = document.createElement("div");
    s.style.cssText = "width:1px;height:20px;background:#3a3f4a;";
    return s;
  };
  t.appendChild(sep());

  // Text color — execCommand foreColor applies to the current selection.
  const clrLabel = document.createElement("label");
  clrLabel.style.cssText = "display:flex;align-items:center;gap:5px;color:#9aa4b2;font-size:12px;cursor:pointer;";
  clrLabel.textContent = "Farve";
  const clr = document.createElement("input");
  clr.type = "color";
  clr.style.cssText = "width:28px;height:24px;border:1px solid #3a3f4a;border-radius:5px;cursor:pointer;padding:1px;background:none;";
  clr.addEventListener("mousedown", (e) => e.stopPropagation());
  clr.addEventListener("input", () => document.execCommand("foreColor", false, clr.value));
  clrLabel.prepend(clr);
  t.appendChild(clrLabel);

  t.appendChild(sep());

  const emojiBtn = toolbarButton("😀", "Indsæt emoji", () => toggleEmojiPicker(emojiBtn));
  emojiBtn.style.fontSize = "16px";
  t.appendChild(emojiBtn);

  t.appendChild(sep());

  const done = document.createElement("button");
  done.type = "button";
  done.textContent = "Færdig";
  done.style.cssText =
    "background:#00b2ff;border:none;color:#04121c;padding:0 14px;height:30px;" +
    "border-radius:6px;cursor:pointer;font-size:12px;font-weight:700;";
  done.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    deactivateRich();
  });
  t.appendChild(done);

  document.body.appendChild(t);
  return t;
}

/* ─── emoji picker (compact) ────────────────────────────────────────────── */
const EMOJIS =
  "😀 😃 😄 😁 😆 😉 😊 😍 🤩 😎 🤔 🙌 👏 👍 👎 🙏 💪 🔥 ⚡ ✨ 🎉 ✅ ❌ 💯 ⭐ 🚀 💡 📈 📉 🧠 ❤️ 🧡 💛 💚 💙 💜 🇩🇰 🇪🇺".split(
    " ",
  );
let emojiPicker: HTMLElement | null = null;
let savedRange: Range | null = null;

function toggleEmojiPicker(anchor: HTMLElement): void {
  if (!emojiPicker) emojiPicker = buildEmojiPicker();
  if (emojiPicker.style.display === "block") {
    hideEmojiPicker();
    return;
  }
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) savedRange = sel.getRangeAt(0).cloneRange();
  const rect = anchor.getBoundingClientRect();
  emojiPicker.style.top = `${rect.bottom + 6}px`;
  emojiPicker.style.left = `${Math.min(rect.left, window.innerWidth - 240)}px`;
  emojiPicker.style.display = "block";
}

function hideEmojiPicker(): void {
  if (emojiPicker) emojiPicker.style.display = "none";
}

function buildEmojiPicker(): HTMLElement {
  const p = document.createElement("div");
  p.setAttribute("data-cms-inline-edit-toolbar", "");
  p.style.cssText =
    "position:fixed;z-index:2147483646;background:#1c2027;border:1px solid #3a3f4a;" +
    "border-radius:10px;padding:8px;width:230px;max-height:200px;overflow-y:auto;" +
    "display:none;box-shadow:0 8px 32px rgba(0,0,0,.5);";
  const grid = document.createElement("div");
  grid.style.cssText = "display:flex;flex-wrap:wrap;gap:2px;";
  EMOJIS.forEach((em) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = em;
    b.style.cssText =
      "background:none;border:none;cursor:pointer;border-radius:5px;width:32px;height:32px;font-size:18px;";
    b.addEventListener("mouseenter", () => (b.style.background = "#2a2f38"));
    b.addEventListener("mouseleave", () => (b.style.background = "none"));
    b.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      insertEmoji(em);
    });
    grid.appendChild(b);
  });
  p.appendChild(grid);
  document.body.appendChild(p);
  return p;
}

function insertEmoji(emoji: string): void {
  if (!richCtx) return;
  richCtx.el.focus();
  const sel = window.getSelection();
  if (savedRange && sel) {
    sel.removeAllRanges();
    sel.addRange(savedRange);
  }
  document.execCommand("insertText", false, emoji);
  savedRange = null;
  hideEmojiPicker();
}

// Click outside the active region (and outside the toolbar) commits the edit.
if (typeof document !== "undefined") {
  document.addEventListener(
    "mousedown",
    (e) => {
      if (!richCtx) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-cms-inline-edit-toolbar]")) return;
      if (richCtx.el.contains(target)) return;
      deactivateRich();
    },
    true,
  );
}

/**
 * Sets a value at a dot-path into a plain-data tree, where a numeric segment
 * indexes into an array (e.g. "slides.2.eyebrow" — flagship-style nested
 * content; a flat "heroEyebrow" is still just a 1-segment path). Bails
 * silently (no throw) if the path doesn't resolve — a stale/malformed path
 * must never crash the save, just fail to apply.
 */
function setDeepField(data: Record<string, unknown>, path: string, value: string): void {
  const parts = path.split(".");
  let obj: any = data;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i] ?? "";
    const key: string | number = /^\d+$/.test(part) ? Number(part) : part;
    if (obj == null || typeof obj !== "object" || obj[key] === undefined) return;
    obj = obj[key];
  }
  const last = parts[parts.length - 1] ?? "";
  const lastKey: string | number = /^\d+$/.test(last) ? Number(last) : last;
  if (obj == null || typeof obj !== "object") return;
  obj[lastKey] = value;
}

/**
 * Converts an edited contenteditable region's innerHTML back to Markdown so a
 * rich article body round-trips through the cms `richtext` contract (fields
 * store Markdown, `marked` renders it — NOT HTML). Handles the structures a
 * marked-rendered body + the toolbar produce: headings, paragraphs, emphasis,
 * links, lists, blockquote, code. Formatting with no clean Markdown equivalent
 * (underline, coloured spans) is passed through as inline HTML — `marked`
 * renders inline HTML, so it survives without corrupting the source. Tables and
 * anything unrecognised are passed through as their outerHTML for the same
 * reason: never drop content just because it doesn't map to a Markdown token.
 */
function htmlToMarkdown(html: string): string {
  const container = document.createElement("div");
  container.innerHTML = html;
  return serializeBlockChildren(container).replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

function serializeBlockChildren(parent: Node): string {
  const blocks: string[] = [];
  parent.childNodes.forEach((node) => {
    const s = serializeBlock(node).trim();
    if (s) blocks.push(s);
  });
  return blocks.join("\n\n");
}

function serializeBlock(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? "").trim();
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  switch (tag) {
    case "h1": return "# " + serializeInline(el);
    case "h2": return "## " + serializeInline(el);
    case "h3": return "### " + serializeInline(el);
    case "h4": return "#### " + serializeInline(el);
    case "h5": return "##### " + serializeInline(el);
    case "h6": return "###### " + serializeInline(el);
    case "p":
    case "div":
      return serializeInline(el);
    case "ul":
      return serializeList(el, false);
    case "ol":
      return serializeList(el, true);
    case "blockquote":
      // Serialize the quote's OWN block children (it usually wraps <p>s), then
      // prefix each line with "> " — treating it as inline dropped the <p> and
      // left a stray leading space.
      return serializeBlockChildren(el)
        .split("\n")
        .map((l) => (l ? "> " + l : ">"))
        .join("\n");
    case "pre":
      return "```\n" + (el.textContent ?? "").replace(/\n+$/, "") + "\n```";
    case "hr":
      return "---";
    case "br":
      return "";
    case "table":
      // Rebuild the Markdown pipe table (NOT raw-HTML passthrough) so the
      // consumer's marked renderer re-applies its own table treatment (e.g.
      // broberg's mobile scroll-wrapper) instead of getting a bare <table>.
      return serializeTable(el);
    default:
      return serializeInline(el);
  }
}

function serializeTable(table: HTMLElement): string {
  const cellText = (c: Element) => serializeInline(c).trim().replace(/\|/g, "\\|");
  const rows: string[] = [];
  const headCells = Array.from(table.querySelectorAll("thead tr")).flatMap((tr) =>
    Array.from(tr.children).map(cellText),
  );
  if (headCells.length) {
    rows.push("| " + headCells.join(" | ") + " |");
    rows.push("| " + headCells.map(() => "---").join(" | ") + " |");
  }
  const bodyRows = table.querySelector("tbody")
    ? Array.from(table.querySelectorAll("tbody tr"))
    : Array.from(table.querySelectorAll("tr")).filter((tr) => !tr.closest("thead"));
  bodyRows.forEach((tr) => {
    rows.push("| " + Array.from(tr.children).map(cellText).join(" | ") + " |");
  });
  return rows.join("\n");
}

function serializeList(listEl: HTMLElement, ordered: boolean): string {
  const items: string[] = [];
  let n = 1;
  listEl.childNodes.forEach((child) => {
    if (child.nodeType === Node.ELEMENT_NODE && (child as HTMLElement).tagName.toLowerCase() === "li") {
      const marker = ordered ? `${n++}. ` : "- ";
      items.push(marker + serializeInline(child as HTMLElement).trim());
    }
  });
  return items.join("\n");
}

function serializeInline(node: Node): string {
  let out = "";
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      out += (child.textContent ?? "").replace(/\s+/g, " ");
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    const el = child as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const inner = serializeInline(el);
    switch (tag) {
      case "strong":
      case "b":
        out += inner.trim() ? `**${inner.trim()}**` : "";
        break;
      case "em":
      case "i":
        out += inner.trim() ? `*${inner.trim()}*` : "";
        break;
      case "code":
        out += "`" + inner + "`";
        break;
      case "br":
        out += "  \n";
        break;
      case "a": {
        const href = el.getAttribute("href") || "";
        out += href ? `[${inner}](${href})` : inner;
        break;
      }
      case "img": {
        // Content images embedded in the body (![alt](src)) — dropping them
        // would silently delete images from an article on save. Void element,
        // no children, so this must be handled explicitly.
        const src = el.getAttribute("src") || "";
        const alt = el.getAttribute("alt") || "";
        if (src) out += `![${alt}](${src})`;
        break;
      }
      case "u":
        out += `<u>${inner}</u>`; // no Markdown for underline — pass through
        break;
      case "span":
      case "font": {
        const color = el.style.color || el.getAttribute("color") || "";
        out += color ? `<span style="color:${color}">${inner}</span>` : inner;
        break;
      }
      default:
        out += inner;
    }
  });
  return out;
}

async function saveField(el: HTMLElement, value: string, token: string, options: ResolvedOptions): Promise<void> {
  const collection = el.dataset.cmsCollection;
  const slug = el.dataset.cmsSlug;
  const field = el.dataset.cmsField;
  if (!collection || !slug || !field) return;

  showPill(el, "saving");
  try {
    const getRes = await fetch(
      `${options.cmsBaseUrl}/api/cms/${collection}/${slug}?site=${options.siteId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!getRes.ok) throw new Error(`GET failed: ${getRes.status}`);
    const doc = (await getRes.json()) as { data?: Record<string, unknown> };
    // Deep-clone so mutating a nested array/object (dot-path saves) never
    // aliases the fetched doc — same safety whether field is flat or nested.
    const mergedData = JSON.parse(JSON.stringify(doc.data ?? {})) as Record<string, unknown>;
    if (field.includes(".")) {
      setDeepField(mergedData, field, value);
    } else {
      mergedData[field] = value;
    }

    const patchRes = await fetch(
      `${options.cmsBaseUrl}/api/cms/${collection}/${slug}?site=${options.siteId}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ data: mergedData }),
      },
    );
    if (!patchRes.ok) throw new Error(`PATCH failed: ${patchRes.status}`);
    showPill(el, "saved");
  } catch {
    showPill(el, "error");
  }
}

const pills = new WeakMap<HTMLElement, HTMLElement>();

function showPill(el: HTMLElement, state: "saving" | "saved" | "error"): void {
  let pill = pills.get(el);
  if (!pill) {
    pill = document.createElement("span");
    pill.setAttribute("data-cms-inline-edit-pill", "");
    document.body.appendChild(pill);
    pills.set(el, pill);
  }
  const rect = el.getBoundingClientRect();
  pill.style.cssText =
    `position:fixed;top:${rect.top - 26}px;left:${rect.left}px;font:600 11px system-ui,sans-serif;` +
    `padding:3px 9px;border-radius:5px;z-index:2147483647;pointer-events:none;` +
    `box-shadow:0 2px 8px rgba(0,0,0,.25);`;

  if (state === "saving") {
    pill.textContent = "Gemmer…";
    pill.style.background = "#1c2027";
    pill.style.color = "#fff";
  } else if (state === "saved") {
    pill.textContent = "Gemt ✓";
    pill.style.background = "#16a34a";
    pill.style.color = "#fff";
    setTimeout(() => {
      pill?.remove();
      pills.delete(el);
    }, 1500);
  } else {
    pill.textContent = "Fejl — prøv igen";
    pill.style.background = "#dc2626";
    pill.style.color = "#fff";
  }
}

function showActiveBadge(token: string, options: ResolvedOptions): void {
  const claims = decodeJwtPayload(token);
  const name = (claims?.name as string) || (claims?.email as string) || "ukendt";

  const badge = document.createElement("div");
  badge.setAttribute("data-cms-inline-edit-badge", "");
  badge.style.cssText =
    "position:fixed;bottom:16px;left:16px;display:flex;align-items:center;gap:8px;" +
    "background:#1c2027;color:#fff;font:600 12px system-ui,sans-serif;padding:8px 14px;" +
    "border-radius:999px;z-index:2147483647;box-shadow:0 4px 16px rgba(0,0,0,.3);";

  const label = document.createElement("span");
  label.textContent = `✏️ Redigerer som ${name}`;
  badge.appendChild(label);

  const disconnectBtn = document.createElement("button");
  disconnectBtn.type = "button";
  disconnectBtn.textContent = "Afbryd";
  disconnectBtn.style.cssText =
    "background:none;border:none;color:#8ab4ff;font:600 11px system-ui,sans-serif;" +
    "cursor:pointer;padding:0;text-decoration:underline;";
  disconnectBtn.addEventListener("click", () => {
    disconnect(options);
    window.location.reload();
  });
  badge.appendChild(disconnectBtn);

  document.body.appendChild(badge);
}

/** Reads JWT claims for DISPLAY ONLY — never used for authorization decisions. */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

function injectStyles(): void {
  const style = document.createElement("style");
  style.textContent = `
    [data-cms-field] { outline: 1px dashed transparent; outline-offset: 2px; cursor: text; transition: outline-color .15s; }
    [data-cms-field]:hover { outline-color: rgba(0,178,255,.5); }
    [data-cms-field][contenteditable="true"] { outline: 2px solid #00b2ff; outline-offset: 2px; }
    [data-cms-field][data-cms-richtext="true"] { cursor: text; }
    .cms-rich-editing { outline: 2px solid #00b2ff !important; outline-offset: 6px; border-radius: 4px; }
  `;
  document.head.appendChild(style);
}
