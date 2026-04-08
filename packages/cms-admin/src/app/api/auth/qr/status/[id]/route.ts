import { NextRequest } from "next/server";
import { getQrSession } from "@/lib/qr-sessions";

/**
 * SSE stream of QR session status. Closes when the session reaches a
 * terminal state (approved, rejected, expired) or after 5 min.
 *
 * Polling fallback: clients can also GET this endpoint without
 * Accept: text/event-stream and we'll return a one-shot JSON snapshot.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (req.headers.get("accept") !== "text/event-stream") {
    const s = getQrSession(id);
    if (!s) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    return new Response(JSON.stringify({ status: s.status, expiresAt: s.expiresAt }), {
      headers: { "content-type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      let last = "";
      const tick = () => {
        const s = getQrSession(id);
        if (!s) {
          send({ status: "expired" });
          controller.close();
          clearInterval(interval);
          return;
        }
        if (s.status !== last) {
          send({ status: s.status, expiresAt: s.expiresAt });
          last = s.status;
        }
        if (s.status !== "pending") {
          controller.close();
          clearInterval(interval);
        }
      };

      // Initial snapshot + then poll the in-memory store. (We could use an
      // event emitter instead but the store is single-process anyway, so
      // a 500ms tick is the simplest correct thing.)
      tick();
      const interval = setInterval(tick, 500);

      // Hard timeout — never let a stream live longer than 6 min
      setTimeout(() => {
        clearInterval(interval);
        try { controller.close(); } catch { /* already closed */ }
      }, 6 * 60 * 1000);

      req.signal.addEventListener("abort", () => {
        clearInterval(interval);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
