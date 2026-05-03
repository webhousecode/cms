/**
 * F122 — Beam Push Engine (Source Side).
 *
 * Streams a complete site to a remote CMS admin instance via HTTP.
 * Uses the same file collection logic as export.ts but sends files
 * individually to the target's /api/beam/receive/* endpoints.
 */
import { existsSync, readdirSync, statSync, readFileSync } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { getActiveSitePaths, getActiveSiteEntry } from "../site-paths";
import { getAdminCms, getAdminConfig } from "../cms";
import type { BeamManifest } from "./types";
import {
  SECRET_FIELDS,
  BEAM_REDACTED,
  EXCLUDED_DATA_DIRS,
  EXCLUDED_SOURCE_DIRS,
  SOURCE_ROOT_FILES,
} from "./types";
import {
  createBeamSession,
  updateBeamSession,
  completeBeamSession,
  failBeamSession,
} from "./session";

interface PushOptions {
  targetUrl: string;
  token: string;
  orgId: string;
  /** Fires once the beamId is generated and session is created — lets the
   *  caller return it to the client BEFORE the (potentially long) push runs. */
  onBeamId?: (beamId: string) => void;
}

interface FileToSend {
  archivePath: string;
  content: Buffer;
  checksum: string;
}

/**
 * Push the active site to a remote CMS admin via Live Beam protocol.
 * Returns the beamId for progress tracking via SSE.
 */
export async function pushBeamToTarget(options: PushOptions): Promise<string> {
  const { targetUrl, token, orgId } = options;
  // Normalize: strip trailing slashes AND force https for any non-localhost
  // host. Plain http://example.com targets get auto-redirected to https by
  // most hosts (Fly), and POST bodies are silently dropped on the redirect,
  // so fetch returns 500 "Unexpected end of JSON input" — confusing.
  let baseUrl = targetUrl.replace(/\/+$/, "");
  if (baseUrl.startsWith("http://") && !baseUrl.includes("//localhost") && !baseUrl.includes("//127.0.0.1")) {
    baseUrl = baseUrl.replace(/^http:\/\//, "https://");
  }

  const sitePaths = await getActiveSitePaths();
  const siteEntry = await getActiveSiteEntry();
  const { dataDir, configPath, uploadDir } = sitePaths;

  const siteName = siteEntry?.name ?? "site";
  const siteId = siteEntry?.id ?? randomUUID();
  const beamId = randomUUID();

  // Collect all files to send
  const files: FileToSend[] = [];
  const checksums: Record<string, string> = {};
  const stats: BeamManifest["stats"] = {
    contentFiles: 0,
    mediaFiles: 0,
    dataFiles: 0,
    sourceFiles: 0,
    totalSizeBytes: 0,
    collections: {},
  };
  const secretsRequired: string[] = [];

  // ── Content via CMS API ──
  const cms = await getAdminCms();
  const config = await getAdminConfig();

  for (const col of config.collections) {
    try {
      const { documents } = await cms.content.findMany(col.name, {});
      stats.collections[col.name] = documents.length;
      stats.contentFiles += documents.length;

      for (const doc of documents) {
        const d = doc as { slug?: string; id?: string };
        const slug = d.slug ?? d.id ?? "unknown";
        const jsonStr = JSON.stringify(doc, null, 2);
        const archivePath = `content/${col.name}/${slug}.json`;
        const checksum = sha256(jsonStr);
        checksums[archivePath] = checksum;
        files.push({ archivePath, content: Buffer.from(jsonStr), checksum });
      }
    } catch {
      stats.collections[col.name] = 0;
    }
  }

  // ── cms.config.ts ──
  if (!configPath.startsWith("github://") && existsSync(configPath)) {
    const buf = readFileSync(configPath);
    const checksum = sha256(buf);
    checksums["cms.config.ts"] = checksum;
    files.push({ archivePath: "cms.config.ts", content: buf, checksum });
  } else if (configPath.startsWith("github://")) {
    const configJson = JSON.stringify(
      {
        collections: config.collections.map((c: any) => ({
          name: c.name, label: c.label, fields: c.fields,
          sourceLocale: c.sourceLocale, locales: c.locales, urlPrefix: c.urlPrefix,
        })),
      },
      null, 2,
    );
    const checksum = sha256(configJson);
    checksums["cms.config.json"] = checksum;
    files.push({ archivePath: "cms.config.json", content: Buffer.from(configJson), checksum });
  }

  // ── Media (uploads/) ──
  if (existsSync(uploadDir)) {
    walkDir(uploadDir, (absPath, relPath) => {
      const archivePath = `uploads/${relPath}`;
      const buf = readFileSync(absPath);
      const checksum = sha256(buf);
      checksums[archivePath] = checksum;
      files.push({ archivePath, content: buf, checksum });
      stats.mediaFiles++;
    });
  }

  // ── _data/ (with secret stripping) ──
  if (existsSync(dataDir)) {
    for (const entry of readdirSync(dataDir)) {
      if (EXCLUDED_DATA_DIRS.has(entry)) continue;
      if (entry === "beam-tmp") continue;
      if (entry === "beam-tokens.json") continue;
      const full = path.join(dataDir, entry);
      const stat = statSync(full);

      if (stat.isDirectory()) {
        walkDir(full, (absPath, relPath) => {
          const archivePath = `_data/${entry}/${relPath}`;
          const buf = readFileSync(absPath);
          const checksum = sha256(buf);
          checksums[archivePath] = checksum;
          files.push({ archivePath, content: buf, checksum });
          stats.dataFiles++;
        });
      } else {
        const archivePath = `_data/${entry}`;
        let content = readFileSync(full, "utf-8");

        const fieldList = SECRET_FIELDS[entry];
        if (fieldList) {
          try {
            const obj = JSON.parse(content);
            const stripped = stripSecrets(obj, fieldList);
            if (stripped.length > 0) secretsRequired.push(...stripped);
            content = JSON.stringify(obj, null, 2);
          } catch { /* not JSON */ }
        }

        const checksum = sha256(content);
        checksums[archivePath] = checksum;
        files.push({ archivePath, content: Buffer.from(content), checksum });
        stats.dataFiles++;
      }
    }
  }

  // ── F143 P2: Source files (build.ts + package.json + public/) ──
  // Skipped for github-adapter sites (their projectDir is a temp dir
  // with only cms.config.ts; actual source lives in the GH repo).
  const projectDir = sitePaths.projectDir;
  if (
    !configPath.startsWith("github://") &&
    existsSync(projectDir) &&
    siteEntry?.adapter !== "github"
  ) {
    for (const entry of readdirSync(projectDir)) {
      if (EXCLUDED_SOURCE_DIRS.has(entry)) continue;
      const abs = path.join(projectDir, entry);
      let st;
      try { st = statSync(abs); } catch { continue; }

      if (st.isDirectory()) {
        // Only recurse into public/ — see export.ts for rationale
        if (entry !== "public") continue;
        walkDir(abs, (absPath, relPath) => {
          if (relPath.startsWith("uploads/") || relPath === "uploads") return;
          const archivePath = `source/public/${relPath}`;
          const buf = readFileSync(absPath);
          const checksum = sha256(buf);
          checksums[archivePath] = checksum;
          files.push({ archivePath, content: buf, checksum });
          stats.sourceFiles = (stats.sourceFiles ?? 0) + 1;
        });
      } else if (SOURCE_ROOT_FILES.has(entry)) {
        const archivePath = `source/${entry}`;
        const buf = readFileSync(abs);
        const checksum = sha256(buf);
        checksums[archivePath] = checksum;
        files.push({ archivePath, content: buf, checksum });
        stats.sourceFiles = (stats.sourceFiles ?? 0) + 1;
      }
    }
  }

  // Calculate total bytes
  stats.totalSizeBytes = files.reduce((sum, f) => sum + f.content.length, 0);

  // Create local session for SSE progress tracking
  createBeamSession(beamId, "sending", siteName, siteId);
  // Notify caller about beamId so it can return early to the client
  options.onBeamId?.(beamId);
  updateBeamSession(beamId, {
    totalFiles: files.length,
    totalBytes: stats.totalSizeBytes,
    phase: "initiate",
  });

  // ── Step 1: Initiate on target ──
  const initRes = await fetch(`${baseUrl}/api/beam/receive/initiate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token,
      beamId,
      siteName,
      siteId,
      orgId,
      totalFiles: files.length,
      totalBytes: stats.totalSizeBytes,
    }),
  });

  if (!initRes.ok) {
    const err = await initRes.json().catch(() => ({ error: "Initiate failed" }));
    failBeamSession(beamId, err.error);
    throw new Error(err.error);
  }

  // ── Step 2: Send files ──
  updateBeamSession(beamId, { phase: "files" });

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const form = new FormData();
    form.append("beamId", beamId);
    form.append("path", file.archivePath);
    form.append("checksum", file.checksum);
    form.append("file", new Blob([new Uint8Array(file.content)]), path.basename(file.archivePath));

    const fileRes = await fetch(`${baseUrl}/api/beam/receive/file`, {
      method: "POST",
      body: form,
    });

    if (!fileRes.ok) {
      const err = await fileRes.json().catch(() => ({ error: `Failed to send ${file.archivePath}` }));
      failBeamSession(beamId, err.error);
      throw new Error(err.error);
    }

    updateBeamSession(beamId, {
      transferredFiles: i + 1,
      transferredBytes: files.slice(0, i + 1).reduce((s, f) => s + f.content.length, 0),
      currentFile: file.archivePath,
    });
  }

  // ── Step 3: Finalize ──
  updateBeamSession(beamId, { phase: "finalize" });

  const manifest: BeamManifest = {
    version: 1,
    beamId,
    sourceInstance: process.env.HOSTNAME || "localhost",
    exportedAt: new Date().toISOString(),
    site: {
      id: siteId,
      name: siteName,
      adapter: (siteEntry?.adapter as "filesystem" | "github") ?? "filesystem",
    },
    stats,
    checksums,
    secretsRequired: [...new Set(secretsRequired)],
  };

  const finalRes = await fetch(`${baseUrl}/api/beam/receive/finalize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ beamId, manifest }),
  });

  if (!finalRes.ok) {
    const err = await finalRes.json().catch(() => ({ error: "Finalize failed" }));
    failBeamSession(beamId, err.error);
    throw new Error(err.error);
  }

  completeBeamSession(beamId);
  return beamId;
}

// ── Helpers (same as export.ts) ──

function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function walkDir(dir: string, cb: (absPath: string, relPath: string) => void, prefix = "") {
  for (const entry of readdirSync(dir)) {
    const abs = path.join(dir, entry);
    const rel = prefix ? `${prefix}/${entry}` : entry;
    const stat = statSync(abs);
    if (stat.isDirectory()) {
      walkDir(abs, cb, rel);
    } else {
      cb(abs, rel);
    }
  }
}

function stripSecrets(obj: Record<string, unknown>, fields: string[]): string[] {
  const found: string[] = [];
  for (const field of fields) {
    if (field in obj && obj[field] && obj[field] !== "" && obj[field] !== BEAM_REDACTED) {
      if (Array.isArray(obj[field])) {
        for (const item of obj[field] as Record<string, unknown>[]) {
          if (typeof item === "object" && item && field in item && item[field]) {
            item[field] = BEAM_REDACTED;
            found.push(field.toUpperCase());
          }
        }
      } else {
        obj[field] = BEAM_REDACTED;
        found.push(field.toUpperCase());
      }
    }
  }
  return found;
}
