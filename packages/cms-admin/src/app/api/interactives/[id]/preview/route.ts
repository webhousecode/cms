import { NextRequest, NextResponse } from "next/server";
import { getMediaAdapter } from "@/lib/media";
import { getServerTSafe } from "@/i18n/server";

/* ─── GET: serve HTML for iframe preview ─────────────────────── */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const adapter = await getMediaAdapter();
    const result = await adapter.getInteractive(id);
    if (!result) return new NextResponse((await getServerTSafe())("errApi.common.notFound"), { status: 404 });

    return new NextResponse(result.content, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        // Security W43 H4 — user/site HTML served on the admin domain runs in an
        // opaque origin: its scripts cannot read the admin session or DOM.
        "Content-Security-Policy": "sandbox allow-scripts allow-forms allow-popups", // i18n-ignore: HTTP header value
      },
    });
  } catch (err) {
    console.error("[interactives] preview error:", err);
    return new NextResponse((await getServerTSafe())("errApi.interactives.internalErrorDetail", { error: (err as Error).message }), { status: 500 });
  }
}
