import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { platform } from "node:os";
import { getServerTSafe } from "@/i18n/server";

const execFileAsync = promisify(execFile);

/**
 * POST /api/cms/folder-picker
 *
 * Opens a native folder picker dialog on macOS via osascript.
 * Returns { path: string } or { cancelled: true }.
 * Returns { unsupported: true } on non-macOS platforms.
 */
export async function POST() {
  const t = await getServerTSafe();
  if (platform() !== "darwin") {
    return NextResponse.json({ unsupported: true, error: t("errCms.folderPicker.macOnly") });
  }

  try {
    const { stdout } = await execFileAsync("osascript", [
      "-e",
      `set chosenFolder to choose folder with prompt "${t("errCms.folderPicker.prompt").replace(/["\\]/g, "")}"`, // i18n-ignore: AppleScript command; the prompt text itself is translated
      "-e",
      'return POSIX path of chosenFolder', // i18n-ignore: AppleScript command
    ], { timeout: 60000 });

    const folderPath = stdout.trim().replace(/\/$/, "");
    if (!folderPath) {
      return NextResponse.json({ cancelled: true });
    }

    return NextResponse.json({ path: folderPath });
  } catch (err) {
    // User cancelled the dialog
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("User canceled") || msg.includes("-128")) {
      return NextResponse.json({ cancelled: true });
    }
    return NextResponse.json({ error: t("errCms.folderPicker.failed") }, { status: 500 });
  }
}

/**
 * GET /api/cms/folder-picker
 *
 * Returns platform info so the client knows whether to show the Browse button.
 */
export async function GET() {
  return NextResponse.json({ platform: platform() });
}
