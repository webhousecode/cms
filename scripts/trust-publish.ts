/**
 * cms F201.4 — publish the sub-processor list on broberg.ai/trust.
 *
 * Reads compliance/subprocessors.public.json (written by compliance-scan.ts from
 * what is measured in production) and writes it as HTML into the broberg-ai
 * site's globals — DA on `globals`, EN on `en-globals` — field
 * `trustSubprocessorsHtml`. Then reads each value back from a fresh GET and
 * fails unless it is byte-identical: a 200 is not proof the field was saved.
 *
 * Usage: CMS_ADMIN_TOKEN=wh_… npx tsx scripts/trust-publish.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { PublicSubprocessor } from "./compliance-scan";

const BASE = process.env.CMS_BASE ?? "https://webhouse.app";
const SITE = "broberg-ai";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const T = {
  da: {
    heading: "Leverandører der behandler data for os",
    lead: "Underdatabehandlere i drift, og hvor den udgave vi bruger kører. «Målt» betyder, at vi har aflæst det i vores egen opsætning; resten er fra leverandørens egne sider. Alle leverandører uden for EU er dækket af en EU-godkendt overførselsaftale. Nye leverandører kommer på listen, når vi tager dem i brug.",
    groups: { eu: "Data i EU", mix: "Delvist i EU", out: "Uden for EU" },
    cols: ["Leverandør", "Bruges til", "Hvor data ligger", "Selskab", "Overførsel"],
    transfer: { EU: "Inden for EU", DPF: "EU-US Data Privacy Framework", SCC: "EU's standardkontrakt", "DPF+SCC": "Data Privacy Framework + standardkontrakt", ukendt: "Afklares" },
    measured: "målt",
    updated: (d: string) => `Listen blev senest ændret ${d}.`,
    month: ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"],
  },
  en: {
    heading: "Suppliers who process data for us",
    lead: "Sub-processors in production, and where the instance we use runs. «Measured» means we read it from our own setup; the rest comes from the supplier's own pages. Every supplier outside the EU is covered by an EU-approved transfer mechanism. New suppliers are added to this list when we start using them.",
    groups: { eu: "Data in the EU", mix: "Partly in the EU", out: "Outside the EU" },
    cols: ["Supplier", "Used for", "Where data lives", "Company", "Transfer"],
    transfer: { EU: "Within the EU", DPF: "EU-US Data Privacy Framework", SCC: "EU standard contractual clauses", "DPF+SCC": "Data Privacy Framework + standard clauses", ukendt: "Being clarified" },
    measured: "measured",
    updated: (d: string) => `List last changed ${d}.`,
    month: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  },
} as const;

const COUNTRY_EN: Record<string, string> = { USA: "USA", Danmark: "Denmark", Frankrig: "France" };

export function renderSubprocessorsHtml(rows: PublicSubprocessor[], changedAt: string, lang: "da" | "en"): string {
  const t = T[lang];
  const [y, m, d] = changedAt.split("-").map(Number);
  const date = lang === "da" ? `${d}. ${t.month[m - 1]} ${y}` : `${d} ${t.month[m - 1]} ${y}`;
  const out = [`<h2>${t.heading}</h2>`, `<p>${esc(t.lead)}</p>`];
  for (const cls of ["eu", "mix", "out"] as const) {
    const g = rows.filter((r) => r.location.class === cls);
    if (!g.length) continue;
    out.push(`<h3>${t.groups[cls]} (${g.length})</h3>`);
    out.push(`<div class="richtext-table-scroll"><table><thead><tr>${t.cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>`);
    for (const r of g) {
      const where = esc(lang === "da" ? r.location.da : r.location.en) + (r.location.measured ? ` · <em>${t.measured}</em>` : "");
      const company = lang === "da" ? r.company_country : (COUNTRY_EN[r.company_country] ?? r.company_country);
      out.push(`<tr><td>${esc(r.name)}</td><td>${esc(lang === "da" ? r.purpose_da : r.purpose_en)}</td><td>${where}</td><td>${esc(company)}</td><td>${esc(t.transfer[r.transfer_basis])}</td></tr>`);
    }
    out.push(`</tbody></table></div>`);
  }
  out.push(`<p><em>${t.updated(date)}</em></p>`);
  return out.join("\n");
}

async function main() {
  const token = process.env.CMS_ADMIN_TOKEN;
  if (!token) throw new Error("CMS_ADMIN_TOKEN mangler");
  const src = JSON.parse(readFileSync(path.join(process.cwd(), "compliance", "subprocessors.public.json"), "utf-8")) as { list_changed_at: string; rows: PublicSubprocessor[] };
  const H = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  for (const [slug, lang] of [["globals", "da"], ["en-globals", "en"]] as const) {
    const html = renderSubprocessorsHtml(src.rows, src.list_changed_at, lang);
    const url = `${BASE}/api/cms/globals/${slug}?site=${SITE}`;
    const w = await fetch(url, { method: "PATCH", headers: H, body: JSON.stringify({ data: { trustSubprocessorsHtml: html } }) });
    if (!w.ok) throw new Error(`${slug}: PATCH ${w.status} ${await w.text()}`);
    const back = (await (await fetch(url, { headers: H })).json()) as { data?: Record<string, unknown> };
    if (back.data?.trustSubprocessorsHtml !== html) throw new Error(`${slug}: læst tilbage ≠ skrevet`);
    console.log(`${slug}: ${src.rows.length} leverandører skrevet og læst tilbage (${html.length} tegn)`);
  }
}

if (process.argv[1]?.endsWith("trust-publish.ts")) main().catch((e) => { console.error(e); process.exit(1); });
