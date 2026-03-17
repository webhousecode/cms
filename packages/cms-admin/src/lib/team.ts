/**
 * Site-scoped team membership.
 *
 * Each site has its own team.json in _data/ with member entries.
 * Users are CMS-wide (users.json), but access is per-site.
 * The first user (site creator) is auto-added as admin.
 */
import fs from "fs/promises";
import path from "path";
import type { UserRole } from "./auth";
import { getActiveSitePaths } from "./site-paths";

export interface TeamMember {
  userId: string;
  role: UserRole;
  addedAt: string;
  addedBy?: string; // user ID of who added them
}

async function getTeamFilePath(): Promise<string> {
  const { dataDir } = await getActiveSitePaths();
  await fs.mkdir(dataDir, { recursive: true });
  return path.join(dataDir, "team.json");
}

export async function getTeamMembers(): Promise<TeamMember[]> {
  const filePath = await getTeamFilePath();
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as TeamMember[];
  } catch {
    return [];
  }
}

async function writeTeam(members: TeamMember[]): Promise<void> {
  const filePath = await getTeamFilePath();
  await fs.writeFile(filePath, JSON.stringify(members, null, 2));
}

export async function addTeamMember(userId: string, role: UserRole, addedBy?: string, siteDataDir?: string): Promise<TeamMember> {
  const filePath = siteDataDir
    ? path.join(siteDataDir, "team.json")
    : await getTeamFilePath();

  let members: TeamMember[];
  try {
    const content = await fs.readFile(filePath, "utf-8");
    members = JSON.parse(content) as TeamMember[];
  } catch {
    members = [];
  }

  const existing = members.find((m) => m.userId === userId);
  if (existing) {
    existing.role = role;
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(members, null, 2));
    return existing;
  }

  const member: TeamMember = {
    userId,
    role,
    addedAt: new Date().toISOString(),
    ...(addedBy ? { addedBy } : {}),
  };
  members.push(member);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(members, null, 2));
  return member;
}

export async function updateTeamMemberRole(userId: string, role: UserRole): Promise<TeamMember> {
  const members = await getTeamMembers();
  const member = members.find((m) => m.userId === userId);
  if (!member) throw new Error("Member not found");

  // Prevent removing the last admin
  if (member.role === "admin" && role !== "admin") {
    const adminCount = members.filter((m) => m.role === "admin").length;
    if (adminCount <= 1) throw new Error("Cannot demote the last admin");
  }

  member.role = role;
  await writeTeam(members);
  return member;
}

export async function removeTeamMember(userId: string): Promise<void> {
  const members = await getTeamMembers();
  const idx = members.findIndex((m) => m.userId === userId);
  if (idx === -1) throw new Error("Member not found");

  // Prevent removing the last admin
  if (members[idx]!.role === "admin") {
    const adminCount = members.filter((m) => m.role === "admin").length;
    if (adminCount <= 1) throw new Error("Cannot remove the last admin");
  }

  members.splice(idx, 1);
  await writeTeam(members);
}

export async function getTeamMember(userId: string): Promise<TeamMember | null> {
  const members = await getTeamMembers();
  return members.find((m) => m.userId === userId) ?? null;
}

/**
 * Check if a user has access to the current site.
 * Returns the member entry if found, null otherwise.
 *
 * Note: If team.json doesn't exist or is empty, the first user to access
 * should be auto-added as admin (handled at the route level).
 */
export async function isTeamMember(userId: string): Promise<TeamMember | null> {
  return getTeamMember(userId);
}
