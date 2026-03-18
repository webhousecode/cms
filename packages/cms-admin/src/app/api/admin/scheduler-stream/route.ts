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
  let keepalive: ReturnType<typeof setInterval>;
  let unsub: (() => void) | undefined;

  const stream = new ReadableStream({
    start(controller) {
      keepalive = setInterval(() => {
        try { controller.enqueue(encoder.encode(": keepalive\n\n")); } catch { /* closed */ }
      }, 30_000);

      unsub = onSchedulerEvent((evt) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));
        } catch { /* client disconnected */ }
      });
    },
    cancel() {
      clearInterval(keepalive);
      unsub?.();
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
