import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { onSchedulerEvent } from "@/lib/scheduler-bus";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSessionUser(await cookies());
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // Send keepalive comment every 30s to prevent connection timeout
      const keepalive = setInterval(() => {
        try { controller.enqueue(encoder.encode(": keepalive\n\n")); } catch { clearInterval(keepalive); }
      }, 30_000);

      const unsub = onSchedulerEvent((evt) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));
        } catch { /* client disconnected */ }
      });

      // Cleanup on close
      const originalCancel = stream.cancel?.bind(stream);
      stream.cancel = async (reason) => {
        clearInterval(keepalive);
        unsub();
        if (originalCancel) return originalCancel(reason);
      };
    },
    cancel() {
      // Additional cleanup handled above
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
