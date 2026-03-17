import fs from "fs/promises";
import path from "path";
import type { UserRole } from "./auth";
import { getActiveSitePaths } from "./site-paths";
import { loadRegistry, type SiteEntry } from "./site-registry";

export interface Invitation {
  id: string;
  email: string;
  role: UserRole;
  token: string;
  expiresAt: string; // ISO timestamp
  createdBy: string; // user ID
  createdAt: string;
  acceptedAt?: string;
  siteDataDir?: string; // absolute path so cookie-less validation works
}

/** Get invitations file for the currently active site */
async function getInvitationsFilePath(): Promise<string> {
  const { dataDir } = await getActiveSitePaths();
  await fs.mkdir(dataDir, { recursive: true });
  return path.join(dataDir, "invitations.json");
}

async function readInvitations(filePath?: string): Promise<Invitation[]> {
  const fp = filePath ?? await getInvitationsFilePath();
  try {
    const content = await fs.readFile(fp, "utf-8");
    return JSON.parse(content) as Invitation[];
  } catch {
    return [];
  }
}

async function writeInvitations(invitations: Invitation[], filePath?: string): Promise<void> {
  const fp = filePath ?? await getInvitationsFilePath();
  await fs.writeFile(fp, JSON.stringify(invitations, null, 2));
}

export async function createInvitation(email: string, role: UserRole, createdBy: string): Promise<Invitation> {
  const filePath = await getInvitationsFilePath();
  const invitations = await readInvitations(filePath);

  const existing = invitations.find(
    (inv) => inv.email.toLowerCase() === email.toLowerCase() && !inv.acceptedAt && new Date(inv.expiresAt) > new Date(),
  );
  if (existing) {
    throw new Error("An active invitation already exists for this email");
  }

  const { dataDir } = await getActiveSitePaths();

  const invitation: Invitation = {
    id: crypto.randomUUID(),
    email: email.toLowerCase().trim(),
    role,
    token: crypto.randomUUID(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    createdBy,
    createdAt: new Date().toISOString(),
    siteDataDir: dataDir,
  };

  invitations.push(invitation);
  await writeInvitations(invitations, filePath);
  return invitation;
}

export async function listInvitations(): Promise<Invitation[]> {
  const invitations = await readInvitations();
  return invitations.filter((inv) => !inv.acceptedAt);
}

export async function revokeInvitation(id: string): Promise<void> {
  const filePath = await getInvitationsFilePath();
  const invitations = await readInvitations(filePath);
  const idx = invitations.findIndex((inv) => inv.id === id);
  if (idx === -1) throw new Error("Invitation not found");
  invitations.splice(idx, 1);
  await writeInvitations(invitations, filePath);
}

/**
 * Validate a token — searches across ALL sites' invitations.
 * This is necessary because the invited user has no site cookies.
 */
export async function validateToken(token: string): Promise<Invitation | null> {
  // 1. Try active site first (fast path for admin users testing)
  try {
    const invitations = await readInvitations();
    const inv = invitations.find((i) => i.token === token && !i.acceptedAt && new Date(i.expiresAt) > new Date());
    if (inv) return inv;
  } catch { /* ignore */ }

  // 2. Search all sites via registry
  const allPaths = await getAllSiteDataDirs();
  for (const dataDir of allPaths) {
    const filePath = path.join(dataDir, "invitations.json");
    const invitations = await readInvitations(filePath);
    const inv = invitations.find((i) => i.token === token && !i.acceptedAt && new Date(i.expiresAt) > new Date());
    if (inv) {
      // Ensure siteDataDir is set for accept to use
      if (!inv.siteDataDir) inv.siteDataDir = dataDir;
      return inv;
    }
  }
  return null;
}

/**
 * Mark invitation as accepted — uses siteDataDir from invitation to find the right file.
 */
export async function markAccepted(token: string, siteDataDir?: string): Promise<Invitation> {
  // If we know the site dir, use it directly
  if (siteDataDir) {
    const filePath = path.join(siteDataDir, "invitations.json");
    const invitations = await readInvitations(filePath);
    const idx = invitations.findIndex((inv) => inv.token === token);
    if (idx !== -1) {
      invitations[idx] = { ...invitations[idx]!, acceptedAt: new Date().toISOString() };
      await writeInvitations(invitations, filePath);
      return invitations[idx]!;
    }
  }

  // Fallback: search all sites
  const allPaths = await getAllSiteDataDirs();
  for (const dataDir of allPaths) {
    const filePath = path.join(dataDir, "invitations.json");
    const invitations = await readInvitations(filePath);
    const idx = invitations.findIndex((inv) => inv.token === token);
    if (idx !== -1) {
      invitations[idx] = { ...invitations[idx]!, acceptedAt: new Date().toISOString() };
      await writeInvitations(invitations, filePath);
      return invitations[idx]!;
    }
  }
  throw new Error("Invitation not found");
}

/** Get _data dirs for all registered sites (+ single-site fallback) */
async function getAllSiteDataDirs(): Promise<string[]> {
  const dirs: string[] = [];

  // Single-site mode
  const configPath = process.env.CMS_CONFIG_PATH;
  if (configPath) {
    dirs.push(path.join(path.dirname(path.resolve(configPath)), "_data"));
  }

  // Multi-site mode — scan registry
  const registry = await loadRegistry();
  if (registry) {
    for (const org of registry.orgs) {
      for (const site of org.sites) {
        if (site.adapter === "github" || site.configPath.startsWith("github://")) {
          const cacheBase = configPath
            ? path.join(path.dirname(path.resolve(configPath)), ".cache")
            : path.join(process.env.HOME ?? "/tmp", ".webhouse", ".cache");
          dirs.push(path.join(cacheBase, "sites", site.id, "_data"));
        } else {
          const abs = path.resolve(site.configPath);
          const projDir = path.dirname(abs);
          const contentDir = site.contentDir ?? path.join(projDir, "content");
          dirs.push(path.join(contentDir, "..", "_data"));
        }
      }
    }
  }

  // Dedupe
  return [...new Set(dirs)];
}
