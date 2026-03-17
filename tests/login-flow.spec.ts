import { test, expect } from "playwright/test";

const BASE_URL = process.env.TEST_URL || "https://webhouse-app.fly.dev";

test.describe("Login flow", () => {
  test("can login and reach admin dashboard", async ({ page }) => {
    // Enable console logging from the page
    page.on("console", (msg) => console.log(`[browser] ${msg.type()}: ${msg.text()}`));
    page.on("request", (req) => {
      if (req.url().includes("/api/auth") || req.url().includes("/admin")) {
        console.log(`[request] ${req.method()} ${req.url()}`);
      }
    });
    page.on("response", (res) => {
      if (res.url().includes("/api/auth") || (res.url().includes("/admin") && !res.url().includes("/_next/"))) {
        console.log(`[response] ${res.status()} ${res.url()}`);
        const cookies = res.headers()["set-cookie"];
        if (cookies) console.log(`[set-cookie] ${cookies.substring(0, 80)}...`);
      }
    });

    // Go to login page
    await page.goto(BASE_URL + "/admin/login", { waitUntil: "commit", timeout: 15000 });

    // Wait for either login form or setup page
    await page.waitForTimeout(3000);
    console.log(`[after goto] URL: ${page.url()}`);

    // If we ended up on setup, that's the bug
    if (page.url().includes("/admin/setup")) {
      console.log("[BUG] Redirected to setup instead of login!");
      // Check the setup API
      const setupRes = await page.evaluate(() => fetch("/api/auth/setup").then(r => r.json()));
      console.log(`[setup API] ${JSON.stringify(setupRes)}`);
    }

    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 10000 });

    // Fill in credentials
    await page.fill('input[type="email"]', "cb@webhouse.dk");
    await page.fill('input[type="password"]', "webhouse2026");

    // Submit
    await page.click('button[type="submit"]');

    // Wait and see what happens
    await page.waitForTimeout(5000);

    // Log final URL
    console.log(`[final URL] ${page.url()}`);

    // Check if we're on admin (not login)
    expect(page.url()).not.toContain("/admin/login");
    expect(page.url()).toContain("/admin");

    // Verify dashboard content is visible
    await expect(page.locator("text=Content Overview")).toBeVisible({ timeout: 10000 });
  });
});
