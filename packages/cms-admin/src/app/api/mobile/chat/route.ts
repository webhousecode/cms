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

    // Pre-process messages: convert ![](url) image refs to Anthropic vision content blocks
    // Read images directly from disk (HTTP fetch of /uploads/ needs cookies we don't have)
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
          if (textContent) {
            contentBlocks.push({ type: "text", text: textContent });
          }

          for (const imgUrl of images) {
            try {
              let buf: Buffer | null = null;

              // Try reading from disk first (handles /uploads/xxx and http://...3010/uploads/xxx)
              const uploadsMatch = imgUrl.match(/\/uploads\/(.+)$/);
              if (uploadsMatch && paths) {
                const adapter = new FilesystemMediaAdapter(paths.uploadDir, paths.dataDir);
                const segments = uploadsMatch[1].split("/");
                const data = await adapter.readFile(segments);
                if (data) buf = Buffer.from(data);
              }

              // Fallback: HTTP fetch for external URLs
              if (!buf && imgUrl.startsWith("http") && !imgUrl.includes("/uploads/")) {
                const res = await fetch(imgUrl, { signal: AbortSignal.timeout(5000) });
                if (res.ok) buf = Buffer.from(await res.arrayBuffer());
              }

              if (buf) {
                const ext = imgUrl.split(".").pop()?.toLowerCase() ?? "jpeg";
                const mediaType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
                contentBlocks.push({
                  type: "image",
                  source: { type: "base64", media_type: mediaType, data: buf.toString("base64") },
                });
              }
            } catch { /* skip */ }
          }
          return contentBlocks.length > 0 ? { ...msg, content: contentBlocks } : msg;
        }),
      );
    }

    // Proxy to the real chat endpoint with cookies for site context + session
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
      return new Response(errText, {
        status: upstream.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Stream the SSE response through unchanged
    return new Response(upstream.body, {
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
