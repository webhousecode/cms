/**
 * F80 — Playwright workflow helpers for common CMS admin operations.
 *
 * Each function performs a multi-step workflow using stable data-testid selectors.
 *
 * Usage:
 *   import { test, expect } from "../fixtures/auth";
 *   import { switchToSite, openDocument, editTextField, saveDocument } from "../helpers/workflows";
 *
 *   test("edit title", async ({ authedPage: page }) => {
 *     await switchToSite(page, "examples", "freelancer");
 *     await openDocument(page, "services", "starter-package");
 *     await editTextField(page, "title", "New Title");
 *     await saveDocument(page);
 *   });
 */
import type { Page } from "@playwright/test";
import { sel, field, fieldInput, btn, nav, navCollection, collectionItem, settingsTab, SITE_SWITCHER } from "./selectors";

const BASE = process.env.BASE_URL ?? "http://localhost:3010";

// ── Site navigation ────────────────────────────────────────

/** Switch active site via cookies (avoids UI interaction) */
export async function switchToSite(page: Page, org: string, site: string): Promise<void> {
  await page.context().addCookies([
    { name: "cms-active-org", value: org, domain: "localhost", path: "/" },
    { name: "cms-active-site", value: site, domain: "localhost", path: "/" },
  ]);
}

/** Navigate to a collection's document list */
export async function openCollection(page: Page, collection: string): Promise<void> {
  await page.goto(`${BASE}/admin/content/${collection}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
}

/** Navigate to a specific document in the editor */
export async function openDocument(page: Page, collection: string, slug: string): Promise<void> {
  await page.goto(`${BASE}/admin/content/${collection}/${slug}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
}

// ── Field editing ──────────────────────────────────────────

/** Fill a text field by name */
export async function editTextField(page: Page, fieldName: string, value: string): Promise<void> {
  const selector = fieldInput("text", fieldName);
  await page.locator(selector).fill(value);
}

/** Fill a textarea field by name */
export async function editTextareaField(page: Page, fieldName: string, value: string): Promise<void> {
  const selector = fieldInput("textarea", fieldName);
  await page.locator(selector).fill(value);
}

/** Toggle a boolean field */
export async function toggleBooleanField(page: Page, fieldName: string): Promise<void> {
  await page.locator(field("boolean", fieldName)).click();
}

/** Get the current value of a text field */
export async function getTextFieldValue(page: Page, fieldName: string): Promise<string> {
  return page.locator(fieldInput("text", fieldName)).inputValue();
}

// ── Document actions ───────────────────────────────────────

/** Click the Save button */
export async function saveDocument(page: Page): Promise<void> {
  await page.locator(btn("save")).click();
  await page.waitForTimeout(1000);
}

/** Click a named action button */
export async function clickAction(page: Page, action: string): Promise<void> {
  await page.locator(btn(action)).click();
}

// ── Verification ───────────────────────────────────────────

/** Verify a text field has a specific value */
export async function verifyFieldValue(page: Page, fieldName: string, expected: string): Promise<void> {
  const { expect } = await import("@playwright/test");
  await expect(page.locator(fieldInput("text", fieldName))).toHaveValue(expected);
}

/** Verify a document exists in collection list */
export async function verifyDocumentInList(page: Page, slug: string): Promise<void> {
  const { expect } = await import("@playwright/test");
  await expect(page.locator(collectionItem(slug))).toBeVisible();
}

// ── Settings ───────────────────────────────────────────────

/** Navigate to settings and switch to a specific tab */
export async function openSettingsTab(page: Page, tab: string): Promise<void> {
  await page.goto(`${BASE}/admin/settings?tab=${tab}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
}

// ── Pages ──────────────────────────────────────────────────

/** Navigate to media library */
export async function openMedia(page: Page): Promise<void> {
  await page.goto(`${BASE}/admin/media`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
}

/** Navigate to sites page */
export async function openSites(page: Page): Promise<void> {
  await page.goto(`${BASE}/admin/sites`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
}
