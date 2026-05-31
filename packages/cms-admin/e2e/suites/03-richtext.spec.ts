/**
 * F99 — Richtext editor content roundtrip tests.
 *
 * Verifies that content typed in the richtext editor survives:
 * 1. Save (Cmd+S)
 * 2. Tab navigation (switch away and back)
 * 3. Full page reload
 *
 * Migrated from: richtext-roundtrip.spec.ts
 * @see docs/features/F99-e2e-testing-suite.md
 */
import { test, expect } from "../fixtures/auth";
import {
  waitForEditor,
  getEditorText,
  typeInEditor,
  saveDocument,
} from "../fixtures/helpers";

const TEST_SLUG = "cms-chronicle-00-why-we-are-building-this";
const COLLECTION = "posts";
const UNIQUE_MARKER = `E2E-ROUNDTRIP-${Date.now()}`;

test.describe("Richtext editor content roundtrip", () => {
  test("content survives save", async ({ authedPage: page }) => {
    await page.goto(`/admin/${COLLECTION}/${TEST_SLUG}`);
    await page.waitForLoadState("domcontentloaded");

    await typeInEditor(page, UNIQUE_MARKER);

    let text = await getEditorText(page);
    expect(text).toContain(UNIQUE_MARKER);

    await saveDocument(page);
    await page.waitForTimeout(5000);

    text = await getEditorText(page);
    expect(text).toContain(UNIQUE_MARKER);
  });

  test("content survives tab navigation", async ({ authedPage: page }) => {
    await page.goto(`/admin/${COLLECTION}/${TEST_SLUG}`);
    await page.waitForLoadState("domcontentloaded");

    await typeInEditor(page, UNIQUE_MARKER);
    await saveDocument(page);
    await page.waitForTimeout(3000);

    let text = await getEditorText(page);
    expect(text).toContain(UNIQUE_MARKER);

    // Navigate away and back
    await page.goto("/admin/media");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1000);
    await page.goto(`/admin/${COLLECTION}/${TEST_SLUG}`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);

    text = await getEditorText(page);
    expect(text).toContain(UNIQUE_MARKER);
  });

  test("content survives full page reload", async ({ authedPage: page }) => {
    await page.goto(`/admin/${COLLECTION}/${TEST_SLUG}`);
    await page.waitForLoadState("domcontentloaded");

    await typeInEditor(page, UNIQUE_MARKER);
    await saveDocument(page);
    await page.waitForTimeout(3000);

    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);

    const text = await getEditorText(page);
    expect(text).toContain(UNIQUE_MARKER);
  });

  // Cleanup: remove test markers from the document
  test.afterAll(async ({ browser }) => {
    const { SignJWT } = await import("jose");
    const JWT_SECRET =
      process.env.CMS_JWT_SECRET ??
      process.env.JWT_SECRET ?? "";

    const context = await browser.newContext();
    const secret = new TextEncoder().encode(JWT_SECRET);
    const token = await new SignJWT({
      sub: "test-user",
      email: "cb@webhouse.dk",
      name: "Test Admin",
      role: "admin",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(secret);
    await context.addCookies([
      { name: "cms-session", value: token, domain: "localhost", path: "/" },
    ]);
    const page = await context.newPage();

    try {
      const res = await page.request.get(
        `http://localhost:3010/api/cms/${COLLECTION}/${TEST_SLUG}`,
      );
      if (res.ok()) {
        const doc = await res.json();
        const body = String(doc.data?.body ?? "");
        const cleaned = body
          .split("\n")
          .filter((line: string) => !line.includes("E2E-ROUNDTRIP-"))
          .join("\n");
        if (cleaned !== body) {
          await page.request.patch(
            `http://localhost:3010/api/cms/${COLLECTION}/${TEST_SLUG}`,
            { data: { data: { ...doc.data, body: cleaned } } },
          );
        }
      }
    } catch {
      /* cleanup is best-effort */
    }
    await context.close();
  });
});
