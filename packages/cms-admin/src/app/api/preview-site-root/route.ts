import { NextRequest, NextResponse } from "next/server";
import { getActiveSitePaths } from "@/lib/site-paths";
import { readFile } from "fs/promises";
import path from "path";

/**
 * Serve dist/index.html for the root path of the preview site.
 */
export async function GET(_req: NextRequest) {
  const sitePaths = await getActiveSitePaths();
  const filePath = path.join(sitePaths.projectDir, "dist", "index.html");

  try {
    const data = await readFile(filePath);
    return new NextResponse(data, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "No dist/index.html found. Run build first." },
      { status: 404 },
    );
  }
}
