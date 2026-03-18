import { test, expect } from "playwright/test";

const BASE_URL = "http://localhost:3010";

test("local login flow", async ({ page }) => {
  page.on("response", (res) => {
    if (res.url().includes("/api/auth") || (res.status() >= 300 && res.status() < 400)) {
      console.log(`[${res.status()}] ${res.url()}`);
    }
  });

  await page.goto(BASE_URL + "/admin/login", { waitUntil: "commit", timeout: 30000 });
  await page.waitForTimeout(2000);
  console.log(`[page loaded] ${page.url()}`);

  await page.fill('input[type="email"]', "cb@webhouse.dk");
  await page.fill('input[type="password"]', "NewAmaliesbh2711!");
  await page.click('button[type="submit"]');

  await page.waitForTimeout(8000);
  console.log(`[final URL] ${page.url()}`);

  expect(page.url()).not.toContain("/admin/login");
  await expect(page.locator("text=Content Overview")).toBeVisible({ timeout: 10000 });
});
