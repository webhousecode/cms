/**
 * SSE endpoint for streaming deploy progress.
 *
 * POST /api/admin/deploy/stream — triggers a deploy and streams progress events.
 * Events: { step, message, progress (0-100), status }
 */
import { NextResponse } from "next/server";
import { triggerDeploy } from "@/lib/deploy-service";
import { denyViewers } from "@/lib/require-role";

export const dynamic = "force-dynamic";

export async function POST() {
  const denied = await denyViewers(); if (denied) return denied;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: { step: string; message: string; progress: number; status: "running" | "done" | "error"; url?: string; error?: string }) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch { /* client disconnected */ }
      }

      send({ step: "init", message: "Starting deploy...", progress: 5, status: "running" });

      try {
        // Step 1: Trigger deploy (this blocks until complete)
        send({ step: "build", message: "Building site and optimizing assets...", progress: 20, status: "running" });

        const result = await triggerDeploy();

        if (result.status === "error") {
          send({ step: "error", message: result.error ?? "Deploy failed", progress: 100, status: "error", error: result.error });
        } else {
          send({ step: "push", message: "Pushing to provider...", progress: 80, status: "running" });
          send({ step: "done", message: "Deploy complete!", progress: 100, status: "done", url: result.url });
        }
      } catch (err) {
        send({ step: "error", message: err instanceof Error ? err.message : "Deploy failed", progress: 100, status: "error", error: String(err) });
      }

      controller.close();
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
