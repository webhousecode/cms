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
      // Dynamic import to avoid Turbopack bundling issues
      // @ts-expect-error — pdf-parse has no type declarations
      const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
      const result = await pdfParse(buffer);
      const text = result.text?.trim();
      if (!text || text.length < 10) {
        return NextResponse.json({ text: null, reason: "No readable text (possibly scanned/image PDF)" });
      }
      return NextResponse.json({ text: text.slice(0, 50_000) });
    }

    if (name.endsWith(".docx") || name.endsWith(".doc")) {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      const text = result.value?.trim();
      if (!text) return NextResponse.json({ text: null, reason: "No text found" });
      return NextResponse.json({ text: text.slice(0, 50_000) });
    }

    return NextResponse.json({ text: null, reason: "Unsupported file type" });
  } catch (err) {
    console.error("[extract-text] Error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ text: null, reason: `Extraction error: ${err instanceof Error ? err.message : "unknown"}` });
  }
}
