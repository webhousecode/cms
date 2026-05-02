import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import fs from "fs/promises";
import path from "path";
import { getActiveSitePaths } from "./site-paths";

export type UserRole = "admin" | "editor" | "viewer";

export interface StoredPasskey {
  id: string; // base64url credential ID
  publicKey: string; // base64url-encoded public key bytes
  counter: number;
  deviceType: "singleDevice" | "multiDevice";
  backedUp: boolean;
  transports?: string[];
  name: string; // user-given, e.g. "MacBook TouchID"
  createdAt: string;
  lastUsedAt?: string;
}

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
  showCloseAllTabs?: boolean; // show "Close all" pill in tab bar (global pref)
  passkeys?: StoredPasskey[]; // F59 WebAuthn credentials
  webauthnChallenge?: string; // transient challenge for registration/login
  totp?: TotpConfig; // F59 phase 4 — Authenticator app 2FA
  totpEnrollSecret?: string; // transient: secret pending verification during enrollment
}

export interface TotpConfig {
  secret: string; // base32 — used by otpauth lib
  createdAt: string;
  lastUsedAt?: string;
  /** Single-use recovery codes (hashed). User downloads plaintext at enroll time. */
  backupCodeHashes: string[];
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
  // Users are admin-server-level — never per-site. Stored in the neutral
  // admin data dir so user accounts survive moving/deleting any specific
  // site and don't depend on CMS_CONFIG_PATH resolving to a bootstrap site.
  const { getAdminDataDir } = await import("./site-registry");
  const dataDir = path.join(getAdminDataDir(), "_data");
  await fs.mkdir(dataDir, { recursive: true });
  return path.join(dataDir, "users.json");
}

export async function getUsers(): Promise<User[]> {
  const filePath = await getUsersFilePath();
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as User[];
  } catch {
    // Backwards-compat read path used by listing/lookup. Always returns []
    // on any failure. Do NOT use this from createUser/updateUser/etc.,
    // because a silent [] there would let a write OVERWRITE existing
    // users (the 2026-05-01 takeover incident). Use getUsersStrict()
    // for any code path that's about to mutate users.json.
    return [];
  }
}

/**
 * Strict variant of getUsers() — distinguishes "file legitimately doesn't
 * exist yet" (returns []) from "file exists but is unreadable / corrupt"
 * (throws). Required precondition for any code path that's about to write
 * users.json: if we can't actually see existing users, we MUST refuse to
 * write or we'll silently nuke them.
 */
async function getUsersStrict(): Promise<User[]> {
  const filePath = await getUsersFilePath();
  let content: string;
  try {
    content = await fs.readFile(filePath, "utf-8");
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") return []; // legitimately empty (fresh install)
    throw new Error(
      `Refusing to mutate users.json — current state is unreadable (${e.code ?? "unknown error"}). ` +
      `Investigate before retrying; a blind write here would silently overwrite existing users.`,
    );
  }
  try {
    return JSON.parse(content) as User[];
  } catch {
    throw new Error(
      "Refusing to mutate users.json — current contents are not valid JSON. " +
      "Restore from a known-good backup before retrying.",
    );
  }
}

export async function createUser(
  email: string,
  password: string | null,
  name: string,
  opts?: { role?: UserRole; invitedBy?: string; source?: "local" | "github" | "invite"; githubUsername?: string },
): Promise<User> {
  const users = await getUsersStrict();
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
  patch: { name?: string; email?: string; password?: string; zoom?: number; role?: UserRole; lastActiveOrg?: string; lastActiveSite?: string; showLogoIcon?: boolean; showCloseAllTabs?: boolean },
  /** Fallback email for lookup if id doesn't match (stale JWT) */
  fallbackEmail?: string,
): Promise<User> {
  const users = await getUsersStrict();
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
  if (patch.showCloseAllTabs !== undefined) user.showCloseAllTabs = patch.showCloseAllTabs;

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
  const users = await getUsersStrict();
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

/** Low-level: replace a user record (used by webauthn for passkey mutations). */
export async function saveUser(updated: User): Promise<void> {
  const users = await getUsersStrict();
  const idx = users.findIndex((u) => u.id === updated.id);
  if (idx === -1) throw new Error("User not found");
  users[idx] = updated;
  const filePath = await getUsersFilePath();
  await fs.writeFile(filePath, JSON.stringify(users, null, 2));
}

export async function getUserById(id: string): Promise<User | null> {
  const users = await getUsers();
  return users.find((u) => u.id === id) ?? null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const users = await getUsers();
  return users.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null;
}

/** Get current session from cookies (server-side). Returns null if not authenticated. */
export async function getSessionUser(cookieStore: { get: (name: string) => { value: string } | undefined }): Promise<(SessionPayload & { id: string }) | null> {
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;
  return { ...payload, id: payload.sub };
}
