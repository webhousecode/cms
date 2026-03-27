import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/extract-text
 * Accepts a file upload and returns extracted text content.
 * Supports: PDF, DOCX
 */
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const name = file.name.toLowerCase();

  try {
    if (name.endsWith(".pdf")) {
      // Use child_process to avoid Turbopack bundling issues with pdf-parse
      const { execSync } = await import("node:child_process");
      const text = execSync(
        `node -e "const p=require('pdf-parse');const fs=require('fs');p(fs.readFileSync('/dev/stdin')).then(r=>process.stdout.write(r.text||''))"`,
        { input: buffer, timeout: 10000, maxBuffer: 5 * 1024 * 1024, cwd: process.cwd() },
      ).toString().trim();

      if (text.length < 10) {
        return NextResponse.json({ text: null, reason: "No readable text found (possibly scanned/image PDF)" });
      }
      return NextResponse.json({ text: text.slice(0, 50_000) });
    }

    if (name.endsWith(".docx") || name.endsWith(".doc")) {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      const text = result.value?.trim();
      if (!text) return NextResponse.json({ text: null, reason: "No text found in document" });
      return NextResponse.json({ text: text.slice(0, 50_000) });
    }

    return NextResponse.json({ text: null, reason: "Unsupported file type" });
  } catch (err) {
    console.error("[extract-text] Error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ text: null, reason: "Extraction failed" });
  }
}
