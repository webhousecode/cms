/**
 * Security W43 — HIGH findings still open/partial after the W41 round
 * (re-checked against HEAD ac57fca6). One test per door.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { stripSecretsForNonAdmin } from "../site-config-redact";

const root = path.join(__dirname, "..", "..");
const src = (p: string) => readFileSync(path.join(root, p), "utf8");

describe("NY-HØJ-A — site-file cannot be pointed at another origin", () => {
  const route = src("app/api/site-file/[...path]/route.ts");
  it("refuses a backslash segment (%5Cevil.example)", () => expect(route).toMatch(/s\.includes\("\\\\"\)/));
  it("requires the upstream to stay on the preview origin, follows no redirect, never trusts upstream content-type", () => {
    expect(route).toMatch(/upstream\.origin !== base\.origin/);
    expect(route).toMatch(/redirect: "manual"/);
    expect(route).not.toMatch(/res\.headers\.get\("content-type"\)/);
    expect(route).toMatch(/"Content-Security-Policy": "sandbox"/);
  });
  it("the URL trick it closes is real", () => {
    expect(new URL("/\\evil.example/x.html", "https://site.example/").origin).toBe("https://evil.example");
  });
});

describe("NY-HØJ-B — chat memory needs chat.use, not mere membership", () => {
  const dir = path.join(root, "app/api/cms/chat/memory");
  const routes: string[] = [];
  const walk = (d: string) => { for (const f of readdirSync(d)) { const p = path.join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f === "route.ts") routes.push(p); } };
  walk(dir);
  it("finds the memory routes", () => expect(routes.length).toBeGreaterThanOrEqual(6));
  it("every handler checks chat.use", () => {
    for (const r of routes) {
      const s = readFileSync(r, "utf8");
      const handlers = (s.match(/export async function (GET|POST|PATCH|DELETE|PUT)/g) ?? []).length;
      expect((s.match(/requirePermission\("chat\.use"\)/g) ?? []).length, r).toBeGreaterThanOrEqual(handlers);
    }
  });
});

describe("H3 — webhook lists and URLs are secrets for non-admins", () => {
  it("strips every *Webhooks list and *WebhookUrl", () => {
    const cfg: Record<string, unknown> = {
      backupWebhooks: [{ id: "1", url: "https://discord.com/api/webhooks/x/y" }], deployWebhooks: [], schedulerWebhookUrl: "https://x",
      contentWebhooks: [], siteName: "keep",
    };
    stripSecretsForNonAdmin(cfg);
    expect(cfg).toEqual({ siteName: "keep" });
  });
});

describe("H4 — HTML on the admin domain runs in an opaque origin", () => {
  it("interactive and site previews carry a sandbox CSP", () => {
    expect(src("app/api/interactives/[id]/preview/route.ts")).toMatch(/"Content-Security-Policy": "sandbox allow-scripts/);
    expect(src("app/api/preview-site/[...path]/route.ts")).toMatch(/"Content-Security-Policy": "sandbox allow-scripts/);
  });
  it("no editor iframe grants scripts AND the admin origin", () => {
    for (const f of ["app/admin/(workspace)/interactives/page.tsx", "app/admin/(workspace)/interactives/[id]/page.tsx", "app/admin/(workspace)/media/page.tsx", "components/chat/artifact-card.tsx", "components/editor/htmldoc-editor.tsx"]) {
      expect(src(f), f).not.toMatch(/allow-scripts allow-same-origin|allow-same-origin allow-scripts/);
    }
  });
});

describe("H6 — the inline-edit token cannot touch login settings", () => {
  it("the proxy refuses an editSession cookie under /api/auth/ (except me)", () => {
    expect(src("proxy.ts")).toMatch(/pathname\.startsWith\("\/api\/auth\/"\) && pathname !== "\/api\/auth\/me"[\s\S]{0,400}payload\.editSession === true/);
  });
});

describe("H9 — the self-host kit ships no known secret", () => {
  const zip = src("app/api/admin/deploy/download-zip/route.ts");
  it("no changeme, no empty JWT secret, not bound to every interface", () => {
    expect(zip).not.toMatch(/ADMIN_PASSWORD=changeme|ADMIN_PASSWORD:-changeme/);
    expect(zip).toMatch(/CMS_JWT_SECRET=\$\{randomBytes\(32\)/);
    expect(zip).toMatch(/"127\.0\.0\.1:3010:3010"/);
  });
  it("first boot never creates an admin with the old default", () => {
    expect(src("instrumentation-node.ts")).toMatch(/given !== "changeme"/);
  });
});

describe("NY-H1 — gitleaks knows our own tokens", () => {
  it("has a wh_ rule", () => {
    expect(readFileSync(path.join(root, "../../../.gitleaks.toml"), "utf8")).toMatch(/wh_\[a-f0-9\]\{64\}/);
  });
});
