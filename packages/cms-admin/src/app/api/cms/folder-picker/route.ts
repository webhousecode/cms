import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { platform } from "node:os";

const execFileAsync = promisify(execFile);

/**
 * POST /api/cms/folder-picker
 *
 * Opens a native folder picker dialog on macOS via osascript.
 * Returns { path: string } or { cancelled: true }.
 * Returns { unsupported: true } on non-macOS platforms.
 */
export async function POST() {
  if (platform() !== "darwin") {
    return NextResponse.json({ unsupported: true, error: "Folder picker only available on macOS" });
  }

  try {
    const { stdout } = await execFileAsync("osascript", [
      "-e",
      'set chosenFolder to choose folder with prompt "Select site folder containing cms.config.ts"',
      "-e",
      'return POSIX path of chosenFolder',
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
    return NextResponse.json({ error: "Folder picker failed" }, { status: 500 });
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
