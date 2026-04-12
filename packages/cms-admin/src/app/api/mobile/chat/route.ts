import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getMobileSession } from "@/lib/mobile-auth";
import { getUserById, createToken } from "@/lib/auth";
import { getSitePathsFor } from "@/lib/site-paths";
import { FilesystemMediaAdapter } from "@/lib/media/filesystem";
import { chatJobs, type ChatEvent } from "./_jobs";

export const maxDuration = 300;

/**
 * POST /api/mobile/chat?orgId=...&siteId=...
 *
 * Starts a chat job in the background and returns a jobId immediately.
 * The client polls GET /api/mobile/chat/poll?jobId=...&after=0 for events.
 *
 * This avoids WKWebView SSE streaming issues — no connection to drop.
 * Jobs run server-side and survive screen lock / app backgrounding.
 */
export async function POST(req: NextRequest) {
  const session = await getMobileSession(req);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const orgId = req.nextUrl.searchParams.get("orgId");
  const siteId = req.nextUrl.searchParams.get("siteId");
  if (!orgId || !siteId) {
    return NextResponse.json({ error: "orgId and siteId required" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const baseUrl = process.env.NEXTAUTH_URL || `http://localhost:${process.env.PORT || 3010}`;

    const user = await getUserById(session.id);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    const sessionJwt = await createToken(user);

    // Create job
    const jobId = crypto.randomBytes(8).toString("hex");
    const job = { events: [] as ChatEvent[], done: false, createdAt: Date.now() };
    chatJobs.set(jobId, job);

    // Run chat in background (fire-and-forget from the request's perspective)
    runChatJob(jobId, body, orgId, siteId, sessionJwt, baseUrl).catch((err) => {
      console.error("[mobile/chat] Job error:", err);
      job.events.push({ event: "error", data: { message: String(err) } });
      job.done = true;
    });

    // Return job ID immediately — no waiting, no streaming
    return NextResponse.json({ jobId });
  } catch (err) {
    console.error("[mobile/chat] Error:", err);
    return NextResponse.json({ error: "Chat failed" }, { status: 500 });
  }
}

async function runChatJob(
  jobId: string,
  body: any,
  orgId: string,
  siteId: string,
  sessionJwt: string,
  baseUrl: string,
) {
  const job = chatJobs.get(jobId);
  if (!job) return;

  // Pre-process: convert ![](url) to vision content blocks
  if (body.messages) {
    const paths = await getSitePathsFor(orgId, siteId);
    body.messages = await Promise.all(
      body.messages.map(async (msg: any) => {
        if (msg.role !== "user" || typeof msg.content !== "string") return msg;
        const imgRegex = /!\[[^\]]*\]\(([^)]+)\)/g;
        const images: string[] = [];
        let match;
        while ((match = imgRegex.exec(msg.content)) !== null) images.push(match[1]);
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

  // Call upstream chat
  console.log(`[mobile/chat] Job ${jobId} — sending to upstream`);
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
    job.events.push({ event: "error", data: { message: errText } });
    job.done = true;
    return;
  }

  // Parse SSE stream and accumulate events
  const reader = upstream.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "text";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));
            job.events.push({ event: currentEvent, data });
          } catch {
            job.events.push({ event: currentEvent, data: line.slice(6) });
          }
          currentEvent = "text";
        }
      }
    }
  } catch (err) {
    job.events.push({ event: "error", data: { message: `Stream error: ${err}` } });
  }

  job.done = true;
  console.log(`[mobile/chat] Job ${jobId} — done, ${job.events.length} events`);
}
