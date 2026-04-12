import { NextRequest } from "next/server";
import { getMobileSession } from "@/lib/mobile-auth";
import { getUserById, createToken } from "@/lib/auth";

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

    // Pre-process messages: convert ![](url) image refs to vision content blocks
    if (body.messages) {
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

          // Build content blocks: text + images
          const textContent = msg.content.replace(/!\[[^\]]*\]\([^)]+\)/g, "").trim();
          const contentBlocks: any[] = [];
          if (textContent) {
            contentBlocks.push({ type: "text", text: textContent });
          }
          for (const imgUrl of images) {
            try {
              // Fetch image and convert to base64
              const fetchUrl = imgUrl.startsWith("http") ? imgUrl : `${baseUrl}${imgUrl}`;
              const imgRes = await fetch(fetchUrl, { signal: AbortSignal.timeout(5000) });
              if (imgRes.ok) {
                const buf = Buffer.from(await imgRes.arrayBuffer());
                const ext = imgUrl.split(".").pop()?.toLowerCase() ?? "jpeg";
                const mediaType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
                contentBlocks.push({
                  type: "image",
                  source: { type: "base64", media_type: mediaType, data: buf.toString("base64") },
                });
              }
            } catch { /* skip failed images */ }
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
