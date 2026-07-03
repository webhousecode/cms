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
    void saveField(el, token, options);
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

async function saveField(el: HTMLElement, token: string, options: ResolvedOptions): Promise<void> {
  const collection = el.dataset.cmsCollection;
  const slug = el.dataset.cmsSlug;
  const field = el.dataset.cmsField;
  if (!collection || !slug || !field) return;
  const value = el.textContent?.trim() ?? "";

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
  `;
  document.head.appendChild(style);
}
