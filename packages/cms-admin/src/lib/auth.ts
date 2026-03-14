import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import fs from "fs/promises";
import path from "path";
import { getActiveSitePaths } from "./site-paths";

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  createdAt: string;
  zoom?: number; // UI zoom level in percent, e.g. 110
}

export interface SessionPayload {
  sub: string;
  email: string;
  name: string;
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

export async function createUser(email: string, password: string, name: string): Promise<User> {
  const users = await getUsers();
  if (users.find((u) => u.email.toLowerCase() === email.toLowerCase())) {
    throw new Error("User already exists");
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const user: User = {
    id: crypto.randomUUID(),
    email: email.toLowerCase().trim(),
    passwordHash,
    name: name.trim(),
    createdAt: new Date().toISOString(),
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
  const valid = await bcrypt.compare(password, user.passwordHash);
  return valid ? user : null;
}

export async function createToken(user: User): Promise<string> {
  return new SignJWT({ sub: user.id, email: user.email, name: user.name })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getJwtSecret());
}

export async function updateUser(
  id: string,
  patch: { name?: string; email?: string; password?: string; zoom?: number },
): Promise<User> {
  const users = await getUsers();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) throw new Error("User not found");

  const user = { ...users[idx]! };
  if (patch.name) user.name = patch.name.trim();
  if (patch.email) user.email = patch.email.toLowerCase().trim();
  if (patch.password) user.passwordHash = await bcrypt.hash(patch.password, 12);
  if (patch.zoom !== undefined) user.zoom = patch.zoom;

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
