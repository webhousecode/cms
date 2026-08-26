/**
 * Browser entry — zero dependencies. Site-wide: activated once per browser
 * via a "connect" link (see docs/features/F157-inline-editing.md), then
 * every page load on the site automatically offers click-to-edit on any
 * element carrying data-cms-collection/data-cms-slug/data-cms-field
 * (F129's attribute convention) — no per-document step.
 */
import { applyFieldSlice } from "./field-slice";
export { applyFieldSlice } from "./field-slice";
import { serializeTokenSafe, hasTokenChips, lockTokenChips } from "./token-safe";

/**
 * Labels for the in-editor UI — the rich-text toolbar (bold/italic/underline
 * tooltips, the visible "colour" + "done" buttons, the emoji tooltip) and the
 * save-status pill. Every field is optional; unset fields keep the Danish
 * default. Pass an English (or any-locale) set on a non-Danish site so the
 * toolbar and status text match the page language.
 */
export interface InlineEditLabels {
  bold?: string;
  italic?: string;
  underline?: string;
  orderedList?: string;
  unorderedList?: string;
  color?: string;
  emoji?: string;
  done?: string;
  saving?: string;
  saved?: string;
  error?: string;
  /** F164 — link dialog. */
  link?: string;
  linkTabPage?: string;
  linkTabUrl?: string;
  linkSearch?: string;
  linkText?: string;
  linkTextAuto?: string;
  linkTextAutoHint?: string;
  linkTextOwnHint?: string;
  linkLiveHint?: string;
  linkUrlHint?: string;
  linkUrl?: string;
  linkInsert?: string;
  linkSave?: string;
  linkCancel?: string;
  linkRemove?: string;
  linkRemoveConfirm?: string;
  linkYes?: string;
  linkNo?: string;
  linkEmpty?: string;
  linkLoading?: string;
}

export interface InlineEditOptions {
  /** Base URL of the CMS API, e.g. "https://webhouse.app". */
  cmsBaseUrl: string;
  /** Site id passed as ?site= on every CMS API call, e.g. "broberg-ai". */
  siteId: string;
  /** URL query param carrying a freshly-minted token from the connect redirect. Default "cms_edit". */
  tokenParam?: string;
  /** localStorage key the token is persisted under — survives across sessions/tabs. Default "wh-inline-edit-token". */
  storageKey?: string;
  /** Text for the "not connected yet" prompt (a square-pen icon is prepended). Default "Log ind for at redigere". */
  connectLabel?: string;
  /** Text for the "connected + editing" badge — clicking it LEAVES edit mode but keeps the login (icon prepended). Default "Afbryd". */
  disconnectLabel?: string;
  /** Text for the explicit "log out" action on the idle pill — clicking it clears the token (back to the logged-out state). Default "Log ud". */
  logoutLabel?: string;
  /** Show an on-site "connect" pill to LOGGED-OUT visitors (click → connect flow).
   *  Default FALSE — customer-safe: a visitor without a token sees NOTHING. Only
   *  enable for a site with no real customers (e.g. an internal/first-party site)
   *  where a self-contained on-site login entry is wanted. The safe entry for a
   *  customer site is always the "Redigér live" button in webhouse.app CMS-admin. */
  connectPrompt?: boolean;
  /** Localised labels for the toolbar + save-status pill. Defaults are Danish. */
  labels?: InlineEditLabels;
}

interface ResolvedOptions extends Required<Omit<InlineEditOptions, "labels">> {
  labels: Required<InlineEditLabels>;
}

const DEFAULT_LABELS: Required<InlineEditLabels> = {
  bold: "Fed",
  italic: "Kursiv",
  underline: "Understreget",
  orderedList: "Nummereret liste",
  unorderedList: "Punktliste",
  color: "Farve",
  emoji: "Indsæt emoji",
  done: "Færdig",
  saving: "Gemmer…",
  saved: "Gemt ✓",
  error: "Fejl — prøv igen",
  link: "Link",
  linkTabPage: "Side på sitet",
  linkTabUrl: "Fri adresse",
  linkSearch: "Søg efter en side…",
  linkText: "Linktekst",
  linkTextAuto: "Følger sidens titel",
  linkTextAutoHint:
    "<b>Tom = følger sidens titel.</b> Omdøbes siden, retter teksten sig selv. Skriver du din egen tekst, bliver den stående.",
  linkTextOwnHint:
    "Linket viser <b>din egen tekst</b>. Den bliver stående, også hvis siden omdøbes.",
  linkLiveHint:
    "Linket peger på <b>siden</b> — ikke på en adresse. Flyttes siden, eller får den et nyt navn, retter linket sig selv.",
  linkUrlHint:
    "En fri adresse peger præcis dér, du skriver. Den følger <b>ikke</b> med, hvis målet flytter sig.",
  linkUrl: "Adresse",
  linkInsert: "Indsæt link",
  linkSave: "Gem ændring",
  linkCancel: "Annullér",
  linkRemove: "Fjern link",
  linkRemoveConfirm: "Fjern?",
  linkYes: "Ja",
  linkNo: "Nej",
  linkEmpty: "Ingen sider fundet",
  linkLoading: "Henter sider…",
};

// Set once from resolved options in initInlineEdit(); read by the (singleton)
// toolbar and the save-status pill so their signatures stay unchanged. One edit
// session per page → a single module-level value is safe.
let uiLabels: Required<InlineEditLabels> = DEFAULT_LABELS;

function resolveOptions(options: InlineEditOptions): ResolvedOptions {
  return {
    tokenParam: "cms_edit",
    storageKey: "wh-inline-edit-token",
    // No emoji in defaults — the square-pen SVG is the icon; some sites ban emoji.
    connectLabel: "Log ind for at redigere",
    disconnectLabel: "Afbryd",
    logoutLabel: "Log ud",
    connectPrompt: false,
    ...options,
    labels: { ...DEFAULT_LABELS, ...(options.labels ?? {}) },
  };
}

export async function initInlineEdit(options: InlineEditOptions): Promise<void> {
  if (typeof window === "undefined") return;
  const resolved = resolveOptions(options);
  uiLabels = resolved.labels;

  // Capture BEFORE checkEnabled so we know whether the token JUST arrived from
  // the connect redirect (→ drop straight into edit mode) vs. a normal load
  // with a stored token (→ idle "Rediger" pill, don't force edit mode).
  const freshFromUrl = captureTokenFromUrl(resolved);

  const enabled = await checkEnabled(resolved);
  if (!enabled) return;

  const token = getConnectedToken(options);
  if (!token) {
    // Logged-out visitor / customer. DEFAULT: show NOTHING (customer-safe) —
    // the consumer can now call initInlineEdit() unconditionally without leaking
    // an edit affordance. Only sites that opt in (connectPrompt: true) get the
    // on-site connect pill + its popup token receiver.
    if (resolved.connectPrompt) {
      showConnectPrompt(resolved);
      // F158 — the connect flow opens in a popup; it posts the freshly-minted
      // token back to this tab. Arm the (origin-validated) receiver.
      listenForTokenMessage(resolved);
    }
    return;
  }

  // Connected editor. Wire fields once, then pick the entry state: arrived from
  // connect → edit now; normal load with a stored token → idle "Rediger" pill
  // (one click enters edit mode; the token persists so "Rediger" stays visible
  // on every page while logged in — no trip back to admin).
  setupFields(token, resolved);
  if (freshFromUrl) enterEditMode();
  else showIdlePill();
}

/**
 * F158 — receive the edit token from the connect popup via postMessage.
 * Hard origin check (message MUST come from cmsBaseUrl) + type + site + expiry
 * guards before the token is trusted. On success: persist, swap the connect
 * prompt for edit mode — no page reload.
 */
function listenForTokenMessage(options: ResolvedOptions): void {
  let cmsOrigin: string;
  try {
    cmsOrigin = new URL(options.cmsBaseUrl).origin;
  } catch {
    return;
  }
  window.addEventListener("message", (event: MessageEvent) => {
    if (event.origin !== cmsOrigin) return;
    const data = event.data as { type?: string; token?: string; site?: string } | null;
    if (!data || data.type !== "wh-inline-edit-token" || typeof data.token !== "string") return;
    if (data.site && data.site !== options.siteId) return;
    if (isExpired(data.token)) return;
    if (document.querySelector("[data-cms-inline-edit-badge]")) return; // already active
    localStorage.setItem(options.storageKey, data.token);
    document.querySelector("[data-cms-inline-edit-connect]")?.remove();
    // Fresh connect via popup → wire fields + drop straight into edit mode.
    setupFields(data.token, options);
    enterEditMode();
  });
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
  if (isExpired(token) || !isForThisSite(token, resolved.siteId)) {
    localStorage.removeItem(resolved.storageKey);
    return null;
  }
  return token;
}

/**
 * Is this token scoped to the site this page belongs to?
 *
 * NOT an authorization check — the server is, and it holds: proxy.ts refuses a
 * token whose `site` claim differs from the request's site, measured 2026-08-17
 * at 403 on both GET and PATCH. This is a UX guard. Without it the editor
 * entered edit mode with a foreign-site token, made the page look editable, and
 * then failed EVERY save — and the natural reaction is to hunt for the bug in
 * your own site rather than suspect the token (reported by the sanneandersen
 * session, who predicted exactly that dead end). Better to not offer editing at
 * all than to offer it and lose the work.
 *
 * A token that cannot be read at all is let through: the server decides, and an
 * unreadable token simply fails there instead of being silently discarded here.
 */
function isForThisSite(token: string, siteId: string): boolean {
  const claims = decodeJwtPayload(token);
  const site = claims?.site;
  if (typeof site !== "string" || !site) return true; // not ours to judge
  return site === siteId;
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

/** Captures a token minted by /admin/inline-edit/connect, then strips it from
 *  the URL. Returns true when a FRESH token was just captured from the URL
 *  (i.e. this is the connect-redirect landing) so the caller can auto-enter
 *  edit mode; false on a normal load where the token comes from localStorage. */
function captureTokenFromUrl(options: ResolvedOptions): boolean {
  const url = new URL(window.location.href);
  const urlToken = url.searchParams.get(options.tokenParam);
  if (!urlToken) return false;
  localStorage.setItem(options.storageKey, urlToken);
  url.searchParams.delete(options.tokenParam);
  window.history.replaceState({}, "", url.toString());
  return true;
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

// Lucide "square-pen" (https://lucide.dev/icons/square-pen), MIT. Inline SVG so
// the pill needs no icon-font/runtime dep and inherits `currentColor`. Emoji are
// deliberately avoided — some consumer sites ban them outright.
const SQUARE_PEN_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" ' +
  'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
  'stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>' +
  '<path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/>' +
  "</svg>";

// Toolbar list-button faces (lucide "list" / "list-ordered"), inline so no
// icon-font/runtime dep; stroke inherits the button's white `currentColor`.
const UL_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" ' +
  'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
  'stroke-linejoin="round" aria-hidden="true">' +
  '<line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/>' +
  '<line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/>' +
  '<line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/>' +
  "</svg>";

const OL_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" ' +
  'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
  'stroke-linejoin="round" aria-hidden="true">' +
  '<line x1="10" x2="21" y1="6" y2="6"/><line x1="10" x2="21" y1="12" y2="12"/>' +
  '<line x1="10" x2="21" y1="18" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/>' +
  '<path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>' +
  "</svg>";

const LINK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" ' +
  'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
  'stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/>' +
  '<path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>' +
  "</svg>";

function makeIcon(): HTMLSpanElement {
  const icon = document.createElement("span");
  icon.style.cssText = "display:inline-flex;line-height:0;flex:0 0 auto";
  icon.innerHTML = SQUARE_PEN_SVG;
  return icon;
}

function showConnectPrompt(options: ResolvedOptions): void {
  const connectUrl = buildConnectUrl(options, window.location.href);

  const link = document.createElement("a");
  link.href = connectUrl;
  link.setAttribute("data-cms-inline-edit-connect", "");
  link.style.cssText =
    "position:fixed;bottom:16px;left:16px;background:#1c2027;color:#fff;" +
    "font:600 12px system-ui,sans-serif;padding:8px 14px;border-radius:999px;" +
    "text-decoration:none;z-index:2147483647;box-shadow:0 4px 16px rgba(0,0,0,.3);" +
    "display:inline-flex;align-items:center;gap:7px;";
  const text = document.createElement("span");
  text.textContent = options.connectLabel;
  link.append(makeIcon(), text);
  // F158 — open the connect flow in a popup so the CMS confirmation screen can
  // say "close this window". A user-gesture window.open is not popup-blocked;
  // if it is blocked anyway, fall back to the same-tab redirect (F157 path).
  link.addEventListener("click", (e) => {
    e.preventDefault();
    const popup = window.open(
      connectUrl,
      "wh-inline-edit-connect",
      "width=460,height=640,menubar=no,toolbar=no,location=yes,status=no",
    );
    if (!popup) window.location.href = connectUrl;
  });
  document.body.appendChild(link);
}

// ─── Connected-editor state machine ────────────────────────────────────────
// A connected editor (valid token) is ALWAYS in one of two visible states:
//   idle    → a "Rediger" pill (options.connectLabel); one click enters editing.
//   editing → fields are contenteditable + an "Afslut redigering" pill.
// Leaving edit mode returns to idle and KEEPS the token — the editor stays
// logged in and can re-enter with one click, on every page, for the token's
// whole life. Only an explicit "Log ud" clears the token (→ logged-out state:
// no pill at all, same as a customer). A field is wired at most ONCE (idempotent
// via wiredFields); their click handlers no-op while editingActive is false, so
// idle is truly inert. On an SPA (soft-navigation, no full reload) new pages add
// fresh [data-cms-field] nodes to the DOM AFTER init — the consumer calls
// rescanFields() (e.g. on route change) to wire those late arrivals.
let editingActive = false;
let fieldsWired = false;
let stateOptions: ResolvedOptions | null = null;
// Elements whose listeners are already attached — makes wireField idempotent so
// setupFields (once) and rescanFields (N times) can both run without double-wiring.
const wiredFields = new WeakSet<HTMLElement>();

function setupFields(token: string, options: ResolvedOptions): void {
  stateOptions = options;
  if (fieldsWired) return;
  injectStyles();
  document.querySelectorAll<HTMLElement>("[data-cms-field]").forEach((el) => wireField(el, token, options));
  observeNewFields();
  fieldsWired = true;
}

let fieldObserver: MutationObserver | null = null;

/**
 * Re-wire fields that appear after the first scan, without the consumer having
 * to ask.
 *
 * rescanFields() below has existed for this since day one, and its own comment
 * says "a consumer calls this on every route change". webhouse.dk did not, and
 * the result was the worst shape a failure can take: the badge kept saying
 * AFSLUT REDIGERING while every field on every page reached by clicking a link
 * was dead. Nothing errored. Reported by the site owner, reproduced in a
 * browser — after a soft navigation the clicked field's contenteditable stayed
 * null and no toolbar appeared.
 *
 * A contract that depends on every consumer remembering a call is a contract
 * that will be broken silently, so the package now keeps its own promise.
 * rescanFields() stays exported and still works — a consumer that already calls
 * it is unaffected, and wireField is idempotent, so the two cannot conflict.
 *
 * Cheap by construction: the observer only fires on childList changes and the
 * rescan is coalesced into one animation frame, so a page inserting many nodes
 * costs one scan, not one per node.
 */
function observeNewFields(): void {
  if (fieldObserver || typeof MutationObserver === "undefined") return;
  let queued = false;
  fieldObserver = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      rescanFields();
    });
  });
  fieldObserver.observe(document.body, { childList: true, subtree: true });
}

/**
 * Wire any [data-cms-field] elements added to the DOM since the last scan.
 * Needed on single-page apps (Next.js et al.): the layout mounts once → init +
 * setupFields run once → only the first page's fields get listeners. Soft
 * navigation swaps in new pages' fields WITHOUT re-running init, so their
 * click-to-edit never activates. A consumer calls this on every route change.
 *
 * Safe + idempotent by design:
 *  - No-ops unless a connected, non-expired token exists (same guard as init) —
 *    a consumer may call it unconditionally without leaking an edit affordance.
 *  - wireField skips already-wired elements (wiredFields WeakSet), so re-scanning
 *    the whole document costs nothing for existing fields.
 *  - Does NOT touch edit-mode state: editingActive (module-level) and
 *    body[data-cms-editing] persist across a soft-nav, so freshly-wired fields
 *    are immediately live when the editor is mid-session — no re-enter needed.
 * MPA consumers (broberg: full reload per navigation re-runs init) never need it.
 */
export function rescanFields(): void {
  if (typeof window === "undefined" || !stateOptions) return;
  const token = localStorage.getItem(stateOptions.storageKey);
  if (!token || isExpired(token)) return;
  document.querySelectorAll<HTMLElement>("[data-cms-field]").forEach((el) => wireField(el, token, stateOptions!));
}

function enterEditMode(): void {
  if (!stateOptions || editingActive) return;
  editingActive = true;
  // Marks the page as actively editing → unlocks the field hover-outline +
  // text-cursor affordance (see injectStyles). In idle the fields look/behave
  // like normal text; the edit affordance appears only after "Rediger".
  document.body.setAttribute("data-cms-editing", "true");
  removeIdlePill();
  showActiveBadge(stateOptions);
}

function exitEditMode(): void {
  if (!stateOptions || !editingActive) return;
  deactivateRich(); // commit any active rich region first
  editingActive = false;
  document.body.removeAttribute("data-cms-editing");
  document.querySelector("[data-cms-inline-edit-badge]")?.remove();
  showIdlePill();
}

function removeIdlePill(): void {
  document.querySelector("[data-cms-inline-edit-idle]")?.remove();
}

function showIdlePill(): void {
  if (!stateOptions) return;
  // Invariant: the idle pill is showing ⟹ we are NOT editing. Force the flag
  // false here so "Rediger" (enterEditMode) can never become a no-op if the
  // state ever diverged from the visible pill (defensive — enterEditMode bails
  // when editingActive is already true).
  editingActive = false;
  document.body.removeAttribute("data-cms-editing");
  const options = stateOptions;
  removeIdlePill();
  const wrap = document.createElement("div");
  wrap.setAttribute("data-cms-inline-edit-idle", "");
  wrap.style.cssText =
    "position:fixed;bottom:16px;left:16px;display:inline-flex;align-items:stretch;" +
    "z-index:2147483647;box-shadow:0 4px 16px rgba(0,0,0,.3);border-radius:999px;overflow:hidden;";
  // Main action: "Rediger" → enter edit mode (no server round-trip; the token
  // already exists locally).
  const edit = document.createElement("button");
  edit.type = "button";
  edit.setAttribute("data-cms-inline-edit-enter", "");
  edit.style.cssText =
    "display:inline-flex;align-items:center;gap:7px;background:#1c2027;color:#fff;" +
    "font:600 12px system-ui,sans-serif;padding:8px 14px;border:none;cursor:pointer;";
  const editText = document.createElement("span");
  editText.textContent = options.connectLabel;
  edit.append(makeIcon(), editText);
  edit.addEventListener("click", enterEditMode);
  // Secondary: "Log ud" → clear the token (back to the logged-out state).
  const out = document.createElement("button");
  out.type = "button";
  out.setAttribute("data-cms-inline-edit-logout", "");
  out.textContent = options.logoutLabel;
  out.style.cssText =
    "background:#141821;color:#9aa4b2;font:600 11px system-ui,sans-serif;padding:8px 12px;" +
    "border:none;border-left:1px solid rgba(255,255,255,.12);cursor:pointer;";
  out.addEventListener("click", () => {
    disconnect(options);
    removeIdlePill();
  });
  wrap.append(edit, out);
  document.body.appendChild(wrap);
}

function wireField(el: HTMLElement, token: string, options: ResolvedOptions): void {
  if (wiredFields.has(el)) return; // idempotent — safe to re-scan (rescanFields)
  wiredFields.add(el);
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
    if (!editingActive) return; // idle: the field behaves normally, not editable
    if (el.getAttribute("contenteditable") === "true") return;
    // Many editable fields (card titles/blurbs) sit inside a clickable <a>/
    // <button> ancestor (the card itself) — without this, "click to edit"
    // would immediately navigate away instead of focusing the field.
    e.preventDefault();
    e.stopPropagation();
    // Token-safe fields render {år}-style auto-values as atomic chips. Read the
    // TEMPLATE form (chips → their tokens) so the saved value keeps its tokens,
    // and lock the chips so each edits as one unbreakable unit.
    const tokenSafe = hasTokenChips(el);
    el.dataset.cmsOriginalValue = tokenSafe ? serializeTokenSafe(el) : (el.textContent ?? "");
    el.setAttribute("contenteditable", "true");
    if (tokenSafe) lockTokenChips(el);
    el.focus();
  });

  el.addEventListener("blur", () => {
    el.removeAttribute("contenteditable");
    const original = el.dataset.cmsOriginalValue ?? "";
    const current = hasTokenChips(el) ? serializeTokenSafe(el) : (el.textContent ?? "");
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
    if (!editingActive) return; // idle: the field behaves normally, not editable
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
  hideLinkDialog();
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

  t.appendChild(toolbarButton("<b>B</b>", uiLabels.bold, () => document.execCommand("bold")));
  t.appendChild(toolbarButton("<i>I</i>", uiLabels.italic, () => document.execCommand("italic")));
  t.appendChild(toolbarButton("<u>U</u>", uiLabels.underline, () => document.execCommand("underline")));

  const sep = () => {
    const s = document.createElement("div");
    s.style.cssText = "width:1px;height:20px;background:#3a3f4a;";
    return s;
  };
  t.appendChild(sep());

  // Bullet + numbered lists — native execCommand, and the Markdown serializer
  // already round-trips <ul>/<ol> to "- " / "1. " so no save-path change needed.
  t.appendChild(toolbarButton(UL_SVG, uiLabels.unorderedList, () => document.execCommand("insertUnorderedList")));
  t.appendChild(toolbarButton(OL_SVG, uiLabels.orderedList, () => document.execCommand("insertOrderedList")));

  t.appendChild(sep());

  // F164 — link: a free URL, or a live reference to a page on the site.
  const linkBtn = toolbarButton(LINK_SVG, uiLabels.link, () => toggleLinkDialog(linkBtn));
  linkBtn.setAttribute("data-testid", "inline-toolbar-link");
  t.appendChild(linkBtn);

  t.appendChild(sep());

  // Text color — execCommand foreColor applies to the current selection.
  const clrLabel = document.createElement("label");
  clrLabel.style.cssText = "display:flex;align-items:center;gap:5px;color:#9aa4b2;font-size:12px;cursor:pointer;";
  clrLabel.textContent = uiLabels.color;
  const clr = document.createElement("input");
  clr.type = "color";
  clr.style.cssText = "width:28px;height:24px;border:1px solid #3a3f4a;border-radius:5px;cursor:pointer;padding:1px;background:none;";
  clr.addEventListener("mousedown", (e) => e.stopPropagation());
  clr.addEventListener("input", () => document.execCommand("foreColor", false, clr.value));
  clrLabel.prepend(clr);
  t.appendChild(clrLabel);

  t.appendChild(sep());

  const emojiBtn = toolbarButton("😀", uiLabels.emoji, () => toggleEmojiPicker(emojiBtn));
  emojiBtn.style.fontSize = "16px";
  t.appendChild(emojiBtn);

  t.appendChild(sep());

  const done = document.createElement("button");
  done.type = "button";
  done.textContent = uiLabels.done;
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

/* ------------------------------------------------------------------ F164 --
 * Link dialog: a free URL, or a LIVE reference to a page on the site.
 *
 * A page link stores data-cms-ref="collection:slug" next to a real working
 * href, so resolveCmsLinks() (see ./server) can re-point it when the page moves
 * or is renamed. Leaving the label empty marks it data-cms-ref-label="auto" so
 * the link shows the page's current title.
 * -------------------------------------------------------------------------- */

interface LinkablePage {
  collection: string;
  slug: string;
  title: string;
  path: string;
  label: string;
}

let linkDialog: HTMLElement | null = null;
let linkPages: LinkablePage[] | null = null;
let linkPicked: LinkablePage | null = null;
let linkEditing: HTMLAnchorElement | null = null;

function hideLinkDialog(): void {
  if (linkDialog) linkDialog.style.display = "none";
  linkPicked = null;
  linkEditing = null;
}

/** The <a> the caret sits inside, if any — so clicking Link EDITS it. */
function anchorAtCaret(): HTMLAnchorElement | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  let node: Node | null = sel.getRangeAt(0).startContainer;
  while (node && node !== document.body) {
    if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === "A") {
      return node as HTMLAnchorElement;
    }
    node = node.parentNode;
  }
  return null;
}

async function fetchLinkablePages(): Promise<LinkablePage[]> {
  if (linkPages) return linkPages;
  if (!richCtx) return [];
  const { options, token } = richCtx;
  const url = `${options.cmsBaseUrl}/api/inline-edit/pages?site=${encodeURIComponent(options.siteId)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`pages ${res.status}`);
  const body = (await res.json()) as { pages?: LinkablePage[] };
  linkPages = body.pages ?? [];
  return linkPages;
}

function toggleLinkDialog(anchor: HTMLElement): void {
  if (linkDialog && linkDialog.style.display === "block") {
    hideLinkDialog();
    return;
  }
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) savedRange = sel.getRangeAt(0).cloneRange();
  linkEditing = anchorAtCaret();
  if (!linkDialog) linkDialog = buildLinkDialog();
  renderLinkDialog();
  const rect = anchor.getBoundingClientRect();
  linkDialog.style.top = `${rect.bottom + 8}px`;
  linkDialog.style.left = `${Math.min(Math.max(8, rect.left - 180), window.innerWidth - 400)}px`;
  linkDialog.style.display = "block";
}

function buildLinkDialog(): HTMLElement {
  const d = document.createElement("div");
  d.setAttribute("data-cms-inline-edit-toolbar", ""); // shares the "don't commit on click" guard
  d.setAttribute("data-testid", "inline-link-dialog");
  d.style.cssText =
    "position:fixed;z-index:2147483646;background:#1c2027;border:1px solid #3a3f4a;" +
    "border-radius:10px;width:392px;display:none;box-shadow:0 8px 32px rgba(0,0,0,.5);" +
    "font-family:system-ui,sans-serif;color:#fff;overflow:hidden;";
  // Keep the page selection alive while interacting with the dialog.
  d.addEventListener("mousedown", (e) => {
    const t = e.target as HTMLElement;
    if (t.tagName !== "INPUT") e.preventDefault();
    e.stopPropagation();
  });
  document.body.appendChild(d);
  return d;
}

function renderLinkDialog(): void {
  const d = linkDialog;
  if (!d) return;
  const L = uiLabels;
  const editing = !!linkEditing;
  const existingRef = linkEditing?.getAttribute("data-cms-ref") ?? "";
  const onPageTab = !editing || !!existingRef;

  d.innerHTML =
    '<div style="display:flex;gap:4px;padding:8px 8px 0">' +
    `<button type="button" data-testid="inline-link-tab-page" data-tab="page" style="${tabCss(onPageTab)}">${L.linkTabPage}</button>` +
    `<button type="button" data-testid="inline-link-tab-url" data-tab="url" style="${tabCss(!onPageTab)}">${L.linkTabUrl}</button>` +
    "</div>" +
    '<div style="padding:10px 12px 12px">' +
    `<div data-pane="page" style="display:${onPageTab ? "block" : "none"}">` +
    `<input data-testid="inline-link-search" data-role="search" placeholder="${L.linkSearch}" style="${fieldCss()}">` +
    `<div data-role="list" data-testid="inline-link-list" style="margin-top:8px;max-height:196px;overflow-y:auto;border:1px solid #3a3f4a;border-radius:8px;background:#141821"></div>` +
    "</div>" +
    `<div data-pane="url" style="display:${onPageTab ? "none" : "block"}">` +
    `<label style="${labelCss()}">${L.linkUrl}</label>` +
    `<input data-testid="inline-link-url" data-role="url" placeholder="https://…" style="${fieldCss()}">` +
    "</div>" +
    `<label style="${labelCss()}">${L.linkText}</label>` +
    `<input data-testid="inline-link-text" data-role="text" placeholder="${L.linkTextAuto}" style="${fieldCss()}">` +
    `<p data-role="hint" style="font-size:11.5px;color:#9aa3b2;margin:6px 0 0;line-height:1.5"></p>` +
    `<div data-role="live" style="display:flex;gap:8px;margin-top:12px;padding:9px 10px;background:rgba(0,178,255,.08);border:1px solid rgba(0,178,255,.28);border-radius:8px">` +
    `<p style="margin:0;font-size:11.5px;color:#c9d1dd;line-height:1.55">${L.linkLiveHint}</p></div>` +
    '<div style="display:flex;gap:8px;align-items:center;margin-top:14px">' +
    '<div data-role="remove"></div><div style="flex:1"></div>' +
    `<button type="button" data-testid="inline-link-cancel" data-role="cancel" style="${btnCss(false)}">${L.linkCancel}</button>` +
    `<button type="button" data-testid="inline-link-submit" data-role="submit" style="${btnCss(true)}" disabled>${editing ? L.linkSave : L.linkInsert}</button>` +
    "</div></div>";

  const q = <T extends HTMLElement>(role: string) => d.querySelector(`[data-role="${role}"]`) as T;
  const text = q<HTMLInputElement>("text");
  const urlIn = q<HTMLInputElement>("url");
  const search = q<HTMLInputElement>("search");

  if (editing) {
    text.value = linkEditing?.getAttribute("data-cms-ref-label") === "auto" ? "" : (linkEditing?.textContent ?? "");
    if (!existingRef) urlIn.value = linkEditing?.getAttribute("href") ?? "";
    q<HTMLElement>("remove").appendChild(buildRemoveLink());
  }

  d.querySelectorAll<HTMLElement>("[data-tab]").forEach((btn) => {
    btn.onclick = () => {
      const page = btn.dataset.tab === "page";
      d.querySelectorAll<HTMLElement>("[data-tab]").forEach((b) => {
        b.setAttribute("style", tabCss(b.dataset.tab === "page" ? page : !page));
      });
      (d.querySelector('[data-pane="page"]') as HTMLElement).style.display = page ? "block" : "none";
      (d.querySelector('[data-pane="url"]') as HTMLElement).style.display = page ? "none" : "block";
      q<HTMLElement>("live").style.display = page ? "flex" : "none";
      syncLinkDialog();
    };
  });

  search.oninput = () => renderLinkList(search.value);
  text.oninput = syncLinkDialog;
  urlIn.oninput = syncLinkDialog;
  q<HTMLElement>("cancel").onclick = hideLinkDialog;
  q<HTMLElement>("submit").onclick = applyLink;

  renderLinkList("");
  syncLinkDialog();
}

function buildRemoveLink(): HTMLElement {
  const wrap = document.createElement("div");
  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute("data-testid", "inline-link-remove");
  btn.textContent = uiLabels.linkRemove;
  btn.style.cssText =
    "background:none;border:none;color:#ff8a8a;font-size:12.5px;cursor:pointer;padding:0 2px;";
  btn.onclick = () => {
    wrap.innerHTML =
      `<span style="font-size:11.5px;color:#ff8a8a;font-weight:500;padding:0 2px">${uiLabels.linkRemoveConfirm}</span>` +
      `<button type="button" data-testid="inline-link-remove-yes" style="font-size:11px;padding:2px 8px;border-radius:4px;border:none;background:#c0392b;color:#fff;cursor:pointer;line-height:1.4;margin-left:6px">${uiLabels.linkYes}</button>` +
      `<button type="button" data-testid="inline-link-remove-no" style="font-size:11px;padding:2px 8px;border-radius:4px;border:1px solid #3a3f4a;background:none;color:#fff;cursor:pointer;line-height:1.4;margin-left:6px">${uiLabels.linkNo}</button>`;
    (wrap.querySelector('[data-testid="inline-link-remove-no"]') as HTMLElement).onclick = () => {
      wrap.innerHTML = "";
      wrap.appendChild(btn);
    };
    (wrap.querySelector('[data-testid="inline-link-remove-yes"]') as HTMLElement).onclick = () => {
      if (linkEditing) {
        const parent = linkEditing.parentNode;
        while (linkEditing.firstChild) parent?.insertBefore(linkEditing.firstChild, linkEditing);
        parent?.removeChild(linkEditing);
      }
      hideLinkDialog();
    };
  };
  wrap.appendChild(btn);
  return wrap;
}

function renderLinkList(filter: string): void {
  const d = linkDialog;
  if (!d) return;
  const list = d.querySelector('[data-role="list"]') as HTMLElement | null;
  if (!list) return;

  const paint = (pages: LinkablePage[]) => {
    const f = filter.trim().toLowerCase();
    const shown = pages.filter((p) => !f || `${p.title} ${p.path}`.toLowerCase().includes(f));
    if (!shown.length) {
      list.innerHTML = `<div style="padding:10px;font-size:12.5px;color:#9aa3b2">${uiLabels.linkEmpty}</div>`;
      return;
    }
    list.innerHTML = "";
    shown.forEach((p) => {
      const on = linkPicked?.collection === p.collection && linkPicked?.slug === p.slug;
      const row = document.createElement("div");
      row.setAttribute("data-testid", `inline-link-page-${p.collection}-${p.slug}`);
      row.style.cssText =
        "display:flex;align-items:center;gap:10px;padding:8px 10px;cursor:pointer;" +
        "border-bottom:1px solid #232833;" +
        (on ? "background:rgba(0,178,255,.14);" : "");
      row.innerHTML =
        `<div style="min-width:0;flex:1"><div style="font-size:13.5px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(p.title)}</div>` +
        `<div style="font-size:11.5px;color:#9aa3b2;font-family:ui-monospace,Menlo,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(p.path)}</div></div>` +
        `<span style="flex:none;font-size:10px;text-transform:uppercase;color:#9aa3b2;border:1px solid #3a3f4a;border-radius:4px;padding:2px 6px;white-space:nowrap">${escapeHtml(p.label)}</span>`;
      row.onclick = () => {
        linkPicked = p;
        renderLinkList(filter);
        syncLinkDialog();
      };
      list.appendChild(row);
    });
  };

  if (linkPages) {
    paint(linkPages);
    return;
  }
  list.innerHTML = `<div style="padding:10px;font-size:12.5px;color:#9aa3b2">${uiLabels.linkLoading}</div>`;
  fetchLinkablePages()
    .then((pages) => {
      // Pre-select the page an existing reference already points at.
      const ref = linkEditing?.getAttribute("data-cms-ref");
      if (ref && !linkPicked) {
        const [c, ...rest] = ref.split(":");
        linkPicked = pages.find((p) => p.collection === c && p.slug === rest.join(":")) ?? null;
      }
      paint(pages);
      syncLinkDialog();
    })
    .catch(() => {
      list.innerHTML = `<div style="padding:10px;font-size:12.5px;color:#ff8a8a">${uiLabels.error}</div>`;
    });
}

function syncLinkDialog(): void {
  const d = linkDialog;
  if (!d) return;
  const q = <T extends HTMLElement>(role: string) => d.querySelector(`[data-role="${role}"]`) as T;
  const onPage = (d.querySelector('[data-pane="page"]') as HTMLElement).style.display !== "none";
  const own = q<HTMLInputElement>("text").value.trim();
  q<HTMLElement>("hint").innerHTML = own
    ? (uiLabels.linkTextOwnHint as string)
    : onPage
      ? (uiLabels.linkTextAutoHint as string)
      : (uiLabels.linkUrlHint as string);
  q<HTMLElement>("live").style.display = onPage ? "flex" : "none";
  (q<HTMLButtonElement>("submit")).disabled = onPage
    ? !linkPicked
    : !q<HTMLInputElement>("url").value.trim();
}

function applyLink(): void {
  const d = linkDialog;
  if (!d || !richCtx) return;
  const q = <T extends HTMLElement>(role: string) => d.querySelector(`[data-role="${role}"]`) as T;
  const onPage = (d.querySelector('[data-pane="page"]') as HTMLElement).style.display !== "none";
  const own = q<HTMLInputElement>("text").value.trim();
  const href = onPage ? (linkPicked?.path ?? "") : q<HTMLInputElement>("url").value.trim();
  if (!href) return;

  const ref = onPage && linkPicked ? `${linkPicked.collection}:${linkPicked.slug}` : "";
  const label = own || (onPage ? (linkPicked?.title ?? href) : href);

  if (linkEditing) {
    linkEditing.setAttribute("href", href);
    if (ref) linkEditing.setAttribute("data-cms-ref", ref);
    else linkEditing.removeAttribute("data-cms-ref");
    if (ref && !own) linkEditing.setAttribute("data-cms-ref-label", "auto");
    else linkEditing.removeAttribute("data-cms-ref-label");
    linkEditing.textContent = label;
    hideLinkDialog();
    return;
  }

  const a = document.createElement("a");
  a.setAttribute("href", href);
  if (ref) {
    a.setAttribute("data-cms-ref", ref);
    if (!own) a.setAttribute("data-cms-ref-label", "auto");
  }
  const sel = window.getSelection();
  if (savedRange && sel) {
    sel.removeAllRanges();
    sel.addRange(savedRange);
    const range = sel.getRangeAt(0);
    a.textContent = own || range.toString() || label;
    range.deleteContents();
    range.insertNode(a);
    sel.removeAllRanges();
  } else {
    a.textContent = label;
    richCtx.el.appendChild(a);
  }
  savedRange = null;
  hideLinkDialog();
}

function escapeHtml(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const tabCss = (on: boolean) =>
  "flex:1;background:" +
  (on ? "#2a2f38" : "none") +
  ";border:1px solid " +
  (on ? "#3a3f4a" : "transparent") +
  ";color:" +
  (on ? "#fff" : "#9aa3b2") +
  ";height:32px;border-radius:7px;font-size:13px;cursor:pointer;font-weight:500;font-family:inherit;";

const fieldCss = () =>
  "width:100%;background:#141821;border:1px solid #3a3f4a;color:#fff;height:34px;" +
  "border-radius:7px;padding:0 10px;font-size:13.5px;outline:none;font-family:inherit;box-sizing:border-box;";

const labelCss = () =>
  "font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#9aa3b2;margin:12px 0 5px;display:block;";

const btnCss = (primary: boolean) =>
  "height:33px;border-radius:7px;font-size:13px;cursor:pointer;padding:0 14px;font-weight:600;font-family:inherit;" +
  (primary
    ? "background:#00b2ff;color:#04121b;border:none;"
    : "background:none;border:1px solid #3a3f4a;color:#fff;font-weight:500;");

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
export function htmlToMarkdown(html: string): string {
  const container = document.createElement("div");
  container.innerHTML = html;
  reattachOrphanListItems(container);
  const md = serializeBlockChildren(container).replace(/\n{3,}/g, "\n\n").trim();
  // A whole document keeps its trailing newline — that is the file convention
  // a `richtext` body is stored with. A SINGLE-LINE inline field must NOT gain
  // one: a heading is not a document, and the newline is stored, shows up in
  // the CMS editor, and appears out of nowhere the first time anyone edits the
  // field. Measured on webhouse.dk 2026-08-24, where every heading became a
  // rich field: "Drift & Infrastruktur" came back as "Drift & Infrastruktur\n".
  return md.includes("\n") ? md + "\n" : md;
}

function isList(el: Element | null): el is HTMLElement {
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return tag === "ul" || tag === "ol";
}

/**
 * A contenteditable region can end up with an <li> as a DIRECT child of the
 * field container — browsers routinely split a list and orphan an item when the
 * caret sits in it, and `execCommand("insertUnorderedList")` does the same.
 * Serializing an orphan through the inline default silently drops its marker,
 * so a list item degrades into a paragraph and the stored Markdown is corrupted
 * (sanneandersen, 2026-08-16: a 13-item CV list saved back as 1 paragraph + 12
 * bullets on a public page, on every single save).
 *
 * Put each orphan back in the adjacent list — before it if the list follows,
 * after it if the list precedes — so author order survives. An orphan with no
 * list next to it gets its own.
 */
function reattachOrphanListItems(container: HTMLElement): void {
  const orphans = Array.from(container.children).filter(
    (c) => c.tagName.toLowerCase() === "li",
  );
  for (const li of orphans) {
    const prev = li.previousElementSibling;
    const next = li.nextElementSibling;
    if (isList(prev)) {
      prev.appendChild(li);
    } else if (isList(next)) {
      next.insertBefore(li, next.firstChild);
    } else {
      const list = container.ownerDocument.createElement("ul");
      li.replaceWith(list);
      list.appendChild(li);
    }
  }
}

/** Tags serializeBlock treats as their own block; everything else is inline. */
const BLOCK_TAGS = new Set([
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "div", "ul", "ol", "li", "blockquote", "pre", "hr", "table",
]);

function isBlockNode(node: Node): boolean {
  return (
    node.nodeType === Node.ELEMENT_NODE &&
    BLOCK_TAGS.has((node as HTMLElement).tagName.toLowerCase())
  );
}

function serializeBlockChildren(parent: Node): string {
  const blocks: string[] = [];
  // Text and inline elements sitting directly at block level form ONE implicit
  // paragraph. Serialising them one-by-one and joining with "\n\n" tore a
  // single sentence into separate blocks ("Noget <b>fedt</b> mere" became three
  // paragraphs) and dropped each element's own formatting. Gather the run, then
  // serialise it as the one paragraph the author actually wrote.
  let inlineRun = "";
  const flushInline = () => {
    const s = inlineRun.trim();
    if (s) blocks.push(s);
    inlineRun = "";
  };

  parent.childNodes.forEach((node) => {
    if (isBlockNode(node)) {
      flushInline();
      const s = serializeBlock(node).trim();
      if (s) blocks.push(s);
    } else {
      inlineRun = joinInline(inlineRun, serializeInlineNode(node));
    }
  });
  flushInline();

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
    // Backstop for an orphaned <li> that reattachOrphanListItems could not
    // place (e.g. nested inside another block). Without this it falls through
    // to the inline default and loses its marker — silent content loss.
    case "li":
      return "- " + serializeInline(el).trim();
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

/** Escape a value for use inside a double-quoted HTML attribute (F164). */
function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/**
 * The attributes on an <a> that must survive a save, already serialised.
 *
 * Everything except `href` is preserved verbatim, with two exceptions that are
 * dropped on purpose rather than round-tripped:
 *
 *  - `on*` handlers. Content is not a place for script, and writing one back
 *    out would let an edited field carry executable code into every reader's
 *    page. Nothing in the CMS puts them there, so dropping them loses nothing
 *    real — and unlike the accidental loss this function exists to fix, it is
 *    a decision rather than an oversight.
 *  - any OTHER attribute whose value is a `javascript:` URL, for the same
 *    reason. Note this does NOT cover `href` itself: a javascript: href with no
 *    other attributes still becomes a Markdown link, exactly as before. Whether
 *    that link is then rendered is the renderer's call, and each consumer
 *    already makes it (this repo's own site refuses the scheme).
 *
 * Empty array means "this is an ordinary link" — the caller then writes plain
 * Markdown, which is what the editor's own link button produces and what an
 * author reading the stored value expects to see.
 */
function preservedLinkAttrs(el: Element): string[] {
  const out: string[] = [];
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase();
    if (name === "href") continue;
    if (name.startsWith("on")) continue;
    if (/^javascript:/i.test(attr.value.trim())) continue;
    out.push(`${name}="${escapeAttr(attr.value)}"`);
  }
  return out;
}

/** Markdown's hard line break: two spaces then a newline. */
const HARD_BREAK = "  \n";

/**
 * Normalise one run of whitespace to the ONE thing Markdown can carry here: a
 * hard line break if the run contained a newline, otherwise a single space.
 */
function edgeWhitespace(ws: string): string {
  if (!ws) return "";
  return /\n/.test(ws) ? HARD_BREAK : " ";
}

/**
 * Wrap emphasis, moving the mark's OWN outer whitespace outside the delimiters
 * instead of deleting it.
 *
 * `**text **` is not valid Markdown emphasis, so the whitespace genuinely has
 * to leave the delimiters — but the previous `inner.trim()` threw it away, and
 * a browser routinely puts it there. Pressing Shift+Enter with the caret at the
 * end of bold text inserts the <br> INSIDE the still-active <strong>, so the
 * author's line break was silently deleted on save (sanneandersen 2026-08-26:
 * 13 occurrences on two public pages, "**Mulig økonomisk støtte**I visse
 * tilfælde" — no break, no space, the two sentences glued together). The same
 * trim ate a plain space on webhouse.dk a day earlier ("noget**exceptionelt**?").
 */
function wrapEmphasis(inner: string, delimiter: string): string {
  const core = inner.trim();
  if (!core) return "";
  const lead = edgeWhitespace(inner.slice(0, inner.length - inner.trimStart().length));
  const trail = edgeWhitespace(inner.slice(inner.trimEnd().length));
  return lead + delimiter + core + delimiter + trail;
}

/**
 * Append one serialised inline piece, collapsing a whitespace collision at the
 * seam. Needed because wrapEmphasis now emits the mark's edge whitespace and
 * the neighbouring text node usually carries one of its own — and two spaces at
 * the end of a line ARE a hard break in Markdown, so a duplicate would invent a
 * line break nobody typed. A real break always wins over a plain space.
 */
function joinInline(out: string, piece: string): string {
  if (!piece) return out;
  const outTail = /\s*$/.exec(out)![0];
  const pieceHead = /^\s*/.exec(piece)![0];
  if (!outTail || !pieceHead) return out + piece;
  const merged = /\n/.test(outTail + pieceHead) ? HARD_BREAK : " ";
  return out.slice(0, out.length - outTail.length) + merged + piece.slice(pieceHead.length);
}

function serializeInline(node: Node): string {
  let out = "";
  node.childNodes.forEach((child) => {
    out = joinInline(out, serializeInlineNode(child));
  });
  return out;
}

/**
 * Serialize ONE inline node, applying ITS OWN tag's formatting.
 *
 * Split out of serializeInline because that function only ever looked at a
 * node's CHILDREN: handed an element it returned the element's text with the
 * element's own markup dropped. serializeBlock's default arm did exactly that,
 * so a <strong> (or <em>, <code>, <a>, <img>) sitting at the top level of an
 * edited field lost its formatting — or, for an image, vanished entirely — on
 * save. Same failure family as the orphaned <li>, one tag deeper.
 */
function serializeInlineNode(child: Node): string {
  if (child.nodeType === Node.TEXT_NODE) {
    return (child.textContent ?? "").replace(/\s+/g, " ");
  }
  if (child.nodeType !== Node.ELEMENT_NODE) return "";
  {
    let out = "";
    const el = child as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const inner = serializeInline(el);
    switch (tag) {
      case "strong":
      case "b":
        out += wrapEmphasis(inner, "**");
        break;
      case "em":
      case "i":
        out += wrapEmphasis(inner, "*");
        break;
      case "code":
        out += "`" + inner + "`";
        break;
      case "br":
        out += "  \n";
        break;
      case "a": {
        const href = el.getAttribute("href") || "";
        // Markdown link syntax can hold a URL and nothing else. An anchor that
        // carries ANYTHING more — an F164 page reference, target, rel, a title —
        // therefore has to be emitted as inline HTML, which `marked` passes
        // through untouched. Collapsing it to [text](href) drops the extras on
        // the editor's very FIRST save, silently, while the link still works.
        //
        // F164: a page reference is what lets a link follow its page when that
        // page moves or is renamed. Losing it kills the whole feature.
        //
        // F157.7: measured on broberg.ai 2026-08-25 — a hand-written link with
        // target="_blank" rel="noopener noreferrer" came back as a bare
        // Markdown link after an edit to a DIFFERENT sentence in the same
        // field. rel="noopener" is a security attribute, not decoration.
        const extras = preservedLinkAttrs(el);
        if (extras.length > 0) {
          out += `<a ${[`href="${escapeAttr(href)}"`, ...extras].join(" ")}>${inner}</a>`;
        } else {
          out += href ? `[${inner}](${href})` : inner;
        }
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
    return out;
  }
}

async function saveField(el: HTMLElement, value: string, token: string, options: ResolvedOptions): Promise<void> {
  const collection = el.dataset.cmsCollection;
  const slug = el.dataset.cmsSlug;
  const field = el.dataset.cmsField;
  if (!collection || !slug || !field) return;
  const slice = el.dataset.cmsSlice;

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
    if (slice !== undefined) {
      // Field-slice save: replace just this segment inside the full field value,
      // preserving every other segment + embed. Aborts on a non-unique match.
      const currentVal = typeof mergedData[field] === "string" ? (mergedData[field] as string) : "";
      mergedData[field] = applyFieldSlice(currentVal, slice, value);
    } else if (field.includes(".")) {
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
    // The slice we just wrote is now the current text — track it so a second
    // edit of the same segment (no reload) matches against the new value.
    if (slice !== undefined) el.dataset.cmsSlice = value;
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
    pill.textContent = uiLabels.saving;
    pill.style.background = "#1c2027";
    pill.style.color = "#fff";
  } else if (state === "saved") {
    pill.textContent = uiLabels.saved;
    pill.style.background = "#16a34a";
    pill.style.color = "#fff";
    setTimeout(() => {
      pill?.remove();
      pills.delete(el);
    }, 1500);
  } else {
    pill.textContent = uiLabels.error;
    pill.style.background = "#dc2626";
    pill.style.color = "#fff";
  }
}

function showActiveBadge(options: ResolvedOptions): void {
  // The connected badge IS the exit-edit action: [icon] "Afslut redigering".
  // No "Redigerer som {name}" — the whole pill is one click to leave edit mode.
  const badge = document.createElement("button");
  badge.type = "button";
  badge.setAttribute("data-cms-inline-edit-badge", "");
  badge.style.cssText =
    "position:fixed;bottom:16px;left:16px;display:inline-flex;align-items:center;gap:7px;" +
    "background:#1c2027;color:#fff;font:600 12px system-ui,sans-serif;padding:8px 14px;" +
    "border-radius:999px;z-index:2147483647;box-shadow:0 4px 16px rgba(0,0,0,.3);" +
    "border:none;cursor:pointer;opacity:.9;transition:opacity .15s;";
  const text = document.createElement("span");
  text.textContent = options.disconnectLabel;
  badge.append(makeIcon(), text);
  badge.addEventListener("mouseenter", () => (badge.style.opacity = "1"));
  badge.addEventListener("mouseleave", () => (badge.style.opacity = ".9"));
  // Clicking the badge LEAVES edit mode but KEEPS the login → back to the idle
  // "Rediger" pill (not a logout). Explicit logout lives on the idle pill.
  badge.addEventListener("click", exitEditMode);
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
  // The hover-outline + text-cursor affordance is gated on body[data-cms-editing]
  // so it appears ONLY while actively editing (after "Rediger"). In idle a
  // connected editor's fields look + behave like normal page text — no dashed
  // outline, no text cursor — so the page never looks editable before you opt in.
  style.textContent = `
    [data-cms-field] { outline: 1px dashed transparent; outline-offset: 2px; transition: outline-color .15s; }
    body[data-cms-editing="true"] [data-cms-field] { cursor: text; }
    body[data-cms-editing="true"] [data-cms-field]:hover { outline-color: rgba(0,178,255,.5); }
    [data-cms-field][contenteditable="true"] { outline: 2px solid #00b2ff; outline-offset: 2px; }
    .cms-rich-editing { outline: 2px solid #00b2ff !important; outline-offset: 6px; border-radius: 4px; }
  `;
  document.head.appendChild(style);
}
