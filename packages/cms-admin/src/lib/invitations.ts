import fs from "fs/promises";
import path from "path";
import type { UserRole } from "./auth";
import { getActiveSitePaths } from "./site-paths";

export interface Invitation {
  id: string;
  email: string;
  role: UserRole;
  token: string;
  expiresAt: string; // ISO timestamp
  createdBy: string; // user ID
  createdAt: string;
  acceptedAt?: string;
}

/** Invitations are site-scoped — stored in the active site's _data dir */
async function getInvitationsFilePath(): Promise<string> {
  const { dataDir } = await getActiveSitePaths();
  await fs.mkdir(dataDir, { recursive: true });
  return path.join(dataDir, "invitations.json");
}

async function readInvitations(): Promise<Invitation[]> {
  const filePath = await getInvitationsFilePath();
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as Invitation[];
  } catch {
    return [];
  }
}

async function writeInvitations(invitations: Invitation[]): Promise<void> {
  const filePath = await getInvitationsFilePath();
  await fs.writeFile(filePath, JSON.stringify(invitations, null, 2));
}

export async function createInvitation(email: string, role: UserRole, createdBy: string): Promise<Invitation> {
  const invitations = await readInvitations();

  // Check for existing pending invitation to same email on this site
  const existing = invitations.find(
    (inv) => inv.email.toLowerCase() === email.toLowerCase() && !inv.acceptedAt && new Date(inv.expiresAt) > new Date(),
  );
  if (existing) {
    throw new Error("An active invitation already exists for this email");
  }

  const invitation: Invitation = {
    id: crypto.randomUUID(),
    email: email.toLowerCase().trim(),
    role,
    token: crypto.randomUUID(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
    createdBy,
    createdAt: new Date().toISOString(),
  };

  invitations.push(invitation);
  await writeInvitations(invitations);
  return invitation;
}

export async function listInvitations(): Promise<Invitation[]> {
  const invitations = await readInvitations();
  return invitations.filter((inv) => !inv.acceptedAt);
}

export async function revokeInvitation(id: string): Promise<void> {
  const invitations = await readInvitations();
  const idx = invitations.findIndex((inv) => inv.id === id);
  if (idx === -1) throw new Error("Invitation not found");
  invitations.splice(idx, 1);
  await writeInvitations(invitations);
}

export async function validateToken(token: string): Promise<Invitation | null> {
  const invitations = await readInvitations();
  const invitation = invitations.find((inv) => inv.token === token);
  if (!invitation) return null;
  if (invitation.acceptedAt) return null;
  if (new Date(invitation.expiresAt) < new Date()) return null;
  return invitation;
}

export async function markAccepted(token: string): Promise<Invitation> {
  const invitations = await readInvitations();
  const idx = invitations.findIndex((inv) => inv.token === token);
  if (idx === -1) throw new Error("Invitation not found");
  invitations[idx] = { ...invitations[idx]!, acceptedAt: new Date().toISOString() };
  await writeInvitations(invitations);
  return invitations[idx]!;
}
