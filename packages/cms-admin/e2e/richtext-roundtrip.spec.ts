/**
 * E2E test: Richtext editor content roundtrip
 *
 * Verifies that content typed in the richtext editor survives:
 * 1. Save (Cmd+S)
 * 2. Tab navigation (switch to another page and back)
 * 3. Page reload
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { SignJWT } from "jose";

const JWT_SECRET = "b6ff0b5caa2ee4308470dfb3668b3835ef164174f87c176a41b8ea5e5b450dcd";
const TEST_SLUG = "cms-chronicle-00-why-we-are-building-this";
const COLLECTION = "posts";
const UNIQUE_MARKER = `E2E-ROUNDTRIP-${Date.now()}`;

async function login(context: BrowserContext) {
  const secret = new TextEncoder().encode(JWT_SECRET);
  const token = await new SignJWT({
    sub: "fb4eda6a-bc5c-4dec-8cb6-c77c9fb74cd9",
    email: "cb@webhouse.dk",
    name: "Christian",
    role: "admin",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(secret);
  await context.addCookies([
    { name: "cms-session", value: token, domain: "localhost", path: "/" },
  ]);
}

/** Wait for the richtext editor to be visible and ready */
async function waitForEditor(page: Page) {
  // Wait for either .rte or .tiptap or [contenteditable] to appear
  const editor = page.locator(".rte, .tiptap, [contenteditable='true']").first();
  await editor.waitFor({ state: "visible", timeout: 15_000 });
  return editor;
}

/** Get the visible text content from the richtext editor */
async function getEditorText(page: Page): Promise<string> {
  const editor = await waitForEditor(page);
  return (await editor.textContent()) ?? "";
}

/** Type text at the end of the richtext editor */
async function typeInEditor(page: Page, text: string) {
  const editor = await waitForEditor(page);
  await editor.click();
  await page.keyboard.press("Meta+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type(text, { delay: 10 });
}

/** Save the document with Cmd+S and wait for confirmation */
async function saveDocument(page: Page) {
  await page.keyboard.press("Meta+s");
  // Wait for save indicator
  await page.waitForTimeout(3000);
}

test.describe("Richtext editor content roundtrip", () => {
  test.beforeEach(async ({ context }) => {
    await login(context);
  });

  test("content survives save", async ({ page }) => {
    await page.goto(`/admin/${COLLECTION}/${TEST_SLUG}`);
    await page.waitForLoadState("domcontentloaded");

    // Debug: screenshot to verify page loaded
    await page.screenshot({ path: "e2e/screenshots/roundtrip-01-loaded.png" });

    // Type unique marker
    await typeInEditor(page, UNIQUE_MARKER);
    await page.screenshot({ path: "e2e/screenshots/roundtrip-02-typed.png" });

    // Verify text is in editor
    let text = await getEditorText(page);
    expect(text).toContain(UNIQUE_MARKER);

    // Save
    await saveDocument(page);
    await page.screenshot({ path: "e2e/screenshots/roundtrip-03-saved.png" });

    // Wait for any Fast Refresh / build
    await page.waitForTimeout(5000);

    // Verify text is still in editor after save + build
    text = await getEditorText(page);
    await page.screenshot({ path: "e2e/screenshots/roundtrip-04-after-build.png" });
    expect(text).toContain(UNIQUE_MARKER);
  });

  test("content survives tab navigation", async ({ page }) => {
    await page.goto(`/admin/${COLLECTION}/${TEST_SLUG}`);
    await page.waitForLoadState("domcontentloaded");

    await typeInEditor(page, UNIQUE_MARKER);
    await saveDocument(page);
    await page.waitForTimeout(3000);

    // Verify text after save
    let text = await getEditorText(page);
    expect(text).toContain(UNIQUE_MARKER);

    // Navigate away to Media
    await page.goto("/admin/media");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1000);

    // Navigate back to the document
    await page.goto(`/admin/${COLLECTION}/${TEST_SLUG}`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);

    await page.screenshot({ path: "e2e/screenshots/roundtrip-05-after-nav.png" });

    // Verify text survived navigation
    text = await getEditorText(page);
    expect(text).toContain(UNIQUE_MARKER);
  });

  test("content survives full page reload", async ({ page }) => {
    await page.goto(`/admin/${COLLECTION}/${TEST_SLUG}`);
    await page.waitForLoadState("domcontentloaded");

    await typeInEditor(page, UNIQUE_MARKER);
    await saveDocument(page);
    await page.waitForTimeout(3000);

    // Full reload
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);

    await page.screenshot({ path: "e2e/screenshots/roundtrip-06-after-reload.png" });

    const text = await getEditorText(page);
    expect(text).toContain(UNIQUE_MARKER);
  });

  // Cleanup: remove test markers
  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext();
    await login(context);
    const page = await context.newPage();
    try {
      const res = await page.request.get(`http://localhost:3010/api/cms/${COLLECTION}/${TEST_SLUG}`);
      if (res.ok()) {
        const doc = await res.json();
        const body = String(doc.data?.body ?? "");
        const cleaned = body.split("\n").filter((line: string) => !line.includes("E2E-ROUNDTRIP-")).join("\n");
        if (cleaned !== body) {
          await page.request.patch(`http://localhost:3010/api/cms/${COLLECTION}/${TEST_SLUG}`, {
            data: { data: { ...doc.data, body: cleaned } },
          });
        }
      }
    } catch { /* cleanup is best-effort */ }
    await context.close();
  });
});
