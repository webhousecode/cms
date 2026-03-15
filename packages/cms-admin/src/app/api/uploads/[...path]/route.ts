import { NextRequest, NextResponse } from "next/server";
import { getMediaAdapter } from "@/lib/media";

const MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
  avif: "image/avif", pdf: "application/pdf",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg",
  flac: "audio/flac", aac: "audio/aac", m4a: "audio/mp4",
  html: "text/html",
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await params;
  const ext = segments[segments.length - 1].split(".").pop()?.toLowerCase() ?? "";
  const contentType = MIME[ext] ?? "application/octet-stream";

  try {
    const adapter = await getMediaAdapter();
    const data = await adapter.readFile(segments);
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err: unknown) {
    if ((err as Error).message === "Path traversal detected")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
