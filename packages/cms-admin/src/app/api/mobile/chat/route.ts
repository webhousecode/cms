import { NextRequest } from "next/server";
import { getMobileSession } from "@/lib/mobile-auth";
import { getUserById, createToken } from "@/lib/auth";
import { getSitePathsFor } from "@/lib/site-paths";
import { FilesystemMediaAdapter } from "@/lib/media/filesystem";

export const maxDuration = 300; // 5 min — chat with tools can run long

/**
 * POST /api/mobile/chat?orgId=...&siteId=...
 *
 * Proxies to /api/cms/chat with the correct session cookies.
 * Streams SSE response back to the mobile client unchanged.
 * Mobile renders whatever events the server sends — no tool logic client-side.
 * New tools added on desktop automatically work on mobile.
 */
export async function POST(req: NextRequest) {
  const session = await getMobileSession(req);
  if (!session) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const orgId = req.nextUrl.searchParams.get("orgId");
  const siteId = req.nextUrl.searchParams.get("siteId");
  if (!orgId || !siteId) {
    return new Response(JSON.stringify({ error: "orgId and siteId required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const baseUrl = process.env.NEXTAUTH_URL || `http://localhost:${process.env.PORT || 3010}`;
    const serviceToken = process.env.CMS_JWT_SECRET;

    // Mint a real session JWT for this user so the chat endpoint can auth via cookies
    const user = await getUserById(session.id);
    if (!user) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    const sessionJwt = await createToken(user);

    // Start streaming IMMEDIATELY — send keepalives while we prepare the request.
    // WKWebView kills connections that don't send data within ~60s.
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        // Start keepalive immediately
        const keepalive = setInterval(() => {
          try { controller.enqueue(encoder.encode(":keepalive\n\n")); } catch { /* closed */ }
        }, 10000);

        try {
          // Pre-process: convert ![](url) to vision content blocks
          if (body.messages && orgId && siteId) {
            const paths = await getSitePathsFor(orgId, siteId);
            body.messages = await Promise.all(
              body.messages.map(async (msg: any) => {
                if (msg.role !== "user" || typeof msg.content !== "string") return msg;
                const imgRegex = /!\[[^\]]*\]\(([^)]+)\)/g;
                const images: string[] = [];
                let match;
                while ((match = imgRegex.exec(msg.content)) !== null) {
                  images.push(match[1]);
                }
                if (images.length === 0) return msg;

                const textContent = msg.content.replace(/!\[[^\]]*\]\([^)]+\)/g, "").trim();
                const contentBlocks: any[] = [];
                if (textContent) contentBlocks.push({ type: "text", text: textContent });

                for (const imgUrl of images) {
                  try {
                    let buf: Buffer | null = null;
                    const uploadsMatch = imgUrl.match(/\/uploads\/(.+)$/);
                    if (uploadsMatch && paths) {
                      const adapter = new FilesystemMediaAdapter(paths.uploadDir, paths.dataDir);
                      const data = await adapter.readFile(uploadsMatch[1].split("/"));
                      if (data) buf = Buffer.from(data);
                    }
                    if (!buf && imgUrl.startsWith("http") && !imgUrl.includes("/uploads/")) {
                      const r = await fetch(imgUrl, { signal: AbortSignal.timeout(5000) });
                      if (r.ok) buf = Buffer.from(await r.arrayBuffer());
                    }
                    if (buf) {
                      const ext = imgUrl.split(".").pop()?.toLowerCase() ?? "jpeg";
                      const mt = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
                      contentBlocks.push({ type: "image", source: { type: "base64", media_type: mt, data: buf.toString("base64") } });
                    }
                  } catch { /* skip */ }
                }
                return contentBlocks.length > 0 ? { ...msg, content: contentBlocks } : msg;
              }),
            );
          }

          // Send to upstream chat
          console.log("[mobile/chat] Sending to upstream...");
          const upstream = await fetch(`${baseUrl}/api/cms/chat`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Cookie: `cms-active-org=${orgId}; cms-active-site=${siteId}; cms-session=${sessionJwt}`,
            },
            body: JSON.stringify(body),
          });

          if (!upstream.ok) {
            const errText = await upstream.text();
            controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ message: errText })}\n\n`));
            controller.enqueue(encoder.encode("event: done\ndata: {}\n\n"));
            return;
          }

          // Pipe upstream SSE through
          const reader = upstream.body!.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
        } catch (err) {
          console.error("[mobile/chat] Error:", err);
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ message: String(err) })}\n\n`));
        } finally {
          clearInterval(keepalive);
          controller.enqueue(encoder.encode("event: done\ndata: {}\n\n"));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("[mobile/chat] Error:", err);
    return new Response(JSON.stringify({ error: "Chat failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
