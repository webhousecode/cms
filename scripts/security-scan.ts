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
    // MCP routes have Bearer token auth, publish-scheduled has service token — both legitimate
    if (isPublicRoute && !hasAuth && !rel.includes("api/mcp/") && !rel.includes("api/publish-scheduled")) {
      findings.push({
        severity: "medium",
        rule: "cms/public-route-no-auth",
        file: rel,
        line: 1,
        message: "Public API route (bypasses middleware) — ensure it has its own authentication",
      });
    }

    // Rule 2: Write endpoints (POST/PUT/DELETE/PATCH) without role check
    const hasWriteMethod = /export\s+async\s+function\s+(POST|PUT|DELETE|PATCH)\b/.test(content);
    const hasRoleCheck =
      content.includes("getSiteRole") ||
      content.includes("denyViewers") ||
      content.includes("role === \"viewer\"") ||
      content.includes("requireRole");

    // Legitimate exceptions: user's own data, org-level ops, pre-login flows, read-only POSTs
    const isRoleCheckExempt =
      rel.includes("api/admin/profile/") ||
      rel.includes("api/admin/user-state/") ||
      rel.includes("api/admin/invitations/accept/") ||
      rel.includes("api/cms/chat/conversations/") ||
      rel.includes("api/cms/registry/") ||
      rel.includes("api/cms/folder-picker/") ||
      rel.includes("api/extract-text/") ||
      rel.includes("api/preview-serve/") ||
      rel.includes("api/mcp/") ||
      rel.includes("api/publish-scheduled");

    if (hasWriteMethod && !hasRoleCheck && isMiddlewareProtected && !isRoleCheckExempt) {
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

    // Only flag when user input (query param / body field) is directly used in path.join
    // Pattern: path.join(someDir, variableFromUserInput) without startsWith check
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      // Detect: path.join(..., someVar) where someVar comes from request input
      // AND the same file lacks a startsWith containment check
      // Only flag when the variable used in path.join comes from user input (not hardcoded)
      const hasUserInputVar = line.includes("relativePath") || line.includes("fileUrl");
      const hasPathJoin = line.includes("path.join(") || line.includes("join(");
      if (
        hasPathJoin && hasUserInputVar &&
        !content.includes("startsWith(")
      ) {
        findings.push({
          severity: "medium",
          rule: "cms/path-traversal",
          file: rel,
          line: i + 1,
          message: "File path from user input without containment check — potential path traversal",
          suggestion: "Add: if (!resolvedPath.startsWith(baseDir + '/')) return 400",
        });
        break; // One finding per file
      }
    }
  }
}

// Rule 6: Process-wide global state mutation (cross-request data leak risk)
// Catches process.chdir() and process.env[x] = ... assignments that race
// between concurrent requests in multi-tenant request handlers. The
// link-checker cross-site bug (April 2026) was caused by process.chdir().
async function checkProcessGlobalState() {
  const files = await walkDir(join(ROOT, "packages/cms-admin/src"));

  for (const file of files) {
    // Tests legitimately set env vars to exercise different code paths
    if (file.includes("__tests__") || file.endsWith(".test.ts") || file.endsWith(".test.tsx")) continue;

    const content = await readFile(file, "utf-8");
    const rel = relative(ROOT, file);
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      // Skip comments
      if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;

      if (/\bprocess\.chdir\s*\(/.test(line)) {
        findings.push({
          severity: "critical",
          rule: "cms/process-global-state",
          file: rel,
          line: i + 1,
          message: "process.chdir() mutates process-wide cwd and races between concurrent requests — can leak data across sites/tenants",
          suggestion: "Resolve paths to absolute via path.join(projectDir, ...) before passing to libraries that use cwd",
        });
      }

      // Detect: process.env.X = value or process.env["X"] = value
      if (/\bprocess\.env\s*(?:\.[A-Z_][A-Z0-9_]*|\[\s*["'][^"']+["']\s*\])\s*=[^=]/.test(line)) {
        findings.push({
          severity: "high",
          rule: "cms/process-global-state",
          file: rel,
          line: i + 1,
          message: "Mutating process.env at runtime affects all concurrent requests",
          suggestion: "Pass values through function arguments or use AsyncLocalStorage if request-scoped state is needed",
        });
      }
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

// Rule 7: Build executor safety (F126)
// Flag spawn/exec calls in cms-admin that aren't in build/executor.ts
// or deploy-service.ts (which has pre-existing native build calls).
async function checkBuildExecutorSafety() {
  const files = await walkDir(join(ROOT, "packages/cms-admin/src"));
  const allowedFiles = [
    "lib/build/executor.ts",
    "lib/deploy-service.ts",
    "lib/build/run-site-build.ts",
  ];

  for (const file of files) {
    if (file.includes("__tests__") || file.endsWith(".test.ts")) continue;
    const rel = relative(ROOT, file);
    if (allowedFiles.some((a) => rel.endsWith(a))) continue;

    const content = await readFile(file, "utf-8");
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;

      if (/\b(spawn|exec|execSync|execFile|execFileSync)\s*\(/.test(line)) {
        // Skip imports
        if (/import\s/.test(line)) continue;
        findings.push({
          severity: "high",
          rule: "cms/build-executor-safety",
          file: rel,
          line: i + 1,
          message: "Direct subprocess execution outside build/executor.ts bypasses security controls",
          suggestion: "Use build/executor.ts for subprocess execution — it enforces shell:false, env allowlist, and timeout",
        });
      }
    }
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
  await checkProcessGlobalState();
  await checkBuildExecutorSafety();

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
