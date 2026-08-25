/**
 * Asks npm whether any 0.x dependency has moved past what its range can reach.
 *
 * The other half of `frozen-deps.test.ts`. That test is offline on purpose —
 * it proves every ^0.x pin is a written decision, not that the decision is
 * still current. Only the registry knows that, and a test that needs the
 * network is one that goes red on a train and gets deleted.
 *
 *   npx tsx scripts/check-frozen-deps.ts
 *
 * Exits 1 when something is behind, so it can gate a release if we ever want
 * it to. Prints the whole picture either way.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const manifests = [path.join(root, "package.json")];
for (const entry of readdirSync(path.join(root, "packages"))) {
  const p = path.join(root, "packages", entry, "package.json");
  if (existsSync(p)) manifests.push(p);
}

const pins = new Map<string, { range: string; where: string[] }>();
for (const file of manifests) {
  const pkg = JSON.parse(readFileSync(file, "utf-8")) as Record<string, Record<string, string>>;
  for (const section of ["dependencies", "devDependencies"]) {
    for (const [name, range] of Object.entries(pkg[section] ?? {})) {
      if (!/^\^?0\./.test(range)) continue;
      const rel = path.relative(root, file).replace("/package.json", "") || ".";
      const seen = pins.get(name);
      if (seen) seen.where.push(rel);
      else pins.set(name, { range, where: [rel] });
    }
  }
}

let behind = 0;
for (const [name, { range, where }] of [...pins].sort()) {
  let latest = "?";
  try {
    // execFile, never a shell string — the name comes from a file on disk.
    latest = execFileSync("npm", ["view", name, "version"], { encoding: "utf-8", timeout: 40_000, stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    console.log(`  ?      ${name.padEnd(34)} ${range.padEnd(11)} (kunne ikke slås op)`);
    continue;
  }
  const ourMinor = range.replace("^", "").split(".")[1];
  const newMinor = latest.startsWith("0.") ? latest.split(".")[1] : null;
  // A newest that is no longer 0.x means the caret can never reach it at all.
  const frozen = newMinor === null ? true : ourMinor !== newMinor;
  if (frozen) behind++;
  console.log(
    `  ${frozen ? "LÅST " : "     "} ${name.padEnd(34)} ${range.padEnd(11)} → ${latest.padEnd(10)} ${where.join(", ")}`,
  );
}

console.log(
  behind === 0
    ? "\nIngen af dem står stille."
    : `\n${behind} står stille. Et ^0.x-interval låser MINOREN — de flytter sig aldrig af sig selv.`,
);
process.exit(behind === 0 ? 0 : 1);
