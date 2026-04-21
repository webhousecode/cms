/**
 * DNS API client for the Custom Domain feature in Deploy settings.
 *
 * Talks to the BIND-9-on-dns2.webhouse.net API at dnsapi.webhouse.net.
 * Used to auto-create CNAME records when a user enters a custom domain
 * for their deployed site.
 */

import type { DeployProvider } from "../deploy-service";

const DEFAULT_TIMEOUT = 15000;

export interface DnsRecord {
  id: string;
  type: string;
  name: string;
  ttl?: number | null;
  alias?: string;
  ip?: string;
}

export interface DnsCnameTarget {
  /** Hostname the CNAME points to. Always ends with a trailing dot. */
  target: string;
  /** Human-readable provider label for status messages */
  providerLabel: string;
}

// ── Configuration ────────────────────────────────────────────────────────

export function isDnsApiConfigured(): boolean {
  return !!(process.env.DNS_API_URL && process.env.DNS_API_KEY);
}

function dnsApiBase(): string {
  const url = process.env.DNS_API_URL;
  if (!url) throw new Error("DNS_API_URL not configured");
  return url.replace(/\/+$/, "");
}

function dnsApiKey(): string {
  const key = process.env.DNS_API_KEY;
  if (!key) throw new Error("DNS_API_KEY not configured");
  return key;
}

// ── Domain parsing ──────────────────────────────────────────────────────

/**
 * Splits a fully-qualified domain into (subdomain, zone) using the list of
 * zones the DNS API manages. Falls back to the conservative split of "first
 * label = subdomain, rest = zone" if no managed zone matches.
 */
export async function parseCustomDomain(domain: string): Promise<{ subdomain: string; zone: string; managed: boolean }> {
  const clean = domain.trim().toLowerCase().replace(/\.$/, "");
  if (!clean.includes(".")) throw new Error(`"${domain}" is not a valid domain`);

  let zones: string[] = [];
  try {
    zones = await listManagedZones();
  } catch {
    /* fall through to dumb split — caller surfaces "no-zone" state */
  }

  // Find the longest managed zone that the domain ends with
  const matched = zones
    .filter((z) => clean === z || clean.endsWith("." + z))
    .sort((a, b) => b.length - a.length)[0];

  if (matched) {
    if (clean === matched) return { subdomain: "@", zone: matched, managed: true };
    const sub = clean.slice(0, -1 - matched.length);
    return { subdomain: sub, zone: matched, managed: true };
  }

  const parts = clean.split(".");
  return {
    subdomain: parts[0]!,
    zone: parts.slice(1).join("."),
    managed: false,
  };
}

// ── Provider → CNAME target map ─────────────────────────────────────────

export function cnameTargetForProvider(
  provider: DeployProvider,
  config: { deployAppName?: string; deployCloudflareProjectName?: string },
): DnsCnameTarget | null {
  switch (provider) {
    case "github-pages": {
      // appName is "owner/repo" → CNAME to "owner.github.io."
      const owner = config.deployAppName?.split("/")[0];
      if (!owner) return null;
      return { target: `${owner}.github.io.`, providerLabel: "GitHub Pages" };
    }
    case "vercel":
      return { target: "cname.vercel-dns.com.", providerLabel: "Vercel" };
    case "netlify": {
      // Netlify subdomain isn't always inferable; default to a sensible target.
      // Users with a custom Netlify subdomain should override manually.
      const sub = config.deployAppName ?? "";
      const target = sub ? `${sub}.netlify.app.` : "apex-loadbalancer.netlify.com.";
      return { target, providerLabel: "Netlify" };
    }
    case "cloudflare-pages": {
      const project = config.deployCloudflareProjectName;
      if (!project) return null;
      return { target: `${project}.pages.dev.`, providerLabel: "Cloudflare Pages" };
    }
    case "flyio":
    case "flyio-live": {
      const app = config.deployAppName;
      if (!app) return null;
      return { target: `${app}.fly.dev.`, providerLabel: "Fly.io" };
    }
    default:
      return null;
  }
}

// ── DNS API calls ───────────────────────────────────────────────────────

async function dnsFetch(method: string, path: string, body?: unknown): Promise<Response> {
  const res = await fetch(`${dnsApiBase()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${dnsApiKey()}`,
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
  });
  return res;
}

export async function listManagedZones(): Promise<string[]> {
  const res = await dnsFetch("GET", "/zones");
  if (!res.ok) throw new Error(`DNS API: zones list failed (${res.status})`);
  const zones = (await res.json()) as Array<{ name: string }>;
  return zones.map((z) => z.name);
}

export async function findCname(zone: string, name: string): Promise<DnsRecord | null> {
  const params = new URLSearchParams({ type: "CNAME", name });
  const res = await dnsFetch("GET", `/zones/${encodeURIComponent(zone)}/records?${params.toString()}`);
  if (!res.ok) throw new Error(`DNS API: lookup failed (${res.status})`);
  const records = (await res.json()) as DnsRecord[];
  return records[0] ?? null;
}

export async function createCname(zone: string, name: string, target: string): Promise<DnsRecord> {
  const res = await dnsFetch("POST", `/zones/${encodeURIComponent(zone)}/records`, {
    type: "CNAME",
    name,
    alias: target,
    ttl: 3600,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`DNS API: create failed (${res.status}): ${body.slice(0, 200)}`);
  }
  return (await res.json()) as DnsRecord;
}

export async function updateCname(zone: string, recordId: string, target: string): Promise<DnsRecord> {
  const res = await dnsFetch("PUT", `/zones/${encodeURIComponent(zone)}/records/${encodeURIComponent(recordId)}`, {
    type: "CNAME",
    alias: target,
    ttl: 3600,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`DNS API: update failed (${res.status}): ${body.slice(0, 200)}`);
  }
  return (await res.json()) as DnsRecord;
}

/**
 * Idempotent: looks up the CNAME for (zone,name); creates if missing,
 * updates if target differs, no-op if already correct.
 */
export async function ensureCname(
  zone: string,
  name: string,
  target: string,
): Promise<{ status: "created" | "updated" | "unchanged"; record: DnsRecord }> {
  const existing = await findCname(zone, name);
  if (!existing) {
    const record = await createCname(zone, name, target);
    return { status: "created", record };
  }
  // Normalise both for comparison (DNS API may store with/without trailing dot)
  const normalise = (s: string) => s.replace(/\.$/, "").toLowerCase();
  if (normalise(existing.alias ?? "") === normalise(target)) {
    return { status: "unchanged", record: existing };
  }
  const record = await updateCname(zone, existing.id, target);
  return { status: "updated", record };
}

// ── Cloudflare Registrar ────────────────────────────────────────────────

export interface RegistrarDomainPricing {
  currency: string;
  registration_cost: string;
  renewal_cost: string;
}

export interface RegistrarDomainResult {
  name: string;
  registrable: boolean;
  tier: string;
  pricing?: RegistrarDomainPricing;
}

export interface RegistrarInitResult {
  requires_confirmation: true;
  confirm_token: string;
  price: number;
  currency: string;
  expires_at: string;
  domain_name: string;
}

export interface RegistrarConfirmResult {
  ok: boolean;
  domain_name: string;
  registered: boolean;
  message?: string;
}

export async function searchDomains(query: string, limit = 5): Promise<RegistrarDomainResult[]> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const res = await dnsFetch("GET", `/registrar/search?${params.toString()}`);
  if (!res.ok) throw new Error(`Registrar search failed (${res.status})`);
  const data = (await res.json()) as { results: RegistrarDomainResult[] };
  return data.results ?? [];
}

export async function checkDomains(domains: string[]): Promise<{ results: RegistrarDomainResult[]; unsupported: string[] }> {
  const res = await dnsFetch("POST", "/registrar/check", { domains });
  if (!res.ok) throw new Error(`Registrar check failed (${res.status})`);
  return (await res.json()) as { results: RegistrarDomainResult[]; unsupported: string[] };
}

export async function initiateRegistration(domainName: string): Promise<RegistrarInitResult> {
  const res = await dnsFetch("POST", "/registrar/register", { domain_name: domainName });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Registration failed (${res.status}): ${body.slice(0, 200)}`);
  }
  return (await res.json()) as RegistrarInitResult;
}

export async function confirmRegistration(domainName: string, confirmToken: string): Promise<RegistrarConfirmResult> {
  const res = await dnsFetch("POST", "/registrar/register", { domain_name: domainName, confirm_token: confirmToken });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Registration confirmation failed (${res.status}): ${body.slice(0, 200)}`);
  }
  return (await res.json()) as RegistrarConfirmResult;
}
