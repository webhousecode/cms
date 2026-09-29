// F203.3 — webhouse.app's landing page (public/home.html) is plain HTML, so the
// shared cookie banner has to be served as a script from our OWN domain, never
// a CDN. Copy the element bundle out of the installed @broberg/consent-cookie
// at build time rather than committing a copy: a committed copy drifts from the
// pinned version the first time the package is bumped. Runs as prebuild/predev.
import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "@broberg", "consent-cookie", "dist");
const dest = join(root, "public", "vendor", "consent-cookie");

// element.js imports a shared chunk by relative path, so ship every ESM file.
const files = readdirSync(src).filter((f) => f.endsWith(".js"));
if (!files.includes("element.js")) throw new Error(`consent-cookie: element.js not found in ${src}`);

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
for (const f of files) cpSync(join(src, f), join(dest, f));
console.log(`[consent-cookie] copied ${files.length} file(s) to public/vendor/consent-cookie`);
