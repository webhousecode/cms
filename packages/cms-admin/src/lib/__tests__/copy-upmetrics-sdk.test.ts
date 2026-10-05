/**
 * F207.3 — the static landing page (public/home.html) gets analytics through a
 * build-time copy of the installed @upmetrics/sdk plus a generated boot.js.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { copyUpmetricsSdk } from "../../../scripts/copy-upmetrics-sdk.mjs";

const ADMIN = path.resolve(__dirname, "../../..");
const SDK = path.join(ADMIN, "node_modules", "@upmetrics", "sdk", "dist");

let root = "";
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "um-copy-"));
  mkdirSync(path.join(root, "node_modules", "@upmetrics", "sdk"), { recursive: true });
  cpSync(SDK, path.join(root, "node_modules", "@upmetrics", "sdk", "dist"), { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const out = (f: string) => path.join(root, "public", "vendor", "upmetrics", f);

describe("copy-upmetrics-sdk", () => {
  it("copies the installed SDK and boots it with the build's DSN", () => {
    const dsn = "https://key@upmetrics.org/cms";
    copyUpmetricsSdk(root, { NEXT_PUBLIC_UPMETRICS_DSN: dsn, NODE_ENV: "production" });
    expect(existsSync(out("index.js"))).toBe(true);
    expect(existsSync(out("analytics.js"))).toBe(true);
    const boot = readFileSync(out("boot.js"), "utf-8");
    expect(boot).toContain('import { init } from "./index.js"');
    expect(boot).toContain(`const dsn = ${JSON.stringify(dsn)};`);
  });

  it("ships dark without a DSN — boot.js calls nothing", () => {
    copyUpmetricsSdk(root, {} as NodeJS.ProcessEnv);
    expect(readFileSync(out("boot.js"), "utf-8")).toContain('const dsn = "";');
  });
});

describe("home.html", () => {
  it("loads boot.js from our own domain", () => {
    const html = readFileSync(path.join(ADMIN, "public", "home.html"), "utf-8");
    expect(html).toContain('<script type="module" src="/vendor/upmetrics/boot.js"></script>');
  });
});
