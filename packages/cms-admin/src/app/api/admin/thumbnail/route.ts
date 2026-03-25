import { NextRequest, NextResponse } from "next/server";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";
import { getActiveSitePaths } from "@/lib/site-paths";
import { createHash } from "node:crypto";

/**
 * GET /api/admin/thumbnail?url=<encoded-url>&key=<updatedAt>
 *
 * Returns a cached PNG screenshot of the given URL.
 * Cache key is md5(url) + key (typically document updatedAt).
 * If cache is fresh, returns the cached image. Otherwise captures a new screenshot.
 *
 * Uses Playwright for headless screenshot capture (already a dev dependency).
 */

function getCacheDir() {
  // Use site's _data/.cache/thumbnails/ directory
  const dataDir = process.env.DATA_DIR ?? path.join(process.cwd(), "_data");
  const cacheDir = path.join(dataDir, ".cache", "thumbnails");
  if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
  return cacheDir;
}

function getCachePath(url: string) {
  const hash = createHash("md5").update(url).digest("hex");
  return path.join(getCacheDir(), `${hash}.png`);
}

function getKeyPath(url: string) {
  const hash = createHash("md5").update(url).digest("hex");
  return path.join(getCacheDir(), `${hash}.key`);
}

// Keep a single browser instance alive for the process lifetime
let browserPromise: Promise<any> | null = null;

async function getBrowser() {
  if (browserPromise) return browserPromise;
  browserPromise = (async () => {
    try {
      const pw = await import("playwright");
      return await pw.chromium.launch({ headless: true });
    } catch {
      // Playwright not available at runtime
      return null;
    }
  })();
  return browserPromise;
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  const key = req.nextUrl.searchParams.get("key") ?? "";

  if (!url) {
    return NextResponse.json({ error: "url parameter required" }, { status: 400 });
  }

  const cachePath = getCachePath(url);
  const keyPath = getKeyPath(url);

  // Check cache
  if (existsSync(cachePath) && existsSync(keyPath)) {
    const cachedKey = readFileSync(keyPath, "utf-8").trim();
    if (cachedKey === key) {
      const png = readFileSync(cachePath);
      return new NextResponse(png, {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }
  }

  // Capture new screenshot
  const browser = await getBrowser();
  if (!browser) {
    // Playwright not available — return a 1x1 transparent PNG as fallback
    return new NextResponse(null, { status: 204 });
  }

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "load", timeout: 10000 });
    // Wait a bit for JS rendering (dark mode, fonts, etc.)
    await page.waitForTimeout(1500);
    const screenshot = await page.screenshot({ type: "png" });
    await context.close();

    // Save to cache
    writeFileSync(cachePath, screenshot);
    writeFileSync(keyPath, key);

    return new NextResponse(screenshot, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    console.error("Thumbnail capture failed:", err);
    return new NextResponse(null, { status: 204 });
  }
}
