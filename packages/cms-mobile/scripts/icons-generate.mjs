#!/usr/bin/env node
/**
 * webhouse.app icon generator — Concept A (eye on dark).
 *
 * Renders the brand eye SVG onto a #0D0D0D square at all sizes required by
 * iOS and Android. Uses `sharp` (already in the workspace root deps).
 *
 * Outputs:
 *   ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png   (1024)
 *   android/app/src/main/res/mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher.png
 *   android/app/src/main/res/mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher_round.png
 *   android/app/src/main/res/mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher_foreground.png
 *
 * Re-run with `pnpm icons:generate` whenever the source SVG changes.
 */

import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const PKG = path.resolve(__dirname, "..");

const SOURCE_SVG = path.join(REPO_ROOT, "logo", "webhouse.app-dark-icon.svg");
const BG = "#0D0D0D";

const IOS_ICON_PATH = path.join(
  PKG,
  "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png",
);

// Android mipmap densities (px per side for the launcher icon)
const ANDROID_LAUNCHER = [
  { dir: "mipmap-mdpi", size: 48 },
  { dir: "mipmap-hdpi", size: 72 },
  { dir: "mipmap-xhdpi", size: 96 },
  { dir: "mipmap-xxhdpi", size: 144 },
  { dir: "mipmap-xxxhdpi", size: 192 },
];

// Adaptive icon foreground layers are 108dp at the same densities
// (Android composes them onto a separate background layer at runtime).
const ANDROID_FOREGROUND = [
  { dir: "mipmap-mdpi", size: 108 },
  { dir: "mipmap-hdpi", size: 162 },
  { dir: "mipmap-xhdpi", size: 216 },
  { dir: "mipmap-xxhdpi", size: 324 },
  { dir: "mipmap-xxxhdpi", size: 432 },
];

const ANDROID_RES = path.join(PKG, "android/app/src/main/res");

/**
 * Render the eye SVG centered on a solid #0D0D0D square at the requested
 * size. The eye fills ~72% of the canvas — leaves visual breathing room
 * matching Apple HIG icon guidance.
 */
async function renderIcon(outPath, size) {
  const eyeSize = Math.round(size * 0.72);
  const padding = Math.round((size - eyeSize) / 2);

  const eyeBuffer = await sharp(SOURCE_SVG, {
    density: 600, // high DPI rasterization for crisp edges
  })
    .resize(eyeSize, eyeSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const background = sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BG,
    },
  });

  await background
    .composite([{ input: eyeBuffer, top: padding, left: padding }])
    .png({ compressionLevel: 9 })
    .toFile(outPath);

  console.log(`  ✓ ${path.relative(PKG, outPath)} (${size}x${size})`);
}

/**
 * Adaptive icon foreground = transparent background + eye centered.
 * Android applies the background and rounding at the system level.
 */
async function renderForeground(outPath, size) {
  const eyeSize = Math.round(size * 0.55);
  const padding = Math.round((size - eyeSize) / 2);

  const eyeBuffer = await sharp(SOURCE_SVG, { density: 600 })
    .resize(eyeSize, eyeSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const transparent = sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  });

  await transparent
    .composite([{ input: eyeBuffer, top: padding, left: padding }])
    .png({ compressionLevel: 9 })
    .toFile(outPath);

  console.log(`  ✓ ${path.relative(PKG, outPath)} (${size}x${size})`);
}

async function main() {
  console.log("\n📱 webhouse.app — generating icons (Concept A: eye on dark)\n");

  // Verify source exists
  try {
    await fs.access(SOURCE_SVG);
  } catch {
    console.error(`✗ Source not found: ${SOURCE_SVG}`);
    process.exit(1);
  }

  // ─── iOS ─────────────────────────────────────────────
  console.log("iOS:");
  await fs.mkdir(path.dirname(IOS_ICON_PATH), { recursive: true });
  await renderIcon(IOS_ICON_PATH, 1024);

  // ─── Android launcher (square) ───────────────────────
  console.log("\nAndroid launcher (square):");
  for (const { dir, size } of ANDROID_LAUNCHER) {
    const out = path.join(ANDROID_RES, dir, "ic_launcher.png");
    await fs.mkdir(path.dirname(out), { recursive: true });
    await renderIcon(out, size);
  }

  // ─── Android launcher (round) ────────────────────────
  console.log("\nAndroid launcher (round):");
  for (const { dir, size } of ANDROID_LAUNCHER) {
    const out = path.join(ANDROID_RES, dir, "ic_launcher_round.png");
    await renderIcon(out, size);
  }

  // ─── Android adaptive foreground ─────────────────────
  console.log("\nAndroid adaptive foreground:");
  for (const { dir, size } of ANDROID_FOREGROUND) {
    const out = path.join(ANDROID_RES, dir, "ic_launcher_foreground.png");
    await renderForeground(out, size);
  }

  console.log("\n✅ All icons generated.\n");
}

main().catch((err) => {
  console.error("\n✗ Icon generation failed:", err);
  process.exit(1);
});
