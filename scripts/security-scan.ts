#!/usr/bin/env npx tsx
/**
 * F67 — Custom CMS Security Scanner
 *
 * Checks CMS-specific security rules:
 * 1. API routes without authentication
 * 2. Missing role checks on write endpoints
 * 3. execSync/exec usage (command injection risk)
 * 4. Path traversal patterns (path.join with user input without containment)
 * 5. NEXT_PUBLIC_ secret exposure
 *
 * Usage: npx tsx scripts/security-scan.ts
 */
import { readdir, readFile } from "fs/promises";
import { join, relative, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface Finding {
  severity: "critical" | "high" | "medium" | "info";
  rule: string;
  file: string;
  line: number;
  message: string;
  suggestion?: string;
}

const ROOT = join(__dirname, "..");
const API_DIR = join(ROOT, "packages/cms-admin/src/app/api");
const findings: Finding[] = [];

async function walkDir(dir: string): Promise<string[]> {
  const files: string[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
        files.push(...await walkDir(full));
      } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
        files.push(full);
      }
    }
  } catch { /* skip inaccessible dirs */ }
  return files;
}

// Rule 1: API routes without authentication
async function checkApiAuth() {
  const routeFiles = (await walkDir(API_DIR)).filter((f) => f.endsWith("route.ts"));

  for (const file of routeFiles) {
    const content = await readFile(file, "utf-8");
    const rel = relative(ROOT, file);

    // Skip auth routes themselves
    if (rel.includes("api/auth/")) continue;

    // Check if route has any auth pattern
    const hasAuth =
      content.includes("getSiteRole") ||
      content.includes("getSessionUser") ||
      content.includes("getSession") ||
      content.includes("X-CMS-Service-Token") ||
      content.includes("requireRole") ||
      content.includes("requireAuth") ||
      content.includes("verifyToken") ||
      content.includes("jwt");

    // All /api/* routes are now middleware-protected (proxy.ts matcher: /api/:path*)
    // Only routes in PUBLIC_PREFIXES bypass middleware (auth, mcp, publish-scheduled)
    const isMiddlewareProtected = rel.includes("/api/");
    const isPublicRoute =
      rel.includes("api/auth/") ||
      rel.includes("api/mcp/") ||
      rel.includes("api/publish-scheduled");

    if (!hasAuth && !isMiddlewareProtected) {
      findings.push({
        severity: "high",
        rule: "cms/unauthed-route",
        file: rel,
        line: 1,
        message: "API route has no authentication check and is not under middleware-protected path",
        suggestion: "Add getSiteRole() or getSessionUser() check, or move under /api/",
      });
    }

    // Public routes that bypass middleware should have their own auth
    if (isPublicRoute && !hasAuth) {
      findings.push({
        severity: "medium",
        rule: "cms/public-route-no-auth",
        file: rel,
        line: 1,
        message: "Public API route (bypasses middleware) — ensure it has its own authentication",
        suggestion: "MCP routes should verify Bearer token, publish-scheduled should verify service token",
      });
    }

    // Rule 2: Write endpoints (POST/PUT/DELETE/PATCH) without role check
    const hasWriteMethod = /export\s+async\s+function\s+(POST|PUT|DELETE|PATCH)\b/.test(content);
    const hasRoleCheck = content.includes("getSiteRole") || content.includes("role === \"viewer\"") || content.includes("requireRole");

    if (hasWriteMethod && !hasRoleCheck && isMiddlewareProtected) {
      findings.push({
        severity: "medium",
        rule: "cms/missing-role-check",
        file: rel,
        line: (content.match(/export\s+async\s+function\s+(POST|PUT|DELETE|PATCH)/)?.index ?? 0) + 1,
        message: "Write endpoint (POST/PUT/DELETE/PATCH) has no role check — viewers could modify data",
        suggestion: "Add: const role = await getSiteRole(); if (!role || role === 'viewer') return 403",
      });
    }
  }
}

// Rule 3: execSync/exec usage
async function checkCommandInjection() {
  const files = await walkDir(join(ROOT, "packages/cms-admin/src"));

  for (const file of files) {
    const content = await readFile(file, "utf-8");
    const rel = relative(ROOT, file);
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (line.includes("execSync(") || line.includes("exec(")) {
        // Check if using string concatenation (dangerous) vs array args (safe)
        if (line.includes("execSync(`") || line.includes("execSync(\"") || line.includes("execSync('")) {
          findings.push({
            severity: "high",
            rule: "cms/command-injection",
            file: rel,
            line: i + 1,
            message: "execSync with string interpolation — potential command injection",
            suggestion: "Use execFileSync(cmd, [args]) instead — no shell, no injection",
          });
        }
      }
    }
  }
}

// Rule 4: Path traversal patterns
async function checkPathTraversal() {
  const files = await walkDir(join(ROOT, "packages/cms-admin/src/app/api"));

  for (const file of files) {
    const content = await readFile(file, "utf-8");
    const rel = relative(ROOT, file);
    const lines = content.split("\n");

    // Check for path.join with URL/query params without containment check
    const hasPathJoin = content.includes("path.join") || content.includes("join(");
    const hasQueryParam = content.includes("searchParams") || content.includes("request.url") || content.includes("query");
    const hasContainment = content.includes("startsWith(") && (content.includes("uploadDir") || content.includes("projectDir"));

    if (hasPathJoin && hasQueryParam && !hasContainment) {
      findings.push({
        severity: "medium",
        rule: "cms/path-traversal",
        file: rel,
        line: 1,
        message: "File path from user input without containment check — potential path traversal",
        suggestion: "Add: if (!resolvedPath.startsWith(baseDir + '/')) return 400",
      });
    }
  }
}

// Rule 5: NEXT_PUBLIC_ secret exposure
async function checkPublicSecrets() {
  const envFiles = [".env", ".env.local", ".env.production"].map((f) => join(ROOT, f));

  for (const envFile of envFiles) {
    try {
      const content = await readFile(envFile, "utf-8");
      const rel = relative(ROOT, envFile);
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (/^NEXT_PUBLIC_.*(?:KEY|SECRET|TOKEN|PASSWORD|PRIVATE)/i.test(line)) {
          findings.push({
            severity: "critical",
            rule: "env/public-secret",
            file: rel,
            line: i + 1,
            message: `Secret exposed via NEXT_PUBLIC_ prefix: ${line.split("=")[0]}`,
            suggestion: "Remove NEXT_PUBLIC_ prefix — secrets must not be sent to the browser",
          });
        }
      }
    } catch { /* file doesn't exist */ }
  }
}

// Run all checks
async function main() {
  console.log("Security Gate — CMS Security Scan");
  console.log("═".repeat(50));

  await checkApiAuth();
  await checkCommandInjection();
  await checkPathTraversal();
  await checkPublicSecrets();

  // Sort by severity
  const order: Record<string, number> = { critical: 0, high: 1, medium: 2, info: 3 };
  findings.sort((a, b) => order[a.severity]! - order[b.severity]!);

  // Report
  const critical = findings.filter((f) => f.severity === "critical").length;
  const high = findings.filter((f) => f.severity === "high").length;
  const medium = findings.filter((f) => f.severity === "medium").length;
  const info = findings.filter((f) => f.severity === "info").length;

  console.log();
  console.log(`  Critical: ${critical}`);
  console.log(`  High:     ${high}`);
  console.log(`  Medium:   ${medium}`);
  console.log(`  Info:     ${info}`);
  console.log();

  if (findings.length === 0) {
    console.log("No security issues found.");
    return;
  }

  for (const f of findings) {
    const icon = f.severity === "critical" ? "!!!" : f.severity === "high" ? "!!" : f.severity === "medium" ? "!" : "i";
    console.log(`  [${icon}] ${f.severity.toUpperCase()} ${f.rule}`);
    console.log(`      ${f.file}:${f.line}`);
    console.log(`      ${f.message}`);
    if (f.suggestion) console.log(`      Fix: ${f.suggestion}`);
    console.log();
  }

  console.log(`${findings.length} finding(s) total.`);

  if (critical > 0 || high > 0) {
    process.exit(1);
  }
}

main().catch(console.error);
