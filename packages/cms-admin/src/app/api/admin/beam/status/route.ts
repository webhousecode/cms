/**
 * GET /api/admin/beam/status?beamId=... — SSE stream for beam transfer progress.
 *
 * Auth: middleware-protected (admin routes).
 */
import { NextRequest } from "next/server";
import { getBeamSession, addBeamListener } from "@/lib/beam/session";

export async function GET(request: NextRequest) {
  const beamId = request.nextUrl.searchParams.get("beamId");
  if (!beamId) {
    return new Response("Missing beamId", { status: 400 });
  }

  const session = getBeamSession(beamId);
  if (!session) {
    return new Response("Beam session not found", { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // Send initial state
      const initial = JSON.stringify({
        beamId: session.beamId,
        phase: session.phase,
        totalFiles: session.totalFiles,
        transferredFiles: session.transferredFiles,
        totalBytes: session.totalBytes,
        transferredBytes: session.transferredBytes,
        currentFile: session.currentFile,
        error: session.error,
      });
      controller.enqueue(encoder.encode(`event: progress\ndata: ${initial}\n\n`));

      // Subscribe to updates
      const unsubscribe = addBeamListener(beamId, (event, data) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
          // Close stream when done or error
          const parsed = JSON.parse(data);
          if (parsed.phase === "done" || parsed.phase === "error") {
            setTimeout(() => {
              try { controller.close(); } catch { /* already closed */ }
            }, 500);
          }
        } catch {
          /* controller closed */
        }
      });

      // Cleanup on abort
      request.signal.addEventListener("abort", () => {
        unsubscribe();
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
