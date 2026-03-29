/**
 * F63 Component Audit — Visual screenshot + crop + SVG generator
 *
 * 1. Takes full-page Playwright screenshots of key admin surfaces
 * 2. Crops specific component areas with Sharp
 * 3. Generates a large SVG document with numbered, labeled crops
 */
import { chromium } from "playwright";
import sharp from "sharp";
import fs from "fs";
import path from "path";

const BASE = "http://localhost:3010";
const OUT = path.join(process.cwd(), "docs/f63-audit");
const CROPS_DIR = path.join(OUT, "crops");
const DEV_TOKEN = "6b2bd97c4d457e83ec5eb000439e3f083c9dacac39e4ef18b2dd9ab8cdd21610";

// Sites/orgs to visit for variety
const CONTEXTS = [
  { org: "examples", site: "freelancer", label: "Freelancer" },
  { org: "webhouse", site: "webhouse-site", label: "WebHouse" },
];

interface CropDef {
  id: number;
  name: string;
  category: string;
  page: string;
  screenshot: string;
  region: { left: number; top: number; width: number; height: number };
}

async function main() {
  fs.mkdirSync(CROPS_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    storageState: undefined,
  });

  // Login
  const loginPage = await context.newPage();
  await loginPage.goto(`${BASE}/api/auth/callback/credentials?token=${DEV_TOKEN}`, { waitUntil: "networkidle" });
  await loginPage.close();

  const page = await context.newPage();

  // Set cookies for site context
  async function switchSite(org: string, site: string) {
    await context.addCookies([
      { name: "cms-active-org", value: org, domain: "localhost", path: "/" },
      { name: "cms-active-site", value: site, domain: "localhost", path: "/" },
    ]);
  }

  const screenshots: Record<string, string> = {};
  const crops: CropDef[] = [];
  let cropId = 1;

  // Helper: take screenshot
  async function takeScreenshot(name: string, url: string, opts?: { fullPage?: boolean; waitFor?: string; delay?: number }) {
    console.log(`  📸 ${name}: ${url}`);
    await page.goto(url, { waitUntil: "networkidle", timeout: 15000 }).catch(() => {});
    if (opts?.waitFor) await page.waitForSelector(opts.waitFor, { timeout: 5000 }).catch(() => {});
    if (opts?.delay) await page.waitForTimeout(opts.delay);
    const filePath = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: filePath, fullPage: opts?.fullPage ?? true });
    screenshots[name] = filePath;
    return filePath;
  }

  // Helper: crop region
  async function crop(def: Omit<CropDef, "id">): Promise<CropDef> {
    const entry: CropDef = { ...def, id: cropId++ };
    const srcPath = screenshots[def.screenshot];
    if (!srcPath || !fs.existsSync(srcPath)) {
      console.warn(`  ⚠️  Missing screenshot: ${def.screenshot}`);
      return entry;
    }
    const outPath = path.join(CROPS_DIR, `${String(entry.id).padStart(2, "0")}-${def.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`);
    try {
      const meta = await sharp(srcPath).metadata();
      const r = def.region;
      // Clamp to image bounds
      const left = Math.min(r.left, (meta.width ?? 1440) - 1);
      const top = Math.min(r.top, (meta.height ?? 900) - 1);
      const width = Math.min(r.width, (meta.width ?? 1440) - left);
      const height = Math.min(r.height, (meta.height ?? 900) - top);
      await sharp(srcPath).extract({ left, top, width, height }).toFile(outPath);
      entry.screenshot = outPath;
    } catch (err) {
      console.warn(`  ⚠️  Crop failed for ${def.name}:`, err);
    }
    crops.push(entry);
    return entry;
  }

  // ═══════════════════════════════════════════════════════════
  // PHASE 1: Take all screenshots
  // ═══════════════════════════════════════════════════════════
  console.log("\n🔍 Phase 1: Screenshots\n");

  // Freelancer context
  await switchSite("examples", "freelancer");

  await takeScreenshot("01-collection-list", `${BASE}/admin/content/services`, { delay: 1500 });
  await takeScreenshot("02-document-editor", `${BASE}/admin/content/services/starter-package`, { delay: 1500 });
  await takeScreenshot("03-pages-editor", `${BASE}/admin/content/pages/home`, { delay: 1500 });
  await takeScreenshot("04-settings-general", `${BASE}/admin/settings?tab=general`, { delay: 1500 });
  await takeScreenshot("05-settings-tools", `${BASE}/admin/settings?tab=tools`, { delay: 1500 });
  await takeScreenshot("06-settings-ai", `${BASE}/admin/settings?tab=ai`, { delay: 1500 });
  await takeScreenshot("07-settings-deploy", `${BASE}/admin/settings?tab=deploy`, { delay: 1500 });
  await takeScreenshot("08-settings-team", `${BASE}/admin/settings?tab=team`, { delay: 1500 });
  await takeScreenshot("09-media", `${BASE}/admin/media`, { delay: 2000 });
  await takeScreenshot("10-calendar", `${BASE}/admin/calendar`, { delay: 1500 });
  await takeScreenshot("11-sites", `${BASE}/admin/sites`, { delay: 1500 });
  await takeScreenshot("12-seo", `${BASE}/admin/seo`, { delay: 1500 });

  // WebHouse context (for more variety — chat, agents, etc.)
  await switchSite("webhouse", "webhouse-site");
  await takeScreenshot("13-agents", `${BASE}/admin/agents`, { delay: 1500 });
  await takeScreenshot("14-chat", `${BASE}/admin/chat`, { delay: 2000 });
  await takeScreenshot("15-analytics", `${BASE}/admin/analytics`, { delay: 1500 });
  await takeScreenshot("16-tools-linkchecker", `${BASE}/admin/tools`, { delay: 1500 });
  await takeScreenshot("17-settings-mcp", `${BASE}/admin/settings?tab=mcp`, { delay: 1500 });
  await takeScreenshot("18-settings-email", `${BASE}/admin/settings?tab=email`, { delay: 1500 });

  // ═══════════════════════════════════════════════════════════
  // PHASE 2: Crop specific components
  // ═══════════════════════════════════════════════════════════
  console.log("\n✂️  Phase 2: Cropping components\n");

  // --- CARDS ---
  await crop({ name: "SettingsCard", category: "Cards", page: "Settings/General", screenshot: "04-settings-general", region: { left: 30, top: 120, width: 560, height: 250 } });
  await crop({ name: "SiteCard", category: "Cards", page: "Sites", screenshot: "11-sites", region: { left: 30, top: 80, width: 700, height: 300 } });

  // --- SECTION HEADERS ---
  await crop({ name: "SectionHeading-Backup", category: "Section Headers", page: "Settings/Tools", screenshot: "05-settings-tools", region: { left: 20, top: 80, width: 560, height: 60 } });
  await crop({ name: "SectionHeading-Deploy", category: "Section Headers", page: "Settings/Deploy", screenshot: "07-settings-deploy", region: { left: 20, top: 80, width: 560, height: 60 } });

  // --- LISTS ---
  await crop({ name: "CollectionList", category: "Lists", page: "Content/Services", screenshot: "01-collection-list", region: { left: 200, top: 80, width: 1200, height: 400 } });
  await crop({ name: "AgentsList", category: "Lists", page: "Agents", screenshot: "13-agents", region: { left: 200, top: 80, width: 1200, height: 400 } });

  // --- BUTTONS ---
  await crop({ name: "ActionBar", category: "Buttons", page: "Document Editor", screenshot: "02-document-editor", region: { left: 200, top: 40, width: 1200, height: 55 } });
  await crop({ name: "ActionBar-Pages", category: "Buttons", page: "Pages Editor", screenshot: "03-pages-editor", region: { left: 200, top: 40, width: 1200, height: 55 } });

  // --- INPUTS ---
  await crop({ name: "SettingsInput", category: "Inputs", page: "Settings/General", screenshot: "04-settings-general", region: { left: 30, top: 250, width: 560, height: 200 } });
  await crop({ name: "WebhookInput", category: "Inputs", page: "Settings/Tools", screenshot: "05-settings-tools", region: { left: 30, top: 180, width: 560, height: 120 } });

  // --- SELECTS ---
  await crop({ name: "CustomSelect-AI", category: "Selects", page: "Settings/AI", screenshot: "06-settings-ai", region: { left: 30, top: 120, width: 560, height: 250 } });

  // --- BADGES / TAGS ---
  await crop({ name: "StatusBadges", category: "Badges", page: "Content/Services", screenshot: "01-collection-list", region: { left: 800, top: 80, width: 400, height: 300 } });

  // --- SIDEBAR ---
  await crop({ name: "Sidebar-Nav", category: "Sidebar", page: "Content", screenshot: "01-collection-list", region: { left: 0, top: 0, width: 200, height: 900 } });

  // --- MEDIA ---
  await crop({ name: "MediaGrid", category: "Media", page: "Media Library", screenshot: "09-media", region: { left: 200, top: 80, width: 1200, height: 500 } });

  // --- EMPTY STATES ---
  await crop({ name: "Calendar-View", category: "Layout", page: "Calendar", screenshot: "10-calendar", region: { left: 200, top: 80, width: 1200, height: 500 } });
  await crop({ name: "SEO-Dashboard", category: "Layout", page: "SEO", screenshot: "12-seo", region: { left: 200, top: 80, width: 1200, height: 500 } });
  await crop({ name: "Analytics-Dashboard", category: "Layout", page: "Analytics", screenshot: "15-analytics", region: { left: 200, top: 80, width: 1200, height: 500 } });

  // --- CHAT ---
  await crop({ name: "Chat-Interface", category: "Chat", page: "Chat", screenshot: "14-chat", region: { left: 200, top: 0, width: 1200, height: 900 } });

  // --- TEAM ---
  await crop({ name: "TeamPanel", category: "Panels", page: "Settings/Team", screenshot: "08-settings-team", region: { left: 20, top: 80, width: 560, height: 400 } });

  // --- DEPLOY ---
  await crop({ name: "DeployPanel", category: "Panels", page: "Settings/Deploy", screenshot: "07-settings-deploy", region: { left: 20, top: 80, width: 560, height: 500 } });

  // --- MCP ---
  await crop({ name: "MCPSettings", category: "Panels", page: "Settings/MCP", screenshot: "17-settings-mcp", region: { left: 20, top: 80, width: 560, height: 400 } });

  await browser.close();

  // ═══════════════════════════════════════════════════════════
  // PHASE 3: Generate SVG
  // ═══════════════════════════════════════════════════════════
  console.log("\n🎨 Phase 3: Generating SVG\n");

  // Group crops by category
  const grouped: Record<string, CropDef[]> = {};
  for (const c of crops) {
    (grouped[c.category] ??= []).push(c);
  }

  const COL_WIDTH = 620;
  const PADDING = 30;
  const HEADER_HEIGHT = 60;
  const LABEL_HEIGHT = 40;
  const IMG_GAP = 20;
  const CATEGORY_GAP = 50;

  // Calculate layout
  let currentY = PADDING;
  const placements: { crop: CropDef; x: number; y: number; displayWidth: number; displayHeight: number }[] = [];

  for (const [category, items] of Object.entries(grouped)) {
    // Category header
    currentY += CATEGORY_GAP;
    const categoryY = currentY;
    currentY += HEADER_HEIGHT;

    let colX = PADDING;
    let rowMaxHeight = 0;

    for (const c of items) {
      // Read actual crop dimensions
      let imgW = c.region.width;
      let imgH = c.region.height;
      try {
        const cropPath = path.join(CROPS_DIR, `${String(c.id).padStart(2, "0")}-${c.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`);
        if (fs.existsSync(cropPath)) {
          const meta = await sharp(cropPath).metadata();
          imgW = meta.width ?? imgW;
          imgH = meta.height ?? imgH;
        }
      } catch {}

      // Scale to fit column
      const scale = Math.min(1, (COL_WIDTH - 20) / imgW);
      const displayWidth = Math.round(imgW * scale);
      const displayHeight = Math.round(imgH * scale);

      // New row if doesn't fit
      if (colX + displayWidth + PADDING > 1400) {
        colX = PADDING;
        currentY += rowMaxHeight + LABEL_HEIGHT + IMG_GAP;
        rowMaxHeight = 0;
      }

      placements.push({ crop: c, x: colX, y: currentY, displayWidth, displayHeight });
      rowMaxHeight = Math.max(rowMaxHeight, displayHeight);
      colX += displayWidth + IMG_GAP;
    }

    currentY += rowMaxHeight + LABEL_HEIGHT + IMG_GAP;
  }

  const SVG_WIDTH = 1440;
  const SVG_HEIGHT = currentY + PADDING;

  // Build SVG with embedded base64 images
  let svgParts: string[] = [];
  svgParts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  svgParts.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}">`);

  // Background
  svgParts.push(`<rect width="${SVG_WIDTH}" height="${SVG_HEIGHT}" fill="#0D0D0D"/>`);

  // Title
  svgParts.push(`<text x="${SVG_WIDTH / 2}" y="45" text-anchor="middle" font-family="system-ui, sans-serif" font-size="28" font-weight="700" fill="#F7BB2E">F63 Component Audit — Visual Reference</text>`);
  svgParts.push(`<text x="${SVG_WIDTH / 2}" y="72" text-anchor="middle" font-family="system-ui, sans-serif" font-size="14" fill="#888">webhouse.app CMS Admin · ${new Date().toISOString().slice(0, 10)}</text>`);

  // Category headers
  let lastCategory = "";
  for (const p of placements) {
    if (p.crop.category !== lastCategory) {
      lastCategory = p.crop.category;
      // Find the y of the first item in this category
      const catItems = placements.filter((pp) => pp.crop.category === lastCategory);
      const catY = (catItems[0]?.y ?? p.y) - HEADER_HEIGHT + 10;
      svgParts.push(`<text x="${PADDING}" y="${catY + 20}" font-family="system-ui, sans-serif" font-size="20" font-weight="700" fill="#F7BB2E" letter-spacing="0.05em">${lastCategory.toUpperCase()}</text>`);
      svgParts.push(`<line x1="${PADDING}" y1="${catY + 28}" x2="${SVG_WIDTH - PADDING}" y2="${catY + 28}" stroke="#333" stroke-width="1"/>`);
    }
  }

  // Images + labels
  for (const p of placements) {
    const cropFile = path.join(CROPS_DIR, `${String(p.crop.id).padStart(2, "0")}-${p.crop.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`);

    if (fs.existsSync(cropFile)) {
      const imgBuf = fs.readFileSync(cropFile);
      const b64 = imgBuf.toString("base64");

      // Border
      svgParts.push(`<rect x="${p.x - 2}" y="${p.y - 2}" width="${p.displayWidth + 4}" height="${p.displayHeight + 4}" rx="6" fill="none" stroke="#F7BB2E" stroke-width="1.5" opacity="0.6"/>`);

      // Image
      svgParts.push(`<image x="${p.x}" y="${p.y}" width="${p.displayWidth}" height="${p.displayHeight}" xlink:href="data:image/png;base64,${b64}" preserveAspectRatio="xMidYMid meet"/>`);

      // Number badge
      svgParts.push(`<circle cx="${p.x + 14}" cy="${p.y + 14}" r="14" fill="#F7BB2E"/>`);
      svgParts.push(`<text x="${p.x + 14}" y="${p.y + 19}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" font-weight="700" fill="#0D0D0D">${p.crop.id}</text>`);

      // Label
      svgParts.push(`<text x="${p.x}" y="${p.y + p.displayHeight + 16}" font-family="system-ui, sans-serif" font-size="12" font-weight="600" fill="#ccc">#${p.crop.id} ${p.crop.name}</text>`);
      svgParts.push(`<text x="${p.x}" y="${p.y + p.displayHeight + 30}" font-family="system-ui, sans-serif" font-size="10" fill="#666">${p.crop.page}</text>`);
    }
  }

  svgParts.push(`</svg>`);

  const svgPath = path.join(OUT, "f63-component-audit.svg");
  fs.writeFileSync(svgPath, svgParts.join("\n"));

  console.log(`\n✅ Done!`);
  console.log(`   Screenshots: ${Object.keys(screenshots).length}`);
  console.log(`   Crops: ${crops.length}`);
  console.log(`   SVG: ${svgPath}`);
  console.log(`   Size: ${(fs.statSync(svgPath).size / 1024 / 1024).toFixed(1)} MB`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
