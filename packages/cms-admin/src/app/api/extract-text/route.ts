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
      // pdf-parse v1 is CJS — try multiple import strategies
      let pdfParse: (buf: Buffer) => Promise<{ text?: string; numpages?: number }>;
      try {
        // Strategy 1: dynamic import (works in most bundlers)
        const mod = await import("pdf-parse");
        pdfParse = (mod as any).default ?? mod;
      } catch {
        try {
          // Strategy 2: globalThis.require (Node.js runtime)
          pdfParse = (globalThis as any).require("pdf-parse");
        } catch {
          return NextResponse.json({ text: null, reason: "pdf-parse not available" });
        }
      }

      const result = await pdfParse(buffer);
      const text = result.text?.trim();

      if (!text || text.length < 10) {
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
