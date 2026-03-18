import { test, expect } from "playwright/test";

const BASE_URL = process.env.TEST_URL || "https://webhouse-app.fly.dev";

test("debug login - trace every step", async ({ page, context }) => {
  // Log ALL requests/responses
  page.on("request", (req) => {
    console.log(`>> ${req.method()} ${req.url()}`);
  });
  page.on("response", (res) => {
    if (res.status() >= 300) {
      console.log(`<< ${res.status()} ${res.url()} → ${res.headers()["location"] ?? ""}`);
    }
  });
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.text().includes("cookie") || msg.text().includes("Cookie")) {
      console.log(`[console.${msg.type()}] ${msg.text()}`);
    }
  });

  // Step 1: Go to login
  console.log("\n=== STEP 1: Navigate to login ===");
  await page.goto(BASE_URL + "/admin/login", { waitUntil: "commit", timeout: 30000 });
  await page.waitForTimeout(3000);
  console.log(`URL after goto: ${page.url()}`);

  // Step 2: Check login form is visible
  console.log("\n=== STEP 2: Check form ===");
  const emailInput = page.locator('input[type="email"]');
  const isVisible = await emailInput.isVisible();
  console.log(`Email input visible: ${isVisible}`);
  if (!isVisible) {
    console.log(`Page content: ${await page.textContent("body")}`);
    return;
  }

  // Step 3: Fill and submit
  console.log("\n=== STEP 3: Fill and submit ===");
  await page.fill('input[type="email"]', "cb@webhouse.dk");
  await page.fill('input[type="password"]', "NewAmaliesbh2711!");
  await page.click('button[type="submit"]');

  // Step 4: Watch what happens
  console.log("\n=== STEP 4: Waiting 10s to observe ===");
  await page.waitForTimeout(10000);
  console.log(`\nFinal URL: ${page.url()}`);

  // Step 5: Check cookies
  const cookies = await context.cookies();
  console.log(`\n=== Cookies (${cookies.length}): ===`);
  for (const c of cookies) {
    console.log(`  ${c.name} = ${c.value.substring(0, 30)}... (domain: ${c.domain}, secure: ${c.secure}, httpOnly: ${c.httpOnly})`);
  }

  // Step 6: Check page content
  const bodyText = await page.textContent("body");
  if (bodyText?.includes("Content Overview")) {
    console.log("\n✅ Dashboard is showing!");
  } else if (bodyText?.includes("Sign in")) {
    console.log("\n❌ Still on login page!");
  } else {
    console.log(`\nPage content: ${bodyText?.substring(0, 200)}`);
  }

  expect(page.url()).not.toContain("/admin/login");
});
