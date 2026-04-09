import { NextRequest, NextResponse } from "next/server";
import { getAdminConfig } from "@/lib/cms";
import { getActiveSitePaths } from "@/lib/site-paths";
import { readSiteConfig } from "@/lib/site-config";
import { FormService } from "@/lib/forms/service";
import { isHoneypotTriggered, hashIp, isRateLimited, HONEYPOT_FIELD } from "@/lib/forms/spam";
import { notifyFormSubmission } from "@/lib/forms/notify";

function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
  if (origin && allowed.some((a) => origin === a || a === "*")) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

async function getAllowedOrigins(): Promise<string[]> {
  const origins: string[] = [];
  try {
    const siteConfig = await readSiteConfig();
    if (siteConfig.previewSiteUrl) origins.push(siteConfig.previewSiteUrl);
  } catch { /* no site config */ }
  // In dev, allow localhost on common ports
  if (process.env.NODE_ENV !== "production") {
    origins.push("http://localhost:3000", "http://localhost:3009", "http://localhost:3011", "https://localhost:3010");
  }
  return origins;
}

/** OPTIONS — CORS preflight. */
export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  const allowed = await getAllowedOrigins();
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin, allowed) });
}

/**
 * POST /api/forms/[name] — public form submission endpoint.
 *
 * Accepts both application/json and application/x-www-form-urlencoded
 * (native HTML form submit). Rate-limited, honeypot-checked, schema-validated.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const origin = req.headers.get("origin");
  const allowed = await getAllowedOrigins();
  const cors = corsHeaders(origin, allowed);

  // Look up form definition
  const config = await getAdminConfig();
  const form = config.forms?.find((f) => f.name === name);
  if (!form) {
    return NextResponse.json({ error: "Form not found" }, { status: 404, headers: cors });
  }

  // Parse body — support both JSON and form-urlencoded
  let body: Record<string, unknown>;
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  } else {
    const fd = await req.formData().catch(() => null);
    if (!fd) return NextResponse.json({ error: "Invalid body" }, { status: 400, headers: cors });
    body = Object.fromEntries(fd.entries());
  }

  // Spam: honeypot
  if (form.spam?.honeypot !== false && isHoneypotTriggered(body)) {
    // Return 200 to not tip off bots, but don't store
    return NextResponse.json({ ok: true, message: form.successMessage ?? "Thank you!" }, { headers: cors });
  }

  // Spam: rate limit
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const ipHash = hashIp(ip);
  const maxPerHour = form.spam?.rateLimit ?? 5;
  if (isRateLimited(ipHash, name, maxPerHour)) {
    return NextResponse.json({ error: "Too many submissions — try again later" }, { status: 429, headers: cors });
  }

  // Schema validation — check required fields
  const errors: string[] = [];
  for (const field of form.fields) {
    if (field.type === "hidden") continue; // hidden fields are optional
    const val = body[field.name];
    if (field.required && (val === undefined || val === null || val === "")) {
      errors.push(`${field.label || field.name} is required`);
    }
    if (val !== undefined && val !== "" && field.validation?.pattern) {
      if (!new RegExp(field.validation.pattern).test(String(val))) {
        errors.push(`${field.label || field.name} is invalid`);
      }
    }
  }
  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join(", ") }, { status: 400, headers: cors });
  }

  // Strip honeypot field + internal fields from stored data
  const cleanData: Record<string, unknown> = {};
  for (const field of form.fields) {
    if (body[field.name] !== undefined) cleanData[field.name] = body[field.name];
  }

  // Store
  const { dataDir } = await getActiveSitePaths();
  const svc = new FormService(dataDir);
  const submission = await svc.create(name, cleanData, { ipHash, userAgent: req.headers.get("user-agent") ?? undefined });

  // Notify (fire-and-forget)
  notifyFormSubmission(form, submission).catch(() => {});

  // Response — if successRedirect is set and request was form-urlencoded, redirect
  if (form.successRedirect && ct.includes("form-urlencoded")) {
    return NextResponse.redirect(form.successRedirect, { status: 303, headers: cors });
  }

  return NextResponse.json(
    { ok: true, message: form.successMessage ?? "Thank you!", id: submission.id },
    { headers: cors },
  );
}
