import { NextRequest, NextResponse } from "next/server";
import { execFileSync } from "child_process";
import { denyViewers } from "@/lib/require-role";

/**
 * DEV ONLY — PM2 server control for CMS-managed sites.
 *
 * GET  /api/admin/pm2           → list all PM2 processes with status/port
 * POST /api/admin/pm2           → start or stop a named process
 *
 * Gated behind NODE_ENV !== "production" so it never runs in prod.
 */

function isDev() {
  return process.env.NODE_ENV !== "production";
}

function pm2Bin(): string {
  // pm2 is installed globally or via pnpm — find it
  try {
    return execFileSync("which", ["pm2"], { encoding: "utf-8" }).trim();
  } catch {
    return "pm2";
  }
}

export async function GET() {
  if (!isDev()) return NextResponse.json({ error: "Not available in production" }, { status: 404 });

  try {
    const raw = execFileSync(pm2Bin(), ["jlist"], { encoding: "utf-8", timeout: 5000 });
    const apps = JSON.parse(raw) as Array<{
      name: string;
      pm_id: number;
      pm2_env: { status: string; env?: { PORT?: string } };
    }>;
    const processes = apps.map((a) => ({
      name: a.name,
      pmId: a.pm_id,
      status: a.pm2_env.status, // "online" | "stopped" | "errored"
      port: a.pm2_env.env?.PORT ?? null,
    }));
    return NextResponse.json({ processes });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "pm2 error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isDev()) return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  const denied = await denyViewers(); if (denied) return denied;

  const body = (await req.json().catch(() => ({}))) as { name?: string; action?: "start" | "stop" | "restart" };
  if (!body.name || !body.action) {
    return NextResponse.json({ error: "name and action required" }, { status: 400 });
  }
  if (!["start", "stop", "restart"].includes(body.action)) {
    return NextResponse.json({ error: "action must be start, stop, or restart" }, { status: 400 });
  }

  // Safety: never touch cms-admin itself
  if (body.name === "cms-admin") {
    return NextResponse.json({ error: "Cannot control cms-admin from the UI" }, { status: 403 });
  }

  try {
    execFileSync(pm2Bin(), [body.action, body.name], { encoding: "utf-8", timeout: 10000 });
    // Fetch fresh status
    const raw = execFileSync(pm2Bin(), ["jlist"], { encoding: "utf-8", timeout: 5000 });
    const apps = JSON.parse(raw) as Array<{ name: string; pm2_env: { status: string } }>;
    const proc = apps.find((a) => a.name === body.name);
    return NextResponse.json({ ok: true, status: proc?.pm2_env.status ?? "unknown" });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "pm2 error" }, { status: 500 });
  }
}
