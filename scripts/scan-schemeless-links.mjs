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
 *   node scripts/scan-schemeless-links.mjs --self-test   # the predicate can see a fault
 *   node scripts/scan-schemeless-links.mjs --prove       # the SCAN can, on real data
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
//
// The BUILT bundle first, the TypeScript source second. Importing the .ts
// directly needs Node's type stripping, which is only on by default from
// 22.18 — and this package declares engines >=22, so a colleague pinned to
// 22.14 got ERR_UNKNOWN_FILE_EXTENSION instead of a scan.
const PKG = "../packages/cms-inline-edit";
let extractLinkTargets, isSchemeless;
try {
  ({ extractLinkTargets, isSchemeless } = await import(`${PKG}/dist/index.js`));
} catch {
  try {
    ({ extractLinkTargets, isSchemeless } = await import(`${PKG}/src/link-target.ts`));
  } catch (e) {
    console.error("✗ Kan ikke indlæse adresse-klassifikationen fra @broberg/cms-inline-edit.");
    console.error(`  Byg pakken først:  (cd packages/cms-inline-edit && npm run build)`);
    console.error(`  eller kør med Node ≥ 22.18 (type-stripping). Årsag: ${e.message}`);
    process.exit(2);
  }
}

/**
 * Visit every string, handing the visitor the PARENT and KEY as well as the
 * value. Re-deriving the parent by splitting a dotted path broke on any key
 * containing "." (a locale map like `da.DK`, an i18n key, `seo.title`) — and
 * broke silently, leaving the plant unplaced.
 */
function walkStrings(node, path, visit, parent, key) {
  if (typeof node === "string") return visit(node, path, parent, key);
  if (Array.isArray(node)) return node.forEach((v, i) => walkStrings(v, `${path}[${i}]`, visit, node, i));
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) walkStrings(v, path ? `${path}.${k}` : k, visit, node, k);
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

  // --prove: the positive control on REAL data. The self-test proves the
  // PREDICATE works on a fixture; it says nothing about whether this scan walks
  // to the field an editor actually writes in. So plant a known-bad link into
  // every fetched document IN MEMORY (nothing is written anywhere) and require
  // the scan to find every one of them. A green check that has never been red
  // on real content closes the question without answering it.
  const prove = process.argv.includes("--prove");
  const PLANT = "[kontrol](kontrol-plantet.example)";

  const findings = [];
  let docsScanned = 0;
  let linksSeen = 0;
  let planted = 0;
  let plantsFound = 0;
  let unread = 0;

  for (const site of targets) {
    let cols = [];
    try {
      const schema = await api(`/api/schema?site=${site}`);
      cols = (schema.collections ?? []).map((c) => c.name ?? c.slug).filter(Boolean);
    } catch (e) { console.error(`  ! ${site}: skema utilgængeligt (${e.message})`); continue; }

    for (const col of cols) {
      let docs;
      try {
        docs = await api(`/api/cms/${col}?site=${site}`);
      } catch (e) {
        // NOT silent. A collection we could not read is indistinguishable from
        // an empty one, and the run would still print the all-clear — the exact
        // failure this script's own header warns about. It is also invisible to
        // --prove, since a collection never fetched plants nothing.
        console.error(`  ! ${site}/${col}: kunne ikke læses (${e.message}) — IKKE scannet`);
        unread++;
        continue;
      }
      if (!Array.isArray(docs)) {
        console.error(`  ! ${site}/${col}: uventet svar-form — IKKE scannet`);
        unread++;
        continue;
      }
      for (const doc of docs) {
        docsScanned++;
        const data = doc.data ?? doc;
        if (prove) {
          // EVERY string field, not the first one. The first is usually a
          // shallow scalar — a title, a slug, a date — so a walker that failed
          // only on nested block arrays would still return every plant, and the
          // script would print that it reaches "the field the editor writes in"
          // while never having gone near one.
          const targets = [];
          walkStrings(data, "", (str, _path, parent, key) => {
            if (parent !== undefined && key !== undefined) targets.push([parent, key, str]);
          });
          for (const [parent, key, str] of targets) {
            parent[key] = `${str}\n\n${PLANT}`;
            planted++;
          }
        }
        walkStrings(data, "", (str, path) => {
          for (const t of extractLinkTargets(str)) {
            if (t.value === "kontrol-plantet.example") { plantsFound++; continue; }
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
  if (unread) {
    console.error(`\n\u2717 ${unread} samling(er) kunne IKKE l\u00e6ses. Et nul herunder d\u00e6kker ikke dem.`);
    process.exitCode = 1;
  }
  if (prove) {
    console.log(`Positiv kontrol: ${planted} plantet i ${docsScanned} dokumenter, ${plantsFound} fundet.`);
    if (planted === 0 || plantsFound !== planted) {
      console.error("\n\u2717 Kontrollen fejlede \u2014 scanningen n\u00e5r ikke frem til det felt redakt\u00f8ren skriver i.");
      console.error("  Et nul fra denne scanning betyder derfor ingenting.");
      process.exit(1);
    }
    console.log("\u2713 Scanningen n\u00e5r frem til indholdet. Et nul herunder er et resultat.");
  }
  if (!findings.length) { console.log("✓ Ingen adresser uden skema."); return; }
  console.log(`\n✗ ${findings.length} adresse(r) uden skema — browseren læser dem som en side på sitet:\n`);
  for (const f of findings) {
    console.log(`  ${f.site}/${f.col}/${f.slug}  ${f.path} (${f.syntax})`);
    console.log(`      ${f.value}`);
  }
}

if (process.argv.includes("--self-test")) selfTest();
else scan().catch((e) => { console.error(e); process.exit(1); });
