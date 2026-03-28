/**
 * F99 — Common E2E test helpers.
 *
 * Navigation, wait, and assertion utilities shared across suites.
 */
import type { Page } from "@playwright/test";

/** Wait for network to settle (replaces waitForLoadState("networkidle")) */
export async function waitForIdle(page: Page, timeout = 10_000) {
  await page.waitForLoadState("networkidle", { timeout });
}

/** Navigate to an admin page and wait for it to load */
export async function gotoAdmin(page: Page, path = "") {
  await page.goto(`/admin${path}`);
  await page.waitForLoadState("domcontentloaded");
}

/** Collect console errors during a test block */
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      // Filter known non-critical errors
      if (
        !text.includes("Download the React DevTools") &&
        !text.includes("chrome-extension://")
      ) {
        errors.push(text);
      }
    }
  });
  return errors;
}

/** Collect 404 responses during a test block */
export function collect404s(page: Page): string[] {
  const urls: string[] = [];
  page.on("response", (res) => {
    if (res.status() === 404) {
      urls.push(res.url());
    }
  });
  return urls;
}

/** Wait for the richtext editor to be visible */
export async function waitForEditor(page: Page) {
  const editor = page.locator(".rte, .tiptap, [contenteditable='true']").first();
  await editor.waitFor({ state: "visible", timeout: 15_000 });
  return editor;
}

/** Get visible text from the richtext editor */
export async function getEditorText(page: Page): Promise<string> {
  const editor = await waitForEditor(page);
  return (await editor.textContent()) ?? "";
}

/** Type text at the end of the richtext editor */
export async function typeInEditor(page: Page, text: string) {
  const editor = await waitForEditor(page);
  await editor.click();
  await page.keyboard.press("Meta+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type(text, { delay: 10 });
}

/** Save the current document with Cmd+S */
export async function saveDocument(page: Page) {
  await page.keyboard.press("Meta+s");
  await page.waitForTimeout(3000);
}

/** Get all visible tab titles from the tab bar */
export async function getTabTitles(page: Page): Promise<string[]> {
  const tabs = page.locator("[data-tab-id]");
  const count = await tabs.count();
  const titles: string[] = [];
  for (let i = 0; i < count; i++) {
    const text = await tabs.nth(i).textContent();
    if (text) titles.push(text.trim());
  }
  return titles;
}
