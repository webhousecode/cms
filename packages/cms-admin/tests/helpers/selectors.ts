/**
 * F80 — Selector helpers for Playwright tests.
 *
 * All selectors use stable data-testid attributes.
 * Convention: field-{type}-{name}, nav-link-{name}, btn-{action}, etc.
 *
 * Usage:
 *   import { sel, field, btn, nav } from "../helpers/selectors";
 *   await page.locator(field("text", "title")).fill("Hello");
 *   await page.locator(btn("save")).click();
 */

// ── Generic selector ───────────────────────────────────────
/** Build a data-testid selector */
export function sel(testId: string): string {
  return `[data-testid="${testId}"]`;
}

// ── Field selectors ────────────────────────────────────────
/** Select a field editor by type and name: field-{type}-{name} */
export function field(type: string, name: string): string {
  return sel(`field-${type}-${name}`);
}

/** Select a field editor input (finds the actual input/textarea inside the testid wrapper) */
export function fieldInput(type: string, name: string): string {
  const base = field(type, name);
  switch (type) {
    case "text":
    case "date":
      return base; // Input component has testid directly
    case "textarea":
      return base; // Textarea component has testid directly
    case "boolean":
      return base; // Label wrapper has testid
    case "select":
      return `${base} [role="combobox"], ${base} button`;
    case "richtext":
      return `${base} .tiptap`;
    default:
      return `${base} input, ${base} textarea`;
  }
}

// ── Button selectors ───────────────────────────────────────
/** Select a button: btn-{name} */
export function btn(name: string): string {
  return sel(`btn-${name}`);
}

// ── Navigation selectors ───────────────────────────────────
/** Select a nav link: nav-link-{name} */
export function nav(name: string): string {
  return sel(`nav-link-${name}`);
}

/** Select a collection nav link: nav-link-collection-{name} */
export function navCollection(collection: string): string {
  return sel(`nav-link-collection-${collection}`);
}

// ── Layout selectors ───────────────────────────────────────
export const SIDEBAR = sel("sidebar");
export const SITE_SWITCHER = sel("site-switcher");
export const ORG_SWITCHER = sel("org-switcher");
export const ACTION_BAR = sel("action-bar");
export const DOCUMENT_EDITOR = sel("document-editor");
export const MEDIA_LIBRARY = sel("media-library");

// ── Collection selectors ───────────────────────────────────
/** Select collection list container */
export function collectionList(name: string): string {
  return sel(`collection-list-${name}`);
}

/** Select a document row in collection list */
export function collectionItem(slug: string): string {
  return sel(`collection-item-${slug}`);
}

// ── Site selectors ─────────────────────────────────────────
/** Select a site card */
export function siteCard(siteId: string): string {
  return sel(`site-card-${siteId}`);
}

// ── Settings selectors ─────────────────────────────────────
/** Select a settings tab */
export function settingsTab(tab: string): string {
  return sel(`settings-tab-${tab}`);
}

/** Select a settings panel */
export function settingsPanel(tab: string): string {
  return sel(`settings-panel-${tab}`);
}

/** Select a panel component */
export function panel(name: string): string {
  return sel(`panel-${name}`);
}

// ── Media selectors ────────────────────────────────────────
/** Select a media item */
export function mediaItem(filename: string): string {
  return sel(`media-item-${filename}`);
}
