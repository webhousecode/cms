import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { getActiveSitePaths } from "./site-paths";

export interface SiteConfig {
  previewSiteUrl: string;
  previewInIframe: boolean;
  trashRetentionDays: number;
  curationRetentionDays: number;
  schemaEditEnabled: boolean;
  devInspector: boolean;
  showCloseAllTabs: boolean;
  /** Default AI model for interactive generation/editing */
  aiInteractivesModel: string;
  /** Default max tokens for interactive generation/editing */
  aiInteractivesMaxTokens: number;
  /** Default AI model for content writing */
  aiContentModel: string;
  /** Default max tokens for content writing */
  aiContentMaxTokens: number;
  /** Resend API key for transactional email */
  resendApiKey: string;
  /** Sender email for outgoing emails (must be verified in Resend) */
  emailFrom: string;
  /** Display name for outgoing emails */
  emailFromName: string;
  /** Secret used to generate per-user calendar feed tokens */
  calendarSecret: string;
}

async function getConfigPath(): Promise<string> {
  const { dataDir } = await getActiveSitePaths();
  return path.join(dataDir, "site-config.json");
}

/** Defaults fall back to env vars so existing setups keep working */
async function defaults(): Promise<SiteConfig> {
  const { previewUrl } = await getActiveSitePaths();
  return {
    previewSiteUrl: previewUrl,
    previewInIframe: process.env.NEXT_PUBLIC_PREVIEW_IN_IFRAME === "true",
    trashRetentionDays: parseInt(process.env.TRASH_RETENTION_DAYS ?? "30", 10),
    curationRetentionDays: 30,
    schemaEditEnabled: process.env.SCHEMA_EDIT_ENABLED === "true",
    devInspector: process.env.DEV_INSPECTOR === "true",
    showCloseAllTabs: false,
    aiInteractivesModel: "claude-sonnet-4-6",
    aiInteractivesMaxTokens: 16384,
    aiContentModel: "claude-haiku-4-5-20251001",
    aiContentMaxTokens: 4096,
    resendApiKey: "",
    emailFrom: "",
    emailFromName: "webhouse.app",
    calendarSecret: crypto.randomBytes(32).toString("hex"),
  };
}

export async function readSiteConfig(): Promise<SiteConfig> {
  const filePath = await getConfigPath();
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const stored = JSON.parse(raw) as Partial<SiteConfig>;
    return { ...(await defaults()), ...stored };
  } catch {
    return defaults();
  }
}

/** Generate a per-user calendar feed token: HMAC(calendarSecret, userId) */
export function generateCalendarToken(secret: string, userId: string): string {
  return crypto.createHmac("sha256", secret).update(userId).digest("hex");
}

/** Validate a calendar feed token against all team members */
export async function validateCalendarToken(token: string): Promise<boolean> {
  try {
    const config = await readSiteConfig();
    if (!config.calendarSecret) return false;
    // Import team dynamically to avoid circular deps
    const { getTeamMembers } = await import("./team");
    const members = await getTeamMembers();
    return members.some((m) => generateCalendarToken(config.calendarSecret, m.userId) === token);
  } catch (err) {
    console.error("[calendar] token validation error:", err);
    return false;
  }
}

export async function writeSiteConfig(patch: Partial<SiteConfig>): Promise<SiteConfig> {
  const filePath = await getConfigPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  // Merge with existing stored values (not defaults) so we only persist explicit choices
  let existing: Partial<SiteConfig> = {};
  try {
    existing = JSON.parse(await fs.readFile(filePath, "utf-8")) as Partial<SiteConfig>;
  } catch { /* first write */ }

  const next = { ...existing, ...patch };
  await fs.writeFile(filePath, JSON.stringify(next, null, 2));
  return { ...(await defaults()), ...next };
}
