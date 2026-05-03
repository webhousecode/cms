/**
 * F144 P4 — Builder VM status callback.
 *
 * Builder entrypoint.sh POSTs phase updates here. Body:
 *
 *   {
 *     siteId: string,
 *     sha: string,
 *     phase: "init" | "source-extract" | "image-build" | "image-push" | "done" | "failed",
 *     message?: string,
 *     exitCode?: number,
 *     durationMs?: number,
 *     imageTag?: string,
 *   }
 *
 * Bearer token must verify against (siteId, sha) per
 * lib/build-orchestrator/callback-token.ts.
 *
 * NOTE: this endpoint accepts unauthenticated SESSION (no cookie required)
 * — it's protected purely by HMAC. The middleware ALLOWS routes under
 * /api/builder/ to bypass cookie auth (added in this commit).
 */
import { NextResponse, type NextRequest } from "next/server";
import { verifyCallbackToken } from "@/lib/build-orchestrator/callback-token";
import { recordBuildEvent, type BuildPhase } from "@/lib/build-orchestrator/build-log";
import { withSiteContext } from "@/lib/site-context";
import { loadRegistry, findSite } from "@/lib/site-registry";

const VALID_PHASES = new Set<BuildPhase>([
  "init",
  "source-extract",
  "image-build",
  "image-push",
  "done",
  "failed",
]);

interface CallbackBody {
  siteId?: string;
  sha?: string;
  phase?: string;
  message?: string;
  exitCode?: number;
  durationMs?: number;
  imageTag?: string;
}

async function resolveOrgForSite(siteId: string): Promise<{ orgId: string; siteId: string } | null> {
  const registry = await loadRegistry();
  if (!registry) return null;
  for (const org of registry.orgs) {
    if (findSite(registry, org.id, siteId)) return { orgId: org.id, siteId };
  }
  return null;
}

export async function POST(req: NextRequest): Promise<Response> {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return NextResponse.json({ error: "missing bearer token" }, { status: 401 });
  }
  const token = authHeader.slice(7).trim();

  let body: CallbackBody;
  try {
    body = (await req.json()) as CallbackBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { siteId, sha, phase, message, exitCode, durationMs, imageTag } = body;
  if (!siteId || !sha || !phase) {
    return NextResponse.json(
      { error: "siteId, sha, phase are required" },
      { status: 400 },
    );
  }

  const verify = verifyCallbackToken(token, siteId, sha);
  if (!verify.valid) {
    return NextResponse.json({ error: `bad token: ${verify.reason}` }, { status: 401 });
  }

  if (!VALID_PHASES.has(phase as BuildPhase)) {
    return NextResponse.json({ error: `unknown phase: ${phase}` }, { status: 400 });
  }

  const ctx = await resolveOrgForSite(siteId);
  if (!ctx) {
    return NextResponse.json({ error: `site not found: ${siteId}` }, { status: 404 });
  }

  const final =
    phase === "done" || phase === "failed"
      ? {
          success: phase === "done",
          ...(typeof exitCode === "number" && { exitCode }),
          ...(typeof durationMs === "number" && { durationMs }),
          ...(imageTag && { imageTag }),
        }
      : undefined;

  const record = await withSiteContext(ctx, () =>
    recordBuildEvent({
      siteId,
      sha,
      phase: phase as BuildPhase,
      ...(message && { message }),
      ...(final && { final }),
    }),
  );

  return NextResponse.json({ ok: true, phase: record.phase, eventCount: record.events.length });
}
