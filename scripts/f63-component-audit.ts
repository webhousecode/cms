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
  // GENERATE PNG BILLBOARD with Sharp
  // ═══════════════════════════════════════════════════════════
  console.log("\n🎨 Generating PNG billboard\n");

  const grouped: Record<string, CropDef[]> = {};
  for (const c of crops) {
    (grouped[c.category] ??= []).push(c);
  }

  const CANVAS_W = 2400;
  const PAD = 50;
  const CAT_GAP = 80;
  const IMG_GAP = 30;
  const LABEL_H = 50;
  const HDR_H = 50;

  // Layout pass — calculate positions
  let currentY = 120; // after title
  const placements: { crop: CropDef; x: number; y: number; dw: number; dh: number; catHeaderY?: number }[] = [];

  for (const [category, items] of Object.entries(grouped)) {
    currentY += CAT_GAP;
    const catHeaderY = currentY;
    currentY += HDR_H;

    let rowX = PAD;
    let rowMaxH = 0;

    for (const c of items) {
      const maxW = 900;
      const scale = Math.min(1, maxW / c.width);
      const dw = Math.round(c.width * scale);
      const dh = Math.round(c.height * scale);

      if (rowX + dw + PAD > CANVAS_W && rowX > PAD) {
        currentY += rowMaxH + LABEL_H + IMG_GAP;
        rowX = PAD;
        rowMaxH = 0;
      }

      placements.push({ crop: c, x: rowX, y: currentY, dw, dh, catHeaderY: rowX === PAD && items[0] === c ? catHeaderY : undefined });
      rowMaxH = Math.max(rowMaxH, dh);
      rowX += dw + IMG_GAP;
    }
    currentY += rowMaxH + LABEL_H + IMG_GAP;
  }

  const CANVAS_H = currentY + PAD;

  // Create canvas
  const composites: sharp.OverlayOptions[] = [];

  // Render SVG text elements as overlays (Sharp supports SVG buffers)
  function svgText(text: string, opts: { fontSize: number; fill: string; fontWeight?: string; x?: number; y?: number; width?: number }): Buffer {
    const w = opts.width ?? CANVAS_W;
    const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    return Buffer.from(`<svg width="${w}" height="${opts.fontSize + 10}"><text x="${opts.x ?? 0}" y="${opts.fontSize}" font-family="Helvetica, Arial, sans-serif" font-size="${opts.fontSize}" font-weight="${opts.fontWeight ?? 'normal'}" fill="${opts.fill}">${esc}</text></svg>`);
  }

  // Title
  composites.push({ input: svgText("F63 Component Audit — Visual Reference", { fontSize: 36, fill: "#F7BB2E", fontWeight: "bold", width: CANVAS_W }), left: CANVAS_W / 2 - 450, top: 30 });
  composites.push({ input: svgText(`webhouse.app CMS Admin · ${new Date().toISOString().slice(0, 10)} · ${crops.length} components`, { fontSize: 18, fill: "#888" }), left: CANVAS_W / 2 - 300, top: 75 });

  // Category headers
  const drawnCats = new Set<string>();
  for (const p of placements) {
    if (p.catHeaderY !== undefined && !drawnCats.has(p.crop.category)) {
      drawnCats.add(p.crop.category);
      composites.push({ input: svgText(p.crop.category.toUpperCase(), { fontSize: 22, fill: "#F7BB2E", fontWeight: "bold" }), left: PAD, top: p.catHeaderY });
      // Separator line
      const lineH = 2;
      composites.push({
        input: await sharp({ create: { width: CANVAS_W - PAD * 2, height: lineH, channels: 4, background: { r: 51, g: 51, b: 51, alpha: 255 } } }).png().toBuffer(),
        left: PAD, top: p.catHeaderY + 30,
      });
    }
  }

  // Images + labels + number badges
  for (const p of placements) {
    const cropFile = path.join(CROPS_DIR, p.crop.file);
    if (!fs.existsSync(cropFile)) continue;

    // Resize crop to display size
    const resized = await sharp(cropFile).resize(p.dw, p.dh, { fit: "inside" }).png().toBuffer();
    composites.push({ input: resized, left: p.x, top: p.y });

    // Gold border (4px)
    const borderW = p.dw + 6;
    const borderH = p.dh + 6;
    const borderSvg = Buffer.from(`<svg width="${borderW}" height="${borderH}"><rect x="1" y="1" width="${borderW - 2}" height="${borderH - 2}" rx="4" fill="none" stroke="#F7BB2E" stroke-width="2" opacity="0.6"/></svg>`);
    composites.push({ input: borderSvg, left: p.x - 3, top: p.y - 3 });

    // Number badge
    const badgeSize = 28;
    const badgeSvg = Buffer.from(`<svg width="${badgeSize}" height="${badgeSize}"><circle cx="${badgeSize / 2}" cy="${badgeSize / 2}" r="${badgeSize / 2}" fill="#F7BB2E"/><text x="${badgeSize / 2}" y="${badgeSize / 2 + 5}" text-anchor="middle" font-family="Helvetica" font-size="14" font-weight="bold" fill="#0D0D0D">${p.crop.id}</text></svg>`);
    composites.push({ input: badgeSvg, left: p.x + 4, top: p.y + 4 });

    // Label
    composites.push({ input: svgText(`#${p.crop.id} ${p.crop.name}`, { fontSize: 14, fill: "#cccccc", fontWeight: "600" }), left: p.x, top: p.y + p.dh + 6 });
    composites.push({ input: svgText(p.crop.page, { fontSize: 11, fill: "#666666" }), left: p.x, top: p.y + p.dh + 24 });
  }

  // Compose final image
  const outPath = path.join(OUT, "f63-component-audit.png");
  await sharp({ create: { width: CANVAS_W, height: CANVAS_H, channels: 4, background: { r: 13, g: 13, b: 13, alpha: 255 } } })
    .composite(composites)
    .png({ quality: 90 })
    .toFile(outPath);

  const stat = fs.statSync(outPath);
  console.log(`✅ Done!`);
  console.log(`   Full screenshots: ${fs.readdirSync(OUT).filter((f) => f.match(/^\d+-.*\.png$/)).length}`);
  console.log(`   Component crops: ${crops.length}`);
  console.log(`   Billboard: ${outPath}`);
  console.log(`   Size: ${(stat.size / 1024 / 1024).toFixed(1)} MB`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
