import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execSync, spawn } from "node:child_process";
import { homedir } from "node:os";

const VERSION = "0.2.4";
const REPO = "https://github.com/webhousecode/cms.git";
const CACHE_DIR = join(homedir(), ".webhouse", "cms-admin");
const VERSION_FILE = join(CACHE_DIR, ".version");

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const blue = (s: string) => `\x1b[34m${s}\x1b[0m`;

function log(msg: string) { console.log(msg); }

// ── Parse args ───────────────────────────────────────────────

const args = process.argv.slice(2);
let port = 3010;
let configPath = "";

for (let i = 0; i < args.length; i++) {
  if ((args[i] === "--port" || args[i] === "-p") && args[i + 1]) {
    port = parseInt(args[i + 1]!);
    i++;
  } else if (args[i] === "--config" && args[i + 1]) {
    configPath = resolve(args[i + 1]!);
    i++;
  } else if (args[i] === "--help" || args[i] === "-h") {
    log("");
    log(`  ${bold("@webhouse/cms-admin-cli")} — Run the CMS admin UI locally`);
    log("");
    log("  Usage:");
    log(`    npx @webhouse/cms-admin-cli [options]`);
    log("");
    log("  Options:");
    log(`    --port, -p <port>    Port to run on (default: 3010)`);
    log(`    --config <path>      Path to cms.config.ts`);
    log(`    --update             Force re-download and rebuild`);
    log(`    --help, -h           Show this help`);
    log("");
    log("  Examples:");
    log(`    ${dim("$")} npx @webhouse/cms-admin-cli`);
    log(`    ${dim("$")} npx @webhouse/cms-admin-cli --config ./cms.config.ts`);
    log(`    ${dim("$")} npx @webhouse/cms-admin-cli -p 4000`);
    log("");
    process.exit(0);
  } else if (args[i] === "--update") {
    // Force rebuild by removing version file
    try { require("node:fs").unlinkSync(VERSION_FILE); } catch {}
  }
}

// Auto-detect cms.config.ts in cwd
if (!configPath) {
  const localConfig = join(process.cwd(), "cms.config.ts");
  if (existsSync(localConfig)) {
    configPath = localConfig;
  }
}

// ── Ensure admin is cached ───────────────────────────────────

const cachedVersion = existsSync(VERSION_FILE)
  ? readFileSync(VERSION_FILE, "utf-8").trim()
  : null;

const needsBuild = cachedVersion !== VERSION;

if (needsBuild) {
  log("");
  log(`${blue("i")} Setting up CMS Admin v${VERSION}...`);
  log(`  ${dim("Cache: " + CACHE_DIR)}`);
  log("");

  mkdirSync(CACHE_DIR, { recursive: true });

  const repoDir = join(CACHE_DIR, "repo");

  if (existsSync(join(repoDir, ".git"))) {
    log(`${dim("  Updating repository...")}`);
    execSync("git fetch origin main && git reset --hard origin/main", {
      cwd: repoDir,
      stdio: "inherit",
    });
  } else {
    log(`${dim("  Cloning repository...")}`);
    execSync(`git clone --depth 1 --branch main ${REPO} ${repoDir}`, {
      stdio: "inherit",
    });
  }

  log(`${dim("  Installing dependencies...")}`);
  execSync("pnpm install --frozen-lockfile", {
    cwd: repoDir,
    stdio: "inherit",
  });

  log(`${dim("  Building @webhouse/cms...")}`);
  execSync("pnpm --filter @webhouse/cms build", {
    cwd: repoDir,
    stdio: "inherit",
  });

  log(`${dim("  Building CMS Admin...")}`);
  execSync("pnpm --filter @webhouse/cms-admin build", {
    cwd: repoDir,
    stdio: "inherit",
    env: {
      ...process.env,
      // Minimal env for build — actual config set at runtime
      CMS_CONFIG_PATH: configPath || "/dev/null",
    },
  });

  writeFileSync(VERSION_FILE, VERSION);
  log("");
  log(`${green("✓")} CMS Admin built and cached`);
}

// ── Start admin ──────────────────────────────────────────────

const adminDir = join(CACHE_DIR, "repo", "packages", "cms-admin");

log("");
log(`${green("✓")} Starting CMS Admin on ${bold(`http://localhost:${port}`)}`);
if (configPath) {
  log(`  ${dim("Config: " + configPath)}`);
}
log("");

const child = spawn("npx", ["next", "start", "-p", String(port)], {
  cwd: adminDir,
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port),
    HOSTNAME: "0.0.0.0",
    ...(configPath ? { CMS_CONFIG_PATH: configPath } : {}),
  },
});

child.on("exit", (code) => process.exit(code ?? 0));

// Forward signals
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
