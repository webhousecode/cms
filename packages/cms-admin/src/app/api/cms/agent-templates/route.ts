/**
 * Agent template library API.
 *
 * GET  /api/cms/agent-templates              → list local + marketplace
 * GET  /api/cms/agent-templates?source=local → list local only
 * POST /api/cms/agent-templates              → save a new local template
 *
 * Local templates are scoped to the active org (cookie cms-active-org).
 */
import { NextRequest, NextResponse } from "next/server";
import { listLocalTemplates, saveLocalTemplate, type AgentTemplate } from "@/lib/agent-templates";
import { fetchMarketplaceTemplates } from "@/lib/marketplace-templates";
import { denyViewers } from "@/lib/require-role";
import { cookies } from "next/headers";

async function getActiveOrgId(): Promise<string | null> {
  try {
    const c = await cookies();
    return c.get("cms-active-org")?.value ?? null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get("source") ?? "all";
  const orgId = await getActiveOrgId();

  const local = orgId ? await listLocalTemplates(orgId) : [];
  let marketplace: AgentTemplate[] = [];
  let marketplaceError: string | undefined;
  let marketplaceSource: string | undefined;

  if (source === "all" || source === "marketplace") {
    const result = await fetchMarketplaceTemplates();
    marketplace = result.templates;
    marketplaceError = result.error;
    marketplaceSource = result.source;
  }

  if (source === "local") {
    return NextResponse.json({ local });
  }
  if (source === "marketplace") {
    return NextResponse.json({ marketplace, marketplaceError, marketplaceSource });
  }
  return NextResponse.json({ local, marketplace, marketplaceError, marketplaceSource });
}

export async function POST(request: NextRequest) {
  const denied = await denyViewers();
  if (denied) return denied;

  const orgId = await getActiveOrgId();
  if (!orgId) {
    return NextResponse.json({ error: "No active org" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as Partial<AgentTemplate> | null;
  if (!body || !body.name || !body.payload) {
    return NextResponse.json(
      { error: "name and payload are required" },
      { status: 400 },
    );
  }

  try {
    const template = await saveLocalTemplate(orgId, {
      name: body.name,
      description: body.description ?? "",
      category: body.category,
      icon: body.icon,
      author: body.author,
      version: body.version ?? "1.0.0",
      payload: body.payload,
    });
    return NextResponse.json(template);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to save template";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
