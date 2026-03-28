/**
 * Revalidation endpoint for GitHub-backed CMS sites.
 *
 * The CMS admin pushes content changes here via signed webhook.
 * This endpoint:
 * 1. Verifies HMAC-SHA256 signature
 * 2. Writes pushed documents to disk
 * 3. Revalidates affected paths
 * 4. Notifies LiveRefresh clients via SSE
 */
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

const SECRET = process.env.REVALIDATE_SECRET;

export async function POST(request: NextRequest) {
  const signature = request.headers.get("x-cms-signature");
  const body = await request.text();

  // Verify HMAC if secret is configured
  if (SECRET) {
    if (!signature) {
      return NextResponse.json({ error: "Missing signature" }, { status: 401 });
    }
    const expected =
      "sha256=" +
      crypto.createHmac("sha256", SECRET).update(body).digest("hex");
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (
      sigBuf.length !== expBuf.length ||
      !crypto.timingSafeEqual(sigBuf, expBuf)
    ) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  const payload = JSON.parse(body) as {
    paths?: string[];
    documents?: Array<{
      collection: string;
      slug: string;
      content: string;
    }>;
  };

  // Write pushed documents to disk
  if (payload.documents) {
    for (const doc of payload.documents) {
      const filePath = join(
        process.cwd(),
        "content",
        doc.collection,
        `${doc.slug}.json`,
      );
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, doc.content, "utf-8");
    }
  }

  // Revalidate paths
  const paths: string[] = payload.paths ?? ["/"];
  for (const path of paths) {
    revalidatePath(path);
  }

  // Notify LiveRefresh clients
  try {
    const { broadcast } = await import("@/lib/content-stream");
    broadcast({ type: "content-change", paths });
  } catch {
    /* LiveRefresh not available */
  }

  return NextResponse.json({
    revalidated: true,
    paths,
    documents: payload.documents?.length ?? 0,
    timestamp: new Date().toISOString(),
  });
}
