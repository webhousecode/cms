/**
 * Server-side text extraction from PDF and Word documents.
 * Used by the upload API to make document content available to the chat AI.
 */

const MAX_TEXT_LENGTH = 50_000;

export async function extractDocumentText(
  buffer: Buffer,
  filename: string,
): Promise<string | null> {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";

  try {
    switch (ext) {
      case "pdf":
        return await extractPdf(buffer);
      case "docx":
      case "doc":
        return await extractDocx(buffer);
      default:
        return null;
    }
  } catch (err) {
    console.error(`[document-extractor] Failed to extract text from ${filename}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

async function extractPdf(buffer: Buffer): Promise<string | null> {
  // pdf-parse v1 is CommonJS — use createRequire for reliable loading in ESM/Turbopack
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const pdfParse = require("pdf-parse");
  const result = await pdfParse(buffer);
  const text = result.text?.trim();
  if (!text || text.length < 10) return null; // Likely scanned/image-only PDF
  return text.slice(0, MAX_TEXT_LENGTH);
}

async function extractDocx(buffer: Buffer): Promise<string | null> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value?.trim();
  if (!text) return null;
  return text.slice(0, MAX_TEXT_LENGTH);
}
