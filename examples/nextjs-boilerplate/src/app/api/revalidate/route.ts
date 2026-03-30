/**
 * Instant Content Deployment endpoint.
 *
 * Receives content changes from CMS admin via signed webhook.
 * Writes updated documents to disk and revalidates affected paths
 * so Next.js serves fresh content on the next request — no full
 * Docker rebuild needed. Typical latency: ~2 seconds.
 *
 * Configure in CMS admin → Site Settings → General:
 *   Revalidate URL: https://your-site.fly.dev/api/revalidate
 *   Revalidate Secret: (generate with openssl rand -hex 32)
 */
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { writeFileSync, mkdirSync, unlinkSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

const SECRET = process.env.REVALIDATE_SECRET;
const CONTENT_DIR = process.env.CONTENT_DIR ?? join(process.cwd(), "content");

export async function POST(request: NextRequest) {
  const signature = request.headers.get("x-cms-signature");
  const body = await request.text();

  // Verify HMAC-SHA256 signature
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
    collection?: string;
    slug?: string;
    action?: string;
    document?: Record<string, unknown> | null;
  };

  // Write or delete document on disk
  if (payload.collection && payload.slug) {
    const filePath = join(CONTENT_DIR, payload.collection, `${payload.slug}.json`);

    if (payload.action === "deleted") {
      if (existsSync(filePath)) unlinkSync(filePath);
    } else if (payload.document) {
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, JSON.stringify(payload.document, null, 2), "utf-8");
    }
  }

  // Revalidate affected paths
  const paths: string[] = payload.paths ?? ["/"];
  for (const p of paths) {
    revalidatePath(p);
  }

  return NextResponse.json({
    revalidated: true,
    paths,
    collection: payload.collection,
    slug: payload.slug,
    timestamp: new Date().toISOString(),
  });
}
