/**
 * F63 Component Audit — Visual screenshot + SVG generator
 *
 * Uses data-testid selectors (F80) to capture precise element screenshots.
 * Generates a large SVG with linked PNGs, numbered and labeled.
 */
import { chromium, type Page, type Locator } from "playwright";
import sharp from "sharp";
import fs from "fs";
import path from "path";

const BASE = "http://localhost:3010";
const OUT = path.join(process.cwd(), "docs/f63-audit");
const CROPS_DIR = path.join(OUT, "crops");

interface CropDef {
  id: number;
  name: string;
  category: string;
  page: string;
  file: string;
  width: number;
  height: number;
}

async function main() {
  fs.mkdirSync(CROPS_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: "dark",
  });

  // Login via API
  const page = await context.newPage();
  console.log("  🔑 Logging in via API...");
  const loginRes = await page.request.post(`${BASE}/api/auth/login`, {
    data: { email: "cb@webhouse.dk", password: "NewAmaliesbh2711!" },
  });
  if (!loginRes.ok()) throw new Error(`Login failed: ${loginRes.status()}`);
  console.log("  ✅ Logged in");

  async function switchSite(org: string, site: string) {
    await context.addCookies([
      { name: "cms-active-org", value: org, domain: "localhost", path: "/" },
      { name: "cms-active-site", value: site, domain: "localhost", path: "/" },
    ]);
    // Navigate to admin root so server picks up the new cookies
    await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(2000);
    console.log(`  🔄 Switched to ${org}/${site} — at: ${page.url()}`);
  }

  const crops: CropDef[] = [];
  let cropId = 1;

  // Navigate and wait for content
  async function go(url: string, waitMs = 2000) {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(waitMs);
  }

  // Take full-page screenshot
  async function fullScreenshot(name: string) {
    const filePath = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: filePath, fullPage: true });
    return filePath;
  }

  // Capture a specific element by data-testid
  async function captureTestId(testId: string, name: string, category: string, pageName: string): Promise<CropDef | null> {
    const loc = page.locator(`[data-testid="${testId}"]`).first();
    try {
      await loc.waitFor({ state: "visible", timeout: 3000 });
    } catch {
      console.warn(`    ⚠️  ${testId} not visible on ${pageName}`);
      return null;
    }
    const file = `${String(cropId).padStart(2, "0")}-${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;
    const filePath = path.join(CROPS_DIR, file);
    await loc.screenshot({ path: filePath });
    const meta = await sharp(filePath).metadata();
    const entry: CropDef = { id: cropId++, name, category, page: pageName, file, width: meta.width ?? 300, height: meta.height ?? 100 };
    crops.push(entry);
    console.log(`    ✂️  #${entry.id} ${name} (${meta.width}x${meta.height})`);
    return entry;
  }

  // Capture by CSS selector (for elements without testid)
  async function captureSelector(selector: string, name: string, category: string, pageName: string): Promise<CropDef | null> {
    const loc = page.locator(selector).first();
    try {
      await loc.waitFor({ state: "visible", timeout: 3000 });
    } catch {
      console.warn(`    ⚠️  ${selector} not visible on ${pageName}`);
      return null;
    }
    const file = `${String(cropId).padStart(2, "0")}-${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;
    const filePath = path.join(CROPS_DIR, file);
    await loc.screenshot({ path: filePath });
    const meta = await sharp(filePath).metadata();
    const entry: CropDef = { id: cropId++, name, category, page: pageName, file, width: meta.width ?? 300, height: meta.height ?? 100 };
    crops.push(entry);
    console.log(`    ✂️  #${entry.id} ${name} (${meta.width}x${meta.height})`);
    return entry;
  }

  // ═══════════════════════════════════════════════════════════
  // SCREENSHOTS — Freelancer site
  // ═══════════════════════════════════════════════════════════
  console.log("\n🔍 Freelancer site\n");
  await switchSite("examples", "freelancer");

  // --- SIDEBAR ---
  console.log("  📍 Sidebar");
  await go(`${BASE}/admin/services`);
  await fullScreenshot("01-collection-list");
  await captureTestId("sidebar", "Sidebar", "Navigation", "Content/Services");

  // --- COLLECTION LIST ---
  console.log("  📍 Collection list");
  await captureTestId("collection-list-services", "CollectionList-Services", "Lists", "Content/Services");
  await captureTestId("collection-item-starter-package", "CollectionItem", "Lists", "Content/Services");

  // --- DOCUMENT EDITOR ---
  console.log("  📍 Document editor");
  await go(`${BASE}/admin/services/starter-package`);
  await fullScreenshot("02-document-editor");
  await captureTestId("document-editor", "DocumentEditor", "Editors", "Services/starter-package");
  await captureTestId("action-bar", "ActionBar", "Buttons", "Services/starter-package");
  await captureTestId("btn-save", "BtnSave", "Buttons", "Services/starter-package");

  // --- FIELD TYPES ---
  console.log("  📍 Field types");
  await captureTestId("field-text-title", "Field-Text", "Fields", "Services/starter-package");
  await captureTestId("field-textarea-description", "Field-Textarea", "Fields", "Services/starter-package");
  await captureTestId("field-boolean-popular", "Field-Boolean", "Fields", "Services/starter-package");
  await captureTestId("field-text-price", "Field-Text-Short", "Fields", "Services/starter-package");

  // Pages editor — more field types
  await go(`${BASE}/admin/pages/home`);
  await fullScreenshot("03-pages-editor");
  await captureTestId("field-text-title", "Field-Text-Title", "Fields", "Pages/home");
  await captureTestId("field-textarea-heroTagline", "Field-Textarea-Long", "Fields", "Pages/home");

  // Posts — richtext + date + image
  await go(`${BASE}/admin/posts/building-a-data-driven-culture`);
  await fullScreenshot("04-post-editor");
  await captureTestId("field-richtext-content", "Field-Richtext", "Fields", "Posts/building-data");
  await captureTestId("field-date-date", "Field-Date", "Fields", "Posts/building-data");
  await captureTestId("field-image-coverImage", "Field-Image", "Fields", "Posts/building-data");

  // --- SETTINGS ---
  console.log("  📍 Settings");
  await go(`${BASE}/admin/settings?tab=general`);
  await fullScreenshot("05-settings-general");
  await captureTestId("panel-general", "Panel-General", "Settings", "Settings/General");

  await go(`${BASE}/admin/settings?tab=tools`);
  await fullScreenshot("06-settings-tools");
  await captureTestId("panel-tools", "Panel-Tools", "Settings", "Settings/Tools");

  await go(`${BASE}/admin/settings?tab=ai`);
  await fullScreenshot("07-settings-ai");
  await captureTestId("panel-ai", "Panel-AI", "Settings", "Settings/AI");

  await go(`${BASE}/admin/settings?tab=deploy`);
  await fullScreenshot("08-settings-deploy");
  await captureTestId("panel-deploy", "Panel-Deploy", "Settings", "Settings/Deploy");

  await go(`${BASE}/admin/settings?tab=team`);
  await fullScreenshot("09-settings-team");
  await captureTestId("panel-team", "Panel-Team", "Settings", "Settings/Team");

  await go(`${BASE}/admin/settings?tab=mcp`);
  await fullScreenshot("10-settings-mcp");
  await captureTestId("panel-mcp", "Panel-MCP", "Settings", "Settings/MCP");

  await go(`${BASE}/admin/settings?tab=email`);
  await fullScreenshot("11-settings-email");
  await captureTestId("panel-email", "Panel-Email", "Settings", "Settings/Email");

  // --- MEDIA ---
  console.log("  📍 Media");
  await go(`${BASE}/admin/media`, 2500);
  await fullScreenshot("12-media");
  await captureTestId("media-library", "MediaLibrary", "Media", "Media");

  // --- SITES ---
  console.log("  📍 Sites");
  await go(`${BASE}/admin/sites`);
  await fullScreenshot("13-sites");
  await captureTestId("site-card-freelancer", "SiteCard-Freelancer", "Cards", "Sites");

  // --- MISC PAGES ---
  console.log("  📍 Other pages");
  await go(`${BASE}/admin/calendar`);
  await fullScreenshot("14-calendar");
  await go(`${BASE}/admin/seo`);
  await fullScreenshot("15-seo");

  // --- WEBHOUSE SITE (for agents, chat, analytics) ---
  console.log("\n🔍 WebHouse site\n");
  await switchSite("webhouse", "webhouse-site");

  await go(`${BASE}/admin/agents`);
  await fullScreenshot("16-agents");

  await go(`${BASE}/admin/chat`, 3000);
  await fullScreenshot("17-chat");

  await go(`${BASE}/admin/analytics`);
  await fullScreenshot("18-analytics");

  await go(`${BASE}/admin/tools`);
  await fullScreenshot("19-tools");

  // --- SWITCHERS ---
  console.log("  📍 Switchers");
  await captureTestId("site-switcher", "SiteSwitcher", "Navigation", "Tools");
  await captureTestId("org-switcher", "OrgSwitcher", "Navigation", "Tools");

  // --- CREATE BUTTON ---
  await go(`${BASE}/admin/posts`);
  await captureTestId("btn-create", "BtnCreate", "Buttons", "Content/Posts");

  await browser.close();

  // ═══════════════════════════════════════════════════════════
  // GENERATE SVG
  // ═══════════════════════════════════════════════════════════
  console.log("\n🎨 Generating SVG\n");

  // Group crops by category
  const grouped: Record<string, CropDef[]> = {};
  for (const c of crops) {
    (grouped[c.category] ??= []).push(c);
  }

  const COL_MAX = 1380;
  const PAD = 30;
  const CAT_GAP = 60;
  const IMG_GAP = 20;
  const LABEL_H = 36;

  // Layout calculation
  let currentY = 90; // after title
  const placements: { crop: CropDef; x: number; y: number; dw: number; dh: number }[] = [];

  for (const [category, items] of Object.entries(grouped)) {
    currentY += CAT_GAP;
    const catY = currentY;
    currentY += 35; // header height

    let rowX = PAD;
    let rowMaxH = 0;

    for (const c of items) {
      // Scale to max 600px wide
      const scale = Math.min(1, 600 / c.width);
      const dw = Math.round(c.width * scale);
      const dh = Math.round(c.height * scale);

      // New row?
      if (rowX + dw + PAD > COL_MAX && rowX > PAD) {
        currentY += rowMaxH + LABEL_H + IMG_GAP;
        rowX = PAD;
        rowMaxH = 0;
      }

      placements.push({ crop: c, x: rowX, y: currentY, dw, dh });
      rowMaxH = Math.max(rowMaxH, dh);
      rowX += dw + IMG_GAP;
    }
    currentY += rowMaxH + LABEL_H + IMG_GAP;
  }

  const SVG_W = 1440;
  const SVG_H = currentY + PAD;

  const svg: string[] = [];
  svg.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  svg.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${SVG_W}" height="${SVG_H}" viewBox="0 0 ${SVG_W} ${SVG_H}">`);
  svg.push(`<rect width="${SVG_W}" height="${SVG_H}" fill="#0D0D0D"/>`);

  // Title
  svg.push(`<text x="${SVG_W / 2}" y="40" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="28" font-weight="700" fill="#F7BB2E">F63 Component Audit — Visual Reference</text>`);
  svg.push(`<text x="${SVG_W / 2}" y="65" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="#888">webhouse.app CMS Admin · ${new Date().toISOString().slice(0, 10)} · ${crops.length} components</text>`);

  // Category headers + images
  let lastCat = "";
  for (const p of placements) {
    // Category header
    if (p.crop.category !== lastCat) {
      lastCat = p.crop.category;
      const firstInCat = placements.find((pp) => pp.crop.category === lastCat)!;
      const hdrY = firstInCat.y - 25;
      svg.push(`<text x="${PAD}" y="${hdrY}" font-family="Helvetica, Arial, sans-serif" font-size="18" font-weight="700" fill="#F7BB2E" letter-spacing="0.06em">${lastCat.toUpperCase()}</text>`);
      svg.push(`<line x1="${PAD}" y1="${hdrY + 6}" x2="${SVG_W - PAD}" y2="${hdrY + 6}" stroke="#333" stroke-width="1"/>`);
    }

    const cropFile = path.join(CROPS_DIR, p.crop.file);
    if (!fs.existsSync(cropFile)) continue;

    // Gold border
    svg.push(`<rect x="${p.x - 2}" y="${p.y - 2}" width="${p.dw + 4}" height="${p.dh + 4}" rx="4" fill="none" stroke="#F7BB2E" stroke-width="1.5" opacity="0.5"/>`);
    // Linked image
    svg.push(`<image x="${p.x}" y="${p.y}" width="${p.dw}" height="${p.dh}" xlink:href="crops/${p.crop.file}" preserveAspectRatio="xMidYMid meet"/>`);
    // Number badge
    svg.push(`<circle cx="${p.x + 12}" cy="${p.y + 12}" r="12" fill="#F7BB2E"/>`);
    svg.push(`<text x="${p.x + 12}" y="${p.y + 16}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="11" font-weight="700" fill="#0D0D0D">${p.crop.id}</text>`);
    // Label
    svg.push(`<text x="${p.x}" y="${p.y + p.dh + 14}" font-family="Helvetica, Arial, sans-serif" font-size="11" font-weight="600" fill="#ccc">#${p.crop.id} ${p.crop.name}</text>`);
    svg.push(`<text x="${p.x}" y="${p.y + p.dh + 26}" font-family="Helvetica, Arial, sans-serif" font-size="9" fill="#666">${p.crop.page}</text>`);
  }

  svg.push(`</svg>`);

  const svgPath = path.join(OUT, "f63-component-audit.svg");
  fs.writeFileSync(svgPath, svg.join("\n"));

  console.log(`✅ Done!`);
  console.log(`   Full screenshots: ${fs.readdirSync(OUT).filter((f) => f.endsWith(".png")).length}`);
  console.log(`   Component crops: ${crops.length}`);
  console.log(`   SVG: ${svgPath}`);
  console.log(`   SVG size: ${(fs.statSync(svgPath).size / 1024).toFixed(0)} KB`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
