import { test, expect } from "playwright/test";

const BASE_URL = process.env.TEST_URL || "https://webhouse-app.fly.dev";

test.describe("webhouse.app landing page", () => {
  test("root serves landing page content", async ({ page }) => {
    const response = await page.goto(BASE_URL + "/");
    expect(response?.status()).toBe(200);
    const title = await page.title();
    expect(title).toMatch(/webhouse\.app/i);
  });

  test("/home returns 200 with correct title", async ({ page }) => {
    await page.goto(BASE_URL + "/home");
    await expect(page).toHaveTitle(/webhouse\.app/i);
  });

  test("landing page has key content", async ({ page }) => {
    await page.goto(BASE_URL + "/home");
    // Check for brand name
    const body = await page.textContent("body");
    expect(body).toContain("webhouse");
    // Check for CTA or key heading
    expect(body).toContain("CMS");
  });

  test("/admin/login is accessible", async ({ page }) => {
    const response = await page.goto(BASE_URL + "/admin/login");
    expect(response?.status()).toBe(200);
  });
});
