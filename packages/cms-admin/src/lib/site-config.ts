import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { getActiveSitePaths } from "./site-paths";
import { SECRET_FIELDS, clearRedactedSecrets } from "./beam/types";

export interface SiteConfig {
  previewSiteUrl: string;
  previewInIframe: boolean;
  trashRetentionDays: number;
  curationRetentionDays: number;
  schemaEditEnabled: boolean;
  devInspector: boolean;
  /** Default AI model for interactive generation/editing (legacy alias for aiCodeModel) */
  aiInteractivesModel: string;
  /** Default max tokens for interactive generation/editing */
  aiInteractivesMaxTokens: number;
  /** Default AI model for content writing (SEO, rewrite, proofread) */
  aiContentModel: string;
  /** Default max tokens for content writing */
  aiContentMaxTokens: number;
  /** Default AI model for code/smart tasks (chat, interactives, generate) */
  aiCodeModel: string;
  /** Default AI model for premium tasks (brand voice) */
  aiPremiumModel: string;
  /** Default AI model for chat conversations */
  aiChatModel: string;
  /** Default max tokens per chat response */
  aiChatMaxTokens: number;
  /** Max tool iterations per chat message (how many tools the AI can call in sequence) */
  aiChatMaxToolIterations: number;
  /** Resend API key for transactional email */
  resendApiKey: string;
  /** Sender email for outgoing emails (must be verified in Resend) */
  emailFrom: string;
  /** Display name for outgoing emails */
  emailFromName: string;
  /** Secret used to generate per-user calendar feed tokens */
  calendarSecret: string;
  /** Webhook URL for scheduled task notifications (Discord, Slack, etc.) */
  schedulerWebhookUrl: string;
  /** Enable scheduler notifications */
  schedulerNotifications: boolean;
  /** Backup schedule: "off" | "daily" | "weekly" */
  backupSchedule: "off" | "daily" | "weekly";
  /** Time of day for scheduled backups (HH:MM, 24h format) */
  backupTime: string;
  /** Backup retention in days */
  backupRetentionDays: number;
  /** Link checker schedule: "off" | "daily" | "weekly" */
  linkCheckSchedule: "off" | "daily" | "weekly";
  /** Link checker scheduled time (HH:MM) */
  linkCheckTime: string;

  /** Deploy configuration */
  deployProvider: "off" | "vercel" | "netlify" | "flyio" | "flyio-live" | "cloudflare" | "cloudflare-pages" | "github-pages" | "custom";
  deployHookUrl: string;
  deployApiToken: string;
  deployAppName: string;  // Fly.io app name or GitHub repo
  /** Fly.io organization slug (auto-detected from token if not set) */
  deployFlyOrg: string;
  deployProductionUrl: string;  // Live site URL after deploy
  /** Custom domain for deploy (e.g. boutique.webhouse.app) */
  deployCustomDomain: string;
  /** Auto-deploy when content is saved */
  deployOnSave: boolean;

  /** F133 Fly Live — region for the volume-backed site (e.g. arn, fra, iad) */
  deployFlyLiveRegion: string;
  /** F133 Fly Live — persistent volume name (default: "site_data") */
  deployFlyLiveVolumeName: string;
  /** F133 Fly Live — HMAC secret shared with the sync-endpoint. Auto-generated on first deploy. */
  deployFlyLiveSyncSecret: string;

  /** F133 Cloudflare Pages (direct) — account ID */
  deployCloudflareAccountId: string;
  /** F133 Cloudflare Pages (direct) — project name (slug) */
  deployCloudflareProjectName: string;

  /** AI Image Analysis: how to handle already-analyzed images in batch
   *  "ask" = prompt user, "skip" = skip existing, "overwrite" = always re-analyze */
  aiImageOverwrite: "ask" | "skip" | "overwrite";

  /** Generate WebP variants on upload */
  mediaAutoOptimize: boolean;
  /** Variant widths in pixels */
  mediaVariantWidths: number[];
  /** WebP quality (1-100) */
  mediaWebpQuality: number;

  /** Webhook URLs per automation (ordered, multiple per type)
   *  Each entry optionally has `secret` for HMAC-SHA256 signing (F35) */
  backupWebhooks: { id: string; url: string; secret?: string; label?: string }[];
  linkCheckWebhooks: { id: string; url: string; secret?: string; label?: string }[];
  publishWebhooks: { id: string; url: string; secret?: string; label?: string }[];
  agentDefaultWebhooks: { id: string; url: string; secret?: string; label?: string }[];
  /** F35 — Content lifecycle webhooks (created, updated, published, unpublished, trashed, restored, cloned) */
  contentWebhooks: { id: string; url: string; secret?: string; label?: string }[];
  /** F35 — Deploy lifecycle webhooks (started, success, failed) */
  deployWebhooks: { id: string; url: string; secret?: string; label?: string }[];
  /** F35 — Media lifecycle webhooks (uploaded, deleted) */
  mediaWebhooks: { id: string; url: string; secret?: string; label?: string }[];

  /** F95 Cloud Backup — provider config */
  backupProvider: "off" | "pcloud" | "s3" | "webdav";
  /** F95 pCloud email */
  backupPcloudEmail: string;
  /** F95 pCloud password */
  backupPcloudPassword: string;
  /** F95 pCloud EU region (Luxembourg) */
  backupPcloudEu: boolean;
  /** F95 S3 provider preset */
  backupS3Provider: string;
  /** F95 S3 endpoint */
  backupS3Endpoint: string;
  /** F95 S3 region */
  backupS3Region: string;
  /** F95 S3 bucket name */
  backupS3Bucket: string;
  /** F95 S3 access key ID */
  backupS3AccessKeyId: string;
  /** F95 S3 secret access key */
  backupS3SecretAccessKey: string;
  /** F95 S3 prefix (folder) */
  backupS3Prefix: string;
  /** F95 Max backup storage in GB (0 = unlimited). Oldest backups pruned when exceeded. */
  backupMaxStorageGB: number;

  /** F48 i18n — default language for the site (BCP 47, e.g. "da", "en") */
  defaultLocale: string;
  /** F48 i18n — all locales the site supports (empty = single-locale site) */
  locales: string[];
  /** F48 i18n — URL strategy for locale prefixes */
  localeStrategy: "none" | "prefix-other" | "prefix-all";
  /** F48 i18n — auto-retranslate stale translations when source doc is updated */
  autoRetranslateOnUpdate: boolean;

  /** F112 GEO — robots.txt strategy */
  geoRobotsStrategy: string;
  /** F112 GEO — custom robots.txt rules (for "custom" strategy) */
  geoRobotsCustomRules: string;
  /** F112 GEO — comma-separated disallow paths */
  geoRobotsDisallowPaths: string;
  /** F112 GEO — Perplexity API key for visibility probes */
  geoPerplexityApiKey: string;
  /** F112 GEO — Google Custom Search API key */
  geoGoogleSearchApiKey: string;
  /** F112 GEO — Google Custom Search Engine ID */
  geoGoogleSearchCx: string;
  /** F112 GEO — Organization name for JSON-LD */
  geoOrganizationName: string;
  /** F112 GEO — Organization URL */
  geoOrganizationUrl: string;
  /** F112 GEO — Organization logo URL */
  geoOrganizationLogo: string;
  /** F98 Lighthouse — Google PageSpeed Insights API key */
  psiApiKey: string;
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
    aiInteractivesModel: "claude-sonnet-4-6",
    aiInteractivesMaxTokens: 16384,
    aiContentModel: "claude-haiku-4-5-20251001",
    aiContentMaxTokens: 4096,
    aiCodeModel: "claude-sonnet-4-6",
    aiPremiumModel: "claude-opus-4-6",
    aiChatModel: "claude-sonnet-4-6",
    aiChatMaxTokens: 16384,
    aiChatMaxToolIterations: 25,
    resendApiKey: "",
    emailFrom: "",
    emailFromName: "webhouse.app",
    calendarSecret: crypto.randomBytes(32).toString("hex"),
    schedulerWebhookUrl: "",
    schedulerNotifications: false,
    deployProvider: "off",
    deployHookUrl: "",
    deployApiToken: "",
    deployAppName: "",
    deployFlyOrg: "",
    deployProductionUrl: "",
    deployCustomDomain: "",
    deployOnSave: false,
    deployFlyLiveRegion: "arn",
    deployFlyLiveVolumeName: "site_data",
    deployFlyLiveSyncSecret: "",
    deployCloudflareAccountId: "",
    deployCloudflareProjectName: "",
    backupSchedule: "off",
    backupTime: "03:00",
    backupRetentionDays: 30,
    backupProvider: "off",
    backupPcloudEmail: "",
    backupPcloudPassword: "",
    backupPcloudEu: true,
    backupS3Provider: "",
    backupS3Endpoint: "",
    backupS3Region: "",
    backupS3Bucket: "",
    backupS3AccessKeyId: "",
    backupS3SecretAccessKey: "",
    backupS3Prefix: "cms-backups/",
    backupMaxStorageGB: 0,
    linkCheckSchedule: "off",
    linkCheckTime: "04:00",
    aiImageOverwrite: "ask",
    mediaAutoOptimize: true,
    mediaVariantWidths: [400, 800, 1200, 1600],
    mediaWebpQuality: 80,
    backupWebhooks: [],
    linkCheckWebhooks: [],
    publishWebhooks: [],
    agentDefaultWebhooks: [],
    contentWebhooks: [],
    deployWebhooks: [],
    mediaWebhooks: [],
    defaultLocale: "en",
    locales: [],
    localeStrategy: "prefix-other",
    autoRetranslateOnUpdate: false,
    geoRobotsStrategy: "maximum",
    geoRobotsCustomRules: "",
    geoRobotsDisallowPaths: "/admin/, /api/",
    geoPerplexityApiKey: "",
    geoGoogleSearchApiKey: "",
    geoGoogleSearchCx: "",
    geoOrganizationName: "",
    geoOrganizationUrl: "",
    geoOrganizationLogo: "",
    psiApiKey: process.env.GOOGLE_PSI_API_KEY ?? "",
  };
}

export async function readSiteConfig(): Promise<SiteConfig> {
  const filePath = await getConfigPath();
  const defs = await defaults();
  let stored: Partial<SiteConfig> = {};
  try {
    stored = JSON.parse(await fs.readFile(filePath, "utf-8")) as Partial<SiteConfig>;
  } catch { /* first read */ }

  // Defensive: drop BEAM_REDACTED placeholders so org/env fallback applies.
  clearRedactedSecrets(stored as Record<string, unknown>, SECRET_FIELDS["site-config.json"]!);

  // Auto-persist calendarSecret on first use so it stays stable across requests
  let needsWrite = false;
  if (!stored.calendarSecret) {
    stored.calendarSecret = defs.calendarSecret;
    needsWrite = true;
  }

  // Migrate legacy schedulerWebhookUrl → publishWebhooks
  if (stored.schedulerWebhookUrl && stored.schedulerNotifications &&
      (!stored.publishWebhooks || stored.publishWebhooks.length === 0)) {
    stored.publishWebhooks = [{ id: crypto.randomBytes(4).toString("hex"), url: stored.schedulerWebhookUrl }];
    needsWrite = true;
  }

  if (needsWrite) {
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, JSON.stringify(stored, null, 2));
    } catch { /* non-fatal */ }
  }

  // F87: Org-level settings inheritance (defaults ← org ← site)
  let orgSettings: Record<string, unknown> = {};
  try {
    const { readOrgSettings, mergeConfigs } = await import("./org-settings");
    orgSettings = await readOrgSettings() as Record<string, unknown>;
    if (Object.keys(orgSettings).length > 0) {
      return mergeConfigs(
        defs as unknown as Record<string, unknown>,
        orgSettings,
        stored as Record<string, unknown>,
      ) as unknown as SiteConfig;
    }
  } catch { /* org-settings not available — single-site mode */ }

  return { ...defs, ...stored };
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
    const { getTeamMembers } = await import("./team");
    const members = await getTeamMembers();
    return members.some((m) => generateCalendarToken(config.calendarSecret, m.userId) === token);
  } catch (err) {
    console.error("[calendar] token validation error:", err);
    return false;
  }
}

/** Read site config for a specific site (bypasses cookies) */
export async function readSiteConfigForSite(orgId: string, siteId: string): Promise<SiteConfig | null> {
  try {
    const { getSiteDataDir } = await import("./site-paths");
    const dataDir = await getSiteDataDir(orgId, siteId);
    if (!dataDir) return null;
    const filePath = path.join(dataDir, "site-config.json");
    const raw = await fs.readFile(filePath, "utf-8");
    const stored = JSON.parse(raw) as Partial<SiteConfig>;
    clearRedactedSecrets(stored as Record<string, unknown>, SECRET_FIELDS["site-config.json"]!);
    const defs = await defaults();

    // F87: Org-level settings inheritance
    try {
      const { readOrgSettingsForOrg, mergeConfigs } = await import("./org-settings");
      const orgSettings = await readOrgSettingsForOrg(orgId) as Record<string, unknown>;
      if (Object.keys(orgSettings).length > 0) {
        return mergeConfigs(
          defs as unknown as Record<string, unknown>,
          orgSettings,
          stored as Record<string, unknown>,
        ) as unknown as SiteConfig;
      }
    } catch { /* org-settings not available */ }

    return { ...defs, ...stored };
  } catch {
    return null;
  }
}

/** Validate calendar token for a specific site (no cookies needed) */
export async function validateCalendarTokenForSite(token: string, orgId: string, siteId: string): Promise<boolean> {
  try {
    const config = await readSiteConfigForSite(orgId, siteId);
    if (!config?.calendarSecret) return false;
    const { getTeamMembersForSite } = await import("./team");
    const members = await getTeamMembersForSite(orgId, siteId);
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
