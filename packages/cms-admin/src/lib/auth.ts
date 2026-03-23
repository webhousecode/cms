import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import fs from "fs/promises";
import path from "path";
import { getActiveSitePaths } from "./site-paths";

export type UserRole = "admin" | "editor" | "viewer";

export interface User {
  id: string;
  email: string;
  passwordHash?: string; // optional — GitHub-only users have no password
  name: string;
  role: UserRole;
  createdAt: string;
  invitedBy?: string; // user ID of inviter
  source?: "local" | "github" | "invite"; // how the user was created
  githubUsername?: string; // linked GitHub username
  zoom?: number; // UI zoom level in percent, e.g. 110
  lastActiveOrg?: string; // last active org ID (persists across devices)
  lastActiveSite?: string; // last active site ID (persists across devices)
  showLogoIcon?: boolean; // false = wordmark (default), true = eye icon
}

export interface SessionPayload {
  sub: string;
  email: string;
  name: string;
  role: UserRole;
}

export const COOKIE_NAME = "cms-session";

function getJwtSecret(): Uint8Array {
  const secret = process.env.CMS_JWT_SECRET;
  if (!secret) {
    console.warn("[CMS Auth] CMS_JWT_SECRET not set — using insecure dev fallback");
  }
  return new TextEncoder().encode(secret ?? "cms-dev-secret-change-me-in-production");
}

async function getUsersFilePath(): Promise<string> {
  // Users are CMS-wide, not per-site. Always use the primary data dir
  // from CMS_CONFIG_PATH so users work regardless of active site.
  const configPath = process.env.CMS_CONFIG_PATH;
  if (configPath) {
    const dataDir = path.join(path.dirname(path.resolve(configPath)), "_data");
    await fs.mkdir(dataDir, { recursive: true });
    return path.join(dataDir, "users.json");
  }
  // Fallback to active site paths (single-site mode without env var)
  const { dataDir } = await getActiveSitePaths();
  await fs.mkdir(dataDir, { recursive: true });
  return path.join(dataDir, "users.json");
}

export async function getUsers(): Promise<User[]> {
  const filePath = await getUsersFilePath();
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as User[];
  } catch {
    return [];
  }
}

export async function createUser(
  email: string,
  password: string | null,
  name: string,
  opts?: { role?: UserRole; invitedBy?: string; source?: "local" | "github" | "invite"; githubUsername?: string },
): Promise<User> {
  const users = await getUsers();
  if (users.find((u) => u.email.toLowerCase() === email.toLowerCase())) {
    throw new Error("User already exists");
  }
  const passwordHash = password ? await bcrypt.hash(password, 12) : undefined;
  // First user is always admin; invited users get the specified role
  const role = opts?.role ?? (users.length === 0 ? "admin" : "editor");
  const user: User = {
    id: crypto.randomUUID(),
    email: email.toLowerCase().trim(),
    ...(passwordHash ? { passwordHash } : {}),
    name: name.trim(),
    role,
    createdAt: new Date().toISOString(),
    ...(opts?.invitedBy ? { invitedBy: opts.invitedBy } : {}),
    ...(opts?.source ? { source: opts.source } : {}),
    ...(opts?.githubUsername ? { githubUsername: opts.githubUsername } : {}),
  };
  users.push(user);
  const filePath = await getUsersFilePath();
  await fs.writeFile(filePath, JSON.stringify(users, null, 2));
  return user;
}

export async function verifyPassword(email: string, password: string): Promise<User | null> {
  const users = await getUsers();
  const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!user) return null;
  // GitHub-only users have no password — reject with null (caller should show "use GitHub" message)
  if (!user.passwordHash) return null;
  const valid = await bcrypt.compare(password, user.passwordHash);
  return valid ? user : null;
}

export async function createToken(user: User): Promise<string> {
  return new SignJWT({ sub: user.id, email: user.email, name: user.name, role: user.role ?? "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getJwtSecret());
}

export async function updateUser(
  id: string,
  patch: { name?: string; email?: string; password?: string; zoom?: number; role?: UserRole; lastActiveOrg?: string; lastActiveSite?: string; showLogoIcon?: boolean },
  /** Fallback email for lookup if id doesn't match (stale JWT) */
  fallbackEmail?: string,
): Promise<User> {
  const users = await getUsers();
  let idx = users.findIndex((u) => u.id === id);
  // Fallback: match by email if ID doesn't match (e.g. stale JWT after data migration)
  if (idx === -1 && fallbackEmail) {
    idx = users.findIndex((u) => u.email.toLowerCase() === fallbackEmail.toLowerCase());
  }
  if (idx === -1) throw new Error("User not found");

  const user = { ...users[idx]! };
  if (patch.name) user.name = patch.name.trim();
  if (patch.email) user.email = patch.email.toLowerCase().trim();
  if (patch.password) user.passwordHash = await bcrypt.hash(patch.password, 12);
  if (patch.zoom !== undefined) user.zoom = patch.zoom;
  if (patch.role) user.role = patch.role;
  if (patch.lastActiveOrg !== undefined) user.lastActiveOrg = patch.lastActiveOrg;
  if (patch.lastActiveSite !== undefined) user.lastActiveSite = patch.lastActiveSite;
  if (patch.showLogoIcon !== undefined) user.showLogoIcon = patch.showLogoIcon;

  users[idx] = user;
  const filePath = await getUsersFilePath();
  await fs.writeFile(filePath, JSON.stringify(users, null, 2));
  return user;
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function deleteUser(id: string): Promise<void> {
  const users = await getUsers();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) throw new Error("User not found");
  // Prevent deleting the last admin
  const remainingAdmins = users.filter((u, i) => i !== idx && (u.role ?? "admin") === "admin");
  if ((users[idx]!.role ?? "admin") === "admin" && remainingAdmins.length === 0) {
    throw new Error("Cannot delete the last admin");
  }
  users.splice(idx, 1);
  const filePath = await getUsersFilePath();
  await fs.writeFile(filePath, JSON.stringify(users, null, 2));
}

/** Get current session from cookies (server-side). Returns null if not authenticated. */
export async function getSessionUser(cookieStore: { get: (name: string) => { value: string } | undefined }): Promise<(SessionPayload & { id: string }) | null> {
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;
  return { ...payload, id: payload.sub };
}
