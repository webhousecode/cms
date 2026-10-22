import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { execFileSync } from "node:child_process";

/**
 * F210.3 — what the user SEES is called by the brand's name, not "webhouse".
 *
 * On cms.fysio.work every visible "webhouse.app" or "Powered by @webhouse/cms"
 * tells a clinic owner the product is someone else's. On webhouse.app the
 * brand name and the literal read the same, so nothing else would notice.
 *
 * Scans the admin's .tsx files on disk (a file added tomorrow is covered) for
 * lines that mention webhouse outside comments, imports, URLs and code
 * identifiers. Each remaining line must either read the brand (useBrand) or be
 * listed below as deliberate, with the reason. Standalone HTML, mails and API
 * texts are F210.4 and live in .ts files, which this does not scan.
 */

const SRC = join(process.cwd(), "src");

/** Not user-facing text: comments, imports, type imports, URLs, a User-Agent, asset/file paths. */
const NOT_TEXT = [
  /^\s*(\/\/|\*|\/\*|\{\/\*)/,
  /\bimport\b|from "/,
  /https?:\/\/[^"'` ]*webhouse/,
  /User-Agent/,
  /\.svg|webhouse-schema\.json/,
];

/** Deliberate: the line keeps "webhouse" on purpose. file → substring → reason. */
const DELIBERATE: Array<[file: string, needle: string, reason: string]> = [
  ["components/powered-by.tsx", "{\"@webhouse/cms\"}", "rendered on webhouse's own brand only — returns null for a customer brand"],
  ["components/settings/webhook-list.tsx", "Test from webhouse.app", "outgoing webhook payload; must match lib/webhook-dispatch.ts, which moves in F210.4"],
  ["components/settings/webhook-list.tsx", "*webhouse.app*", "same — outgoing webhook payload, F210.4"],
  ["components/settings/webhook-list.tsx", "source: \"webhouse.app\"", "same — outgoing webhook payload, F210.4"],
  ["components/chat/chat-interface.tsx", "webhouse-chat-export-", "export file name; the server route decides it and moves with the export in F210.4"],
  ["components/help-drawer.tsx", "mailto:cms@webhouse.dk", "support address — fysio.work's own support is not decided yet; the label reads 'Contact support'"],
  ["components/agents-tabs.tsx", "webhousecode/cms-agents", "a GitHub repository name, shown as code"],
  ["components/settings/deploy-settings-panel.tsx", ".webhouse.app`", "the hosting domain sites are actually published under"],
  ["components/deploy-wizard/step-deploy.tsx", "admin@webhouse.app", "the deploy wizard installs a self-hosted @webhouse/cms; its default admin login"],
  ["components/deploy-wizard/step-configure.tsx", "webhouse-docker-", "file name of the self-hosted @webhouse/cms bundle"],
  ["app/admin/(auth)/login/page.tsx", "webhouse.app mobile app", "the mobile app is named webhouse.app (one app, not per brand — F210 non-goal)"],
  ["app/admin/(workspace)/account/mobile-pairing/page.tsx", "webhouse.app mobile app", "same — the mobile app's name"],
];

/**
 * F211.2 moved visible text out of the .tsx files into the message catalog, so
 * the scan above no longer sees it. Every catalog text that says "webhouse" is
 * listed here with its reason; a new one fails until it reads the brand
 * ({brand} placeholder) or is added with a reason.
 */
const CATALOG_DIR = join(SRC, "i18n", "messages", "en");
const DELIBERATE_KEYS: Array<[key: string, reason: string]> = [
  ["auth.login.qrHint", "the mobile app is named webhouse.app (one app, not per brand — F210 non-goal)"],
  ["tools.mobilePairing.step1", "same — the mobile app's name"],
  ["tools.mobilePairing.intro", "same — the mobile app's name"],
  ["tools.account.mobileIntro", "same — the mobile app's name"],
  ["misc.deployWizard.configure.adminEmailPlaceholder", "the deploy wizard installs a self-hosted @webhouse/cms; its default admin login"],
  ["settings.general.downloadedSchema", "the schema file's name, webhouse-schema.json"],
];

function catalogTexts(): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (prefix: string, node: unknown) => {
    if (typeof node === "string") out.set(prefix, node);
    else if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) walk(`${prefix}.${k}`, v);
  };
  for (const f of execFileSync("find", [CATALOG_DIR, "-name", "*.json"], { encoding: "utf8" }).split("\n").filter(Boolean)) {
    walk(relative(CATALOG_DIR, f).replace(/\.json$/, ""), JSON.parse(readFileSync(f, "utf8")));
  }
  return out;
}

function tsxFiles(): string[] {
  const out = execFileSync("find", [join(SRC, "components"), join(SRC, "app"), "-type", "f", "-name", "*.tsx"], { encoding: "utf8" });
  return out.split("\n").filter(Boolean).filter((f) => !f.includes("__tests__"));
}

describe("F210.3 — the visible product name follows the brand", () => {
  const files = tsxFiles();

  it("enumerates the real tree (a broken find must not pass as clean)", () => {
    expect(files.length).toBeGreaterThan(150);
  });

  it("no admin screen writes 'webhouse' where the brand's name belongs", () => {
    const offenders: string[] = [];
    for (const abs of files) {
      const rel = relative(SRC, abs);
      readFileSync(abs, "utf8").split("\n").forEach((line, i) => {
        if (!/webhouse/i.test(line)) return;
        if (NOT_TEXT.some((re) => re.test(line))) return;
        if (DELIBERATE.some(([f, needle]) => f === rel && line.includes(needle))) return;
        offenders.push(`${rel}:${i + 1}  ${line.trim().slice(0, 110)}`);
      });
    }
    expect(offenders, `read the name from useBrand(), or add it to DELIBERATE with a reason:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("every deliberate entry still matches a line (a stale allowance hides nothing)", () => {
    const stale = DELIBERATE.filter(([f, needle]) => !readFileSync(join(SRC, f), "utf8").includes(needle));
    expect(stale.map(([f, n]) => `${f}: ${n}`)).toEqual([]);
  });

  it("no catalog text says 'webhouse' where the brand's name belongs", () => {
    const texts = catalogTexts();
    expect(texts.size).toBeGreaterThan(1000);
    const offenders = [...texts].filter(([k, v]) => /webhouse/i.test(v) && !DELIBERATE_KEYS.some(([d]) => d === k)).map(([k, v]) => `${k}  ${v.slice(0, 110)}`);
    expect(offenders, `use a {brand} placeholder, or add the key to DELIBERATE_KEYS with a reason:\n${offenders.join("\n")}`).toEqual([]);
    const stale = DELIBERATE_KEYS.filter(([k]) => !/webhouse/i.test(texts.get(k) ?? ""));
    expect(stale.map(([k]) => k)).toEqual([]);
  });
});
