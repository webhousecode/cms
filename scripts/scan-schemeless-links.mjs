#!/usr/bin/env node
/**
 * Find links in STORED content whose address has no scheme and no leading "/".
 *
 * `<a href="www.trailmem.com">` is valid HTML and renders as a working, styled
 * link — the browser just resolves it RELATIVE to the current page, so it lands
 * on /some/article/www.trailmem.com. Nothing about the markup looks wrong; only
 * following the link reveals it. That is why this has to be scanned for rather
 * than noticed.
 *
 *   node scripts/scan-schemeless-links.mjs --self-test   # prove the scan can see a fault
 *   node scripts/scan-schemeless-links.mjs               # scan every site
 *   node scripts/scan-schemeless-links.mjs --site=broberg-ai
 *
 * Auth: CMS_ADMIN_TOKEN (Bearer). Base: CMS_BASE (default https://webhouse.app).
 */

const BASE = process.env.CMS_BASE || "https://webhouse.app";
const TOKEN = process.env.CMS_ADMIN_TOKEN;

// ONE source for what counts as a doubtful address: the same functions the
// editor's link dialog uses. Two copies drift, and then this reports a clean
// site that the editor is still producing dead links on.
import { extractLinkTargets, isSchemeless } from "../packages/cms-inline-edit/src/link-target.ts";

function walkStrings(node, path, visit) {
  if (typeof node === "string") return visit(node, path);
  if (Array.isArray(node)) return node.forEach((v, i) => walkStrings(v, `${path}[${i}]`, visit));
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) walkStrings(v, path ? `${path}.${k}` : k, visit);
  }
}

// ---------------------------------------------------------------- self-test
// A scan that reports "0 problems" and a scan that cannot see a problem look
// exactly the same from the outside. This separates them BEFORE any real run.
function selfTest() {
  const shouldFlag = [
    'i <a href="www.trailmem.com">Trail</a> dag',
    "se [Trail](www.trailmem.com) her",
    '<a href="example.com/side">x</a>',
    "[dok](docs/kom-i-gang.md)",
  ];
  const shouldPass = [
    '<a href="https://www.trailmem.com">Trail</a>',
    "[Trail](https://www.trailmem.com)",
    '<a href="/flagskibe/trail">x</a>',
    "[kontakt](#kontakt)",
    '<a href="mailto:cb@webhouse.dk">mail</a>',
    '<a href="tel:+4512345678">ring</a>',
    '<a href="//cdn.example.com/x">proto-relativ</a>',
    "![billede](uploads/foto.jpg)", // relative IMAGE src is fine, must not flag
    "ingen links her overhovedet",
  ];
  let bad = 0;
  for (const s of shouldFlag) {
    const hit = extractLinkTargets(s).some((t) => isSchemeless(t.value));
    if (!hit) { console.error(`  MISSED (skulle flages): ${s}`); bad++; }
  }
  for (const s of shouldPass) {
    const hit = extractLinkTargets(s).some((t) => isSchemeless(t.value));
    if (hit) { console.error(`  FALSK POSITIV: ${s}`); bad++; }
  }
  if (bad) { console.error(`\n✗ self-test: ${bad} fejl — scanningen kan ikke stoles på.`); process.exit(1); }
  console.log(`✓ self-test: ${shouldFlag.length} fanget, ${shouldPass.length} korrekt ignoreret.`);
}

// ---------------------------------------------------------------- live scan
async function api(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

async function scan() {
  if (!TOKEN) {
    console.error("✗ CMS_ADMIN_TOKEN mangler — scanningen kan ikke måle noget. Afbryder.");
    process.exit(2);
  }
  const only = process.argv.find((a) => a.startsWith("--site="))?.split("=")[1];
  const reg = await api("/api/cms/registry");
  const sites = (reg.registry?.orgs ?? []).flatMap((o) => o.sites ?? []).map((s) => s.id);
  const targets = only ? sites.filter((s) => s === only) : sites;
  if (!targets.length) { console.error(`✗ ingen sites (only=${only ?? "-"})`); process.exit(2); }

  const findings = [];
  let docsScanned = 0;
  let linksSeen = 0;

  for (const site of targets) {
    let cols = [];
    try {
      const schema = await api(`/api/schema?site=${site}`);
      cols = (schema.collections ?? []).map((c) => c.name ?? c.slug).filter(Boolean);
    } catch (e) { console.error(`  ! ${site}: skema utilgængeligt (${e.message})`); continue; }

    for (const col of cols) {
      let docs;
      try { docs = await api(`/api/cms/${col}?site=${site}`); } catch { continue; }
      if (!Array.isArray(docs)) continue;
      for (const doc of docs) {
        docsScanned++;
        walkStrings(doc.data ?? doc, "", (str, path) => {
          for (const t of extractLinkTargets(str)) {
            linksSeen++;
            if (isSchemeless(t.value)) {
              findings.push({ site, col, slug: doc.slug ?? doc.id ?? "?", path, ...t });
            }
          }
        });
      }
    }
    console.log(`  · ${site}: ${cols.length} samlinger`);
  }

  console.log(`\nScannet: ${docsScanned} dokumenter, ${linksSeen} links, ${targets.length} sites.`);
  if (!findings.length) { console.log("✓ Ingen adresser uden skema."); return; }
  console.log(`\n✗ ${findings.length} adresse(r) uden skema — browseren læser dem som en side på sitet:\n`);
  for (const f of findings) {
    console.log(`  ${f.site}/${f.col}/${f.slug}  ${f.path} (${f.syntax})`);
    console.log(`      ${f.value}`);
  }
}

if (process.argv.includes("--self-test")) selfTest();
else scan().catch((e) => { console.error(e); process.exit(1); });
