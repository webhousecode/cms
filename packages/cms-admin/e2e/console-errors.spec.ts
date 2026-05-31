import { test, expect } from "@playwright/test";
import { SignJWT } from "jose";

const JWT_SECRET = process.env.CMS_JWT_SECRET ?? process.env.JWT_SECRET ?? "";

test.beforeEach(async ({ context }) => {
  const secret = new TextEncoder().encode(JWT_SECRET);
  const token = await new SignJWT({ sub: "test", email: "test@test.com", name: "Test" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(secret);
  await context.addCookies([{ name: "cms-session", value: token, domain: "localhost", path: "/" }]);
});

test("no console errors on agent pages", async ({ page }) => {
  const errors: string[] = [];
  const failedRequests: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(msg.text());
    }
  });
  page.on("response", (res) => {
    if (res.status() === 404) {
      failedRequests.push(`404: ${res.url()}`);
    }
  });

  // Navigate through several pages
  await page.goto("/admin/agents");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);

  // Click into first agent
  const agentLink = page.locator('a[href*="/admin/agents/"]:not([href$="/new"])').first();
  if (await agentLink.isVisible()) {
    await agentLink.click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
  }

  // Navigate to curation
  await page.goto("/admin/curation");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);

  // Filter out known non-critical errors
  const critical = errors.filter(
    (e) =>
      !e.includes("Download the React DevTools") &&
      !e.includes("Initialization failed") &&
      !e.includes("chrome-extension://")
  );

  console.log("Console errors found:", critical.length);
  critical.forEach((e) => console.log("  ERROR:", e.substring(0, 200)));
  console.log("404 requests:", failedRequests.length);
  failedRequests.forEach((r) => console.log("  ", r));

  expect(critical).toHaveLength(0);
});
