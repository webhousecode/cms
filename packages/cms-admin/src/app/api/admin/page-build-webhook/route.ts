/**
 * POST /api/admin/page-build-webhook
 *
 * Receiver for GitHub `page_build` webhook events. Signed with per-site
 * HMAC-SHA256 secret stored under `_data/page-build-webhook-secret.json`.
 *
 * Flow:
 *   1. Read raw body + X-Hub-Signature-256 header
 *   2. Look up the candidate site(s) by repo.full_name
 *   3. For each candidate: verify HMAC against stored secret
 *   4. On match: publish DeployEvent into the in-process bus so any
 *      open SSE subscriber (admin tab) gets pushed an instant update
 *   5. Always respond 200 to GH (even on validation fail) UNLESS sig
 *      truly mismatches — then 401 so GH dashboard shows red ✗
 *
 * Public route (no session required) — protection is HMAC.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";

import { findSiteSecretsByRepo } from "@/lib/deploy/page-build-webhook-secret";
import { publish, type DeployEvent } from "@/lib/deploy/deploy-events";

interface PageBuildPayload {
  build?: {
    status?: string;
    error?: { message?: string | null };
    pusher?: { login?: string };
    commit?: string;
    duration?: number;
    url?: string;
  };
  repository?: {
    full_name?: string;
    homepage?: string;
  };
}

function verifySig(rawBody: string, header: string | null, secret: string): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  const provided = header.slice("sha256=".length);
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

function mapStatus(s: string | undefined): DeployEvent["status"] {
  switch (s) {
    case "queued": return "queued";
    case "building": return "building";
    case "built": return "built";
    case "errored": case "failed": return "errored";
    default: return "queued";
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const event = req.headers.get("x-github-event") ?? "";
  const sigHeader = req.headers.get("x-hub-signature-256");
  const rawBody = await req.text();

  // Ack ping events without verification — used by GH when you save the
  // webhook config. (Ping is signed too; we skip the check because we
  // may not yet have the matching site stored.)
  if (event === "ping") {
    return NextResponse.json({ ok: true, event: "ping" });
  }

  if (event !== "page_build") {
    return NextResponse.json({ ok: true, ignored: true, event });
  }

  let payload: PageBuildPayload;
  try { payload = JSON.parse(rawBody); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const repo = payload.repository?.full_name;
  if (!repo) {
    return NextResponse.json({ error: "missing repository.full_name" }, { status: 400 });
  }

  const candidates = await findSiteSecretsByRepo(repo);
  if (candidates.length === 0) {
    // No CMS site claims this repo — silently ack so GH stops retrying.
    return NextResponse.json({ ok: true, matched: 0, repo });
  }

  let matched = 0;
  for (const c of candidates) {
    if (!verifySig(rawBody, sigHeader, c.secret)) continue;
    matched++;

    const status = mapStatus(payload.build?.status);
    const evt: DeployEvent = {
      type: "page-build",
      orgId: c.orgId,
      siteId: c.siteId,
      status,
      ts: new Date().toISOString(),
      ...(payload.build?.commit && { sha: payload.build.commit }),
      ...(status === "built" && payload.repository?.homepage && { url: payload.repository.homepage }),
      ...(status === "built" && payload.build?.url && { url: payload.build.url }),
      ...(status === "errored" && payload.build?.error?.message && { error: payload.build.error.message }),
      ...(typeof payload.build?.duration === "number" && { duration: payload.build.duration }),
    };
    publish(evt);
  }

  if (matched === 0) {
    return NextResponse.json({ error: "no matching site secret verified" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, matched, repo });
}
