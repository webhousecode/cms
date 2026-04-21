import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import {
  checkDomains,
  confirmRegistration,
  initiateRegistration,
  isDnsApiConfigured,
  searchDomains,
} from "@/lib/deploy/dns-client";

/**
 * GET /api/admin/dns/registrar?action=search&q=myblog&limit=5
 * GET /api/admin/dns/registrar?action=check&domains=foo.app,bar.dev
 */
export async function GET(req: NextRequest) {
  const denied = await requirePermission("deploy.trigger");
  if (denied) return denied;

  if (!isDnsApiConfigured()) {
    return NextResponse.json({ error: "DNS API not configured" }, { status: 503 });
  }

  const { searchParams } = req.nextUrl;
  const action = searchParams.get("action");

  try {
    if (action === "search") {
      const q = searchParams.get("q")?.trim();
      if (!q) return NextResponse.json({ error: "q is required" }, { status: 400 });
      const limit = Math.min(10, Math.max(1, parseInt(searchParams.get("limit") ?? "5", 10)));
      const results = await searchDomains(q, limit);
      return NextResponse.json({ results });
    }

    if (action === "check") {
      const raw = searchParams.get("domains") ?? "";
      const domains = raw.split(",").map((d) => d.trim()).filter(Boolean);
      if (!domains.length) return NextResponse.json({ error: "domains is required" }, { status: 400 });
      const data = await checkDomains(domains);
      return NextResponse.json(data);
    }

    return NextResponse.json({ error: "action must be 'search' or 'check'" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

/**
 * POST /api/admin/dns/registrar
 * Body: { action: "initiate", domain_name: "foo.app" }
 *    or { action: "confirm", domain_name: "foo.app", confirm_token: "..." }
 *
 * Purchase is non-refundable — the UI MUST show exact price and require
 * explicit user confirmation before calling the "confirm" action.
 */
export async function POST(req: NextRequest) {
  const denied = await requirePermission("deploy.trigger");
  if (denied) return denied;

  if (!isDnsApiConfigured()) {
    return NextResponse.json({ error: "DNS API not configured" }, { status: 503 });
  }

  try {
    const body = (await req.json()) as {
      action: string;
      domain_name?: string;
      confirm_token?: string;
    };

    const { action, domain_name, confirm_token } = body;
    if (!domain_name) return NextResponse.json({ error: "domain_name is required" }, { status: 400 });

    if (action === "initiate") {
      const result = await initiateRegistration(domain_name);
      return NextResponse.json(result);
    }

    if (action === "confirm") {
      if (!confirm_token) return NextResponse.json({ error: "confirm_token is required" }, { status: 400 });
      const result = await confirmRegistration(domain_name, confirm_token);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "action must be 'initiate' or 'confirm'" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
