// F207.3 — webhouse.app's landing page (public/home.html) is plain HTML outside
// the Next app, so it never ran UpmetricsProvider and sent no analytics. Same
// pattern as copy-consent-element.mjs: copy the installed @upmetrics/sdk ESM
// files to public/vendor/upmetrics at build (never a committed copy, which would
// drift from the pinned version), plus a boot.js that calls init().
//
// The DSN comes from NEXT_PUBLIC_UPMETRICS_DSN — the same build-time value the
// Next app inlines — so there is one source. No DSN → boot.js does nothing.
// Runs as prebuild/predev.
import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function copyUpmetricsSdk(root, env = process.env) {
  const src = join(root, "node_modules", "@upmetrics", "sdk", "dist");
  const dest = join(root, "public", "vendor", "upmetrics");

  // index.js imports its siblings by relative path, so ship every ESM file.
  const files = readdirSync(src).filter((f) => f.endsWith(".js"));
  if (!files.includes("index.js")) throw new Error(`upmetrics: index.js not found in ${src}`);

  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  for (const f of files) cpSync(join(src, f), join(dest, f));

  const dsn = env.NEXT_PUBLIC_UPMETRICS_DSN ?? "";
  writeFileSync(
    join(dest, "boot.js"),
    `import { init } from "./index.js";\n` +
      `const dsn = ${JSON.stringify(dsn)};\n` +
      `if (dsn) init({ dsn, environment: ${JSON.stringify(env.NODE_ENV ?? "production")}, release: "cms-admin-home" });\n`,
  );
  return { files: files.length, dsn: dsn !== "" };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = copyUpmetricsSdk(join(dirname(fileURLToPath(import.meta.url)), ".."));
  console.log(`[upmetrics] copied ${r.files} file(s) to public/vendor/upmetrics (dsn ${r.dsn ? "set" : "missing — boot.js is inert"})`);
}
