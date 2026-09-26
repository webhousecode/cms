/**
 * F201.1 — find every data processor used across ALL cardmem projects.
 *
 *   npx tsx scripts/compliance-scan.ts            # writes compliance/compliance.yaml + compliance/scan-report.md
 *   npx tsx scripts/compliance-scan.ts --only cms # one project (debugging)
 *
 * Measured, not remembered: the project list comes from cardmem live, each
 * repo is shallow-cloned from GitHub (main as it is now, not a stale local
 * checkout), and every finding carries repo + file:line.
 *
 * A project that could not be read is reported as NOT SCANNED with a reason —
 * never as "no vendors". An empty result and an unread repo must not look alike.
 *
 * Only env-var NAMES are recorded, never values. .env files are not read.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(homedir(), ".cache", "compliance-scan");
const OUT_DIR = path.join(ROOT, "compliance");

// ── Vendor catalogue ─────────────────────────────────────────────────────────
// Signals that PROVE a vendor is used. npm = dependency name (exact, or prefix
// ending in "/"); env = env-var name regex; host = hostname regex in source.
type Vendor = { id: string; name: string; purpose: string; npm?: string[]; env?: RegExp; host?: RegExp };

export const VENDORS: Vendor[] = [
  { id: "fly", name: "Fly.io", purpose: "Hosting", env: /^FLY_(API_TOKEN|APP_NAME)$/, host: /(^|\.)fly\.(dev|io)$|api\.machines\.dev$/ },
  { id: "tigris", name: "Tigris", purpose: "Objektlager", host: /tigris\.dev$|storage\.tigris/, env: /^TIGRIS_/ },
  { id: "cloudflare", name: "Cloudflare", purpose: "DNS, CDN, R2-lager, Turnstile", npm: ["@broberg/forms-turnstile", "wrangler"], env: /^(CF_|CLOUDFLARE_|R2_|TURNSTILE_)/, host: /cloudflare\.com$|r2\.cloudflarestorage\.com$|r2\.dev$|workers\.dev$/ },
  { id: "resend", name: "Resend", purpose: "Transaktionsmails", npm: ["resend", "@broberg/mail"], env: /^RESEND_/, host: /api\.resend\.com$/ },
  { id: "stripe", name: "Stripe", purpose: "Betaling", npm: ["stripe", "@stripe/"], env: /^STRIPE_/, host: /stripe\.com$/ },
  { id: "supabase", name: "Supabase", purpose: "Database + auth", npm: ["@supabase/"], env: /^(NEXT_PUBLIC_)?SUPABASE_/, host: /supabase\.(co|com)$/ },
  { id: "turso", name: "Turso", purpose: "Database (libSQL)", npm: ["@libsql/client", "@broberg/db-sdk"], env: /^TURSO_/, host: /turso\.(io|tech)$/ },
  { id: "aws", name: "Amazon Web Services", purpose: "Hosting/lager (S3/Lightsail)", npm: ["@aws-sdk/", "aws-sdk"], host: /amazonaws\.com$/ },
  { id: "mistral", name: "Mistral AI", purpose: "AI-modeller (EU)", npm: ["@mistralai/"], env: /^MISTRAL_/, host: /mistral\.ai$/ },
  { id: "openai", name: "OpenAI", purpose: "AI-modeller", npm: ["openai", "@ai-sdk/openai"], env: /^OPENAI_/, host: /openai\.com$/ },
  { id: "anthropic", name: "Anthropic", purpose: "AI-modeller", npm: ["@anthropic-ai/", "@ai-sdk/anthropic"], env: /^ANTHROPIC_/, host: /anthropic\.com$/ },
  { id: "google-ai", name: "Google (Gemini/Vertex AI)", purpose: "AI-modeller", npm: ["@google/genai", "@google/generative-ai", "@ai-sdk/google", "@google-cloud/vertexai"], env: /^(GOOGLE_GENERATIVE_AI_|GEMINI_|GOOGLE_VERTEX_)/, host: /generativelanguage\.googleapis\.com$|aiplatform\.googleapis\.com$/ },
  { id: "deepinfra", name: "DeepInfra", purpose: "AI-modeller", env: /^DEEPINFRA_/, host: /deepinfra\.com$/ },
  { id: "openrouter", name: "OpenRouter", purpose: "AI-routing", env: /^OPENROUTER_/, host: /openrouter\.ai$/ },
  { id: "deepseek", name: "DeepSeek", purpose: "AI-modeller", env: /^DEEPSEEK_/, host: /deepseek\.com$/ },
  { id: "elevenlabs", name: "ElevenLabs", purpose: "Tale (TTS)", npm: ["elevenlabs", "@elevenlabs/"], env: /^ELEVENLABS_/, host: /elevenlabs\.io$/ },
  { id: "azure", name: "Microsoft Azure", purpose: "Tale/AI", npm: ["microsoft-cognitiveservices-speech-sdk"], env: /^AZURE_/, host: /(azure\.com|cognitive\.microsoft\.com|microsoftonline\.com)$/ },
  { id: "bfl", name: "Black Forest Labs", purpose: "Billedgenerering", env: /^BFL_/, host: /bfl\.(ai|ml)$/ },
  { id: "recraft", name: "Recraft", purpose: "Billed-/logogenerering", env: /^RECRAFT_/, host: /recraft\.ai$/ },
  { id: "replicate", name: "Replicate", purpose: "AI-modeller", npm: ["replicate"], env: /^REPLICATE_/, host: /replicate\.(com|delivery)$/ },
  { id: "github", name: "GitHub", purpose: "Kode, CI, API", npm: ["@octokit/", "octokit"], env: /^(GITHUB_|GH_)(TOKEN|APP|OAUTH|CLIENT)/, host: /(api\.)?github\.com$|githubusercontent\.com$/ },
  { id: "google-workspace", name: "Google (Workspace/Gmail/Calendar/OAuth)", purpose: "Mail, kalender, login", npm: ["googleapis", "google-auth-library", "@googleapis/"], env: /^GOOGLE_(CLIENT|OAUTH|SERVICE_ACCOUNT|CALENDAR)/, host: /(gmail|www|oauth2|accounts|calendar|meet|drive|openidconnect)\.googleapis\.com$|(accounts|mail|meet|drive)\.google\.com$/ },
  { id: "google-maps", name: "Google Maps", purpose: "Kort", env: /^(NEXT_PUBLIC_)?GOOGLE_MAPS_/, host: /maps\.googleapis\.com$|maps\.google\.com$/ },
  { id: "google-psi", name: "Google PageSpeed Insights", purpose: "Performance-måling", env: /^GOOGLE_PSI_/, host: /pagespeedonline\.googleapis\.com$/ },
  { id: "firebase", name: "Google Firebase (FCM)", purpose: "Push-notifikationer", npm: ["firebase-admin", "firebase"], env: /^FIREBASE_/, host: /fcm\.googleapis\.com$|firebaseio\.com$/ },
  { id: "apple", name: "Apple (APNs/Sign in/App Store)", purpose: "Push, login, app-distribution", env: /^(APNS_|APPLE_|ASC_)/, host: /(push\.apple\.com|appleid\.apple\.com|appstoreconnect\.apple\.com|api\.push\.apple\.com)$/ },
  { id: "webpush", name: "Web Push (browserens push-tjeneste)", purpose: "Push-notifikationer", npm: ["web-push", "@broberg/webpush"], env: /^VAPID_/ },
  { id: "linkedin", name: "LinkedIn", purpose: "Login", env: /^LINKEDIN_/, host: /linkedin\.com$/ },
  { id: "microsoft-login", name: "Microsoft (login)", purpose: "Login", env: /^(MICROSOFT_|ENTRA_)/ },
  { id: "simply", name: "Simply.com", purpose: "Domæner/DNS", env: /^SIMPLY_/, host: /simply\.com$/ },
  { id: "pcloud", name: "pCloud", purpose: "Backup-lager", env: /^PCLOUD_/, host: /pcloud\.com$/ },
  { id: "sentry", name: "Sentry", purpose: "Fejlovervågning", npm: ["@sentry/"], env: /^SENTRY_/, host: /sentry\.io$/ },
  { id: "posthog", name: "PostHog", purpose: "Analyse", npm: ["posthog-js", "posthog-node"], env: /^(NEXT_PUBLIC_)?POSTHOG_/, host: /posthog\.com$/ },
  { id: "plausible", name: "Plausible", purpose: "Analyse", host: /plausible\.io$/ },
  { id: "gatewayapi", name: "GatewayAPI", purpose: "SMS", env: /^GATEWAYAPI_/, host: /gatewayapi\.(com|eu)$/ },
  { id: "twilio", name: "Twilio", purpose: "SMS/tale", npm: ["twilio"], env: /^TWILIO_/, host: /twilio\.com$/ },
  { id: "complimenta", name: "Complimenta", purpose: "Booking (klinik-system)", npm: ["@broberg/complimenta-sdk"], env: /^COMPLIMENTA_/, host: /complimenta/ },
  { id: "opkald", name: "Opkald.ai", purpose: "Telefonsvarer/opkald", env: /^OPKALD_/, host: /opkald\.ai$/ },
  { id: "zoom", name: "Zoom", purpose: "Videomøder", env: /^ZOOM_/, host: /zoom\.us$/ },
  { id: "daily", name: "Daily.co", purpose: "Videomøder", npm: ["@daily-co/"], env: /^DAILY_/, host: /daily\.co$/ },
  { id: "livekit", name: "LiveKit", purpose: "Video/lyd i realtid", npm: ["livekit-server-sdk", "livekit-client"], env: /^LIVEKIT_/, host: /livekit\.(io|cloud)$/ },
  { id: "mux", name: "Mux", purpose: "Video", npm: ["@mux/"], env: /^MUX_/, host: /mux\.com$/ },
  { id: "opensubtitles", name: "OpenSubtitles", purpose: "Undertekster", env: /^OPENSUBTITLES_/, host: /opensubtitles\.(com|org)$/ },
  { id: "subdl", name: "SubDL", purpose: "Undertekster", env: /^SUBDL_/, host: /subdl\.com$/ },
  { id: "tmdb", name: "TMDB", purpose: "Filmdata", env: /^TMDB_/, host: /themoviedb\.org$/ },
  { id: "dataforseo", name: "DataForSEO", purpose: "SEO-data", env: /^DATAFORSEO_/, host: /dataforseo\.com$/ },
  { id: "unsplash", name: "Unsplash", purpose: "Billeder", env: /^UNSPLASH_/, host: /unsplash\.com$/ },
  { id: "pexels", name: "Pexels", purpose: "Billeder", env: /^PEXELS_/, host: /pexels\.com$/ },
  { id: "dawa", name: "DAWA (Dataforsyningen)", purpose: "Adresseopslag", host: /dataforsyningen\.dk$|dawa\.aws\.dk$/ },
  { id: "upstash", name: "Upstash", purpose: "Redis/kø", npm: ["@upstash/"], env: /^UPSTASH_/, host: /upstash\.io$/ },
  { id: "neon", name: "Neon", purpose: "Database", npm: ["@neondatabase/"], host: /neon\.tech$/ },
  { id: "vercel", name: "Vercel", purpose: "Hosting", env: /^VERCEL_/, host: /vercel\.(app|com)$/ },
  { id: "netlify", name: "Netlify", purpose: "Hosting", env: /^NETLIFY_/, host: /netlify\.(app|com)$/ },
  { id: "algolia", name: "Algolia", purpose: "Søgning", npm: ["algoliasearch"], env: /^ALGOLIA_/, host: /algolia\.net$/ },
  { id: "npm", name: "npm", purpose: "Pakke-udgivelse", host: /registry\.npmjs\.org$/ },
  { id: "smsdk", name: "SMS.dk", purpose: "SMS", env: /^SMSDK_/, host: /(^|\.)sms\.dk$/ },
  { id: "verda", name: "Verda (GPU-cloud)", purpose: "GPU/AI-hosting", env: /^VERDA_/, host: /verda\.com$/ },
  { id: "tailscale", name: "Tailscale", purpose: "Privat netværk", env: /^TAILSCALE_|^TS_AUTHKEY$/, host: /ts\.net$|tailscale\.com$/ },
  { id: "google-play", name: "Google Play", purpose: "App-distribution", host: /androidpublisher\.googleapis\.com$|play\.google\.com$/ },
  { id: "deepl", name: "DeepL", purpose: "Oversættelse", npm: ["deepl-node"], env: /^DEEPL_/, host: /deepl\.com$/ },
  { id: "fal", name: "fal.ai", purpose: "AI-modeller (billede/video)", npm: ["@fal-ai/"], env: /^FAL_/, host: /fal\.(ai|run)$/ },
  { id: "huggingface", name: "Hugging Face", purpose: "AI-modeller", npm: ["@huggingface/"], env: /^(HF_|HUGGINGFACE_)/, host: /huggingface\.co$/ },
  { id: "runpod", name: "RunPod", purpose: "GPU/AI-hosting", env: /^RUNPOD_/, host: /runpod\.(io|net)$/ },
  { id: "requesty", name: "Requesty", purpose: "AI-routing", env: /^REQUESTY_/, host: /requesty\.ai$/ },
  { id: "tavily", name: "Tavily", purpose: "Websøgning (AI)", env: /^TAVILY_/, host: /tavily\.com$/ },
  { id: "brave", name: "Brave Search", purpose: "Websøgning", env: /^BRAVE_/, host: /search\.brave\.com$|api\.search\.brave\.com$/ },
  { id: "perplexity", name: "Perplexity", purpose: "AI-søgning", env: /^PERPLEXITY_/, host: /perplexity\.ai$/ },
  { id: "bunny", name: "Bunny.net", purpose: "CDN/lager", env: /^BUNNY_/, host: /(bunny\.net|b-cdn\.net|bunnycdn\.com)$/ },
  { id: "backblaze", name: "Backblaze B2", purpose: "Objektlager/backup", env: /^(B2_|BACKBLAZE_)/, host: /backblazeb2\.com$/ },
  { id: "scaleway", name: "Scaleway", purpose: "Hosting/lager (EU)", env: /^SCW_/, host: /scw\.cloud$/ },
  { id: "hetzner", name: "Hetzner", purpose: "Hosting/lager (EU)", env: /^HETZNER_/, host: /(hetzner\.(com|cloud)|your-objectstorage\.com)$/ },
  { id: "forwardemail", name: "Forward Email", purpose: "Mail-videresendelse", env: /^FORWARD_EMAIL_/, host: /forwardemail\.net$/ },
  { id: "inmobile", name: "inMobile", purpose: "SMS", env: /^INMOBILE_/, host: /inmobile\.(com|dk)$/ },
  { id: "quickpay", name: "QuickPay", purpose: "Betaling", env: /^QUICKPAY_/, host: /quickpay\.net$/ },
  { id: "polar", name: "Polar", purpose: "Betaling/abonnement", npm: ["@polar-sh/"], env: /^POLAR_/, host: /polar\.sh$/ },
  { id: "flexprice", name: "Flexprice", purpose: "Fakturering/forbrug", env: /^FLEXPRICE_/, host: /flexprice\.io$/ },
  { id: "piwik", name: "Piwik PRO", purpose: "Analyse", host: /piwik\.pro$/ },
  { id: "google-analytics", name: "Google Analytics", purpose: "Analyse", env: /^(NEXT_PUBLIC_)?(GA_|GA4_)/, host: /google-analytics\.com$|googletagmanager\.com$/ },
  { id: "slack", name: "Slack", purpose: "Notifikationer", env: /^SLACK_/, host: /(^|\.)slack\.com$/ },
  { id: "discord", name: "Discord", purpose: "Notifikationer", env: /^DISCORD_/, host: /discord\.com$/ },
  { id: "gravatar", name: "Gravatar", purpose: "Profilbilleder (mail-hash)", host: /gravatar\.com$/ },
  { id: "vimeo", name: "Vimeo", purpose: "Video", env: /^VIMEO_/, host: /(vimeo\.com|vimeocdn\.com)$/ },
];

// Our own services — processors only via their host (Fly), not third parties.
const OWN_HOSTS = /(^|\.)(broberg\.(ai|dk)|webhouse\.(app|dk|net)|cardmem\.com|trailmem\.com|upmetrics\.org|fdaalborg\.dk|sanneandersen\.dk|xrt81\.com|localhost)$/;
// Hosts that appear in code but carry no data (docs, schemas, fonts, examples).
// Public reference-data APIs: we send a lookup key (a CVR number, a date, a
// film title), never personal data. Listed so they stop drowning the review list.
const PUBLIC_DATA_HOSTS = /(^|\.)(openstreetmap\.org|cvrapi\.dk|cvr\.dk|nager\.at|frankfurter\.dev|er-api\.com|calendarific\.com|discogs\.com|musicbrainz\.org|tvmaze\.com|imdb\.com|tmdb\.org|openlibrary\.org|wikidata\.org|wikiquote\.org|brandfetch\.(io|com)|retsinformation\.dk|datatilsynet\.dk|europa\.eu|archive\.org)$/;
const NOISE_HOSTS = /(^|\.)((example|eksempel)\.[a-z]+|[a-z0-9-]+\.(example|invalid|test|local|internal|flycast|tld)|w3\.org|schema\.org|json-schema\.org|mozilla\.org|developer\.mozilla\.org|wikipedia\.org|reactjs\.org|nextjs\.org|tailwindcss\.com|typescriptlang\.org|nodejs\.org|fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|shields\.io|opensource\.org|spdx\.org|x\.com|twitter\.com|facebook\.com|instagram\.com|youtube\.com|youtu\.be)$/;

const TEXT_EXT = /\.(ts|tsx|js|mjs|cjs|jsx|json|toml|ya?ml|sh|swift|kt|py|go|rb|php|cs|java|html?|astro|vue|svelte|env\.example|example)$/i;
const SKIP_PATH = /(^|\/)(node_modules|dist|build|\.next|vendor|coverage|\.git)\//;
// Not evidence of USE: fleet hooks, tests, fixtures, docs and examples mention
// vendors without sending them anything.
const NOT_USE = /(^|\/)(\.claude|__tests__|tests?|fixtures?|docs?|examples?)\/|\.(test|spec)\.[a-z]+$/;

type Hit = { repo: string; file: string; line: number; signal: string };
type ProjectResult = {
  slug: string; repo: string | null; status: "scanned" | "not_scanned"; reason?: string;
  sha?: string; files?: number; flyRegions?: { app: string; region: string; file: string }[];
};

function sh(cmd: string, args: string[], cwd?: string): string {
  return execFileSync(cmd, args, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 256 * 1024 * 1024 });
}

async function listProjects(): Promise<{ slug: string; repo: string | null }[]> {
  const token = process.env.CARDMEM_MCP_TOKEN
    ?? JSON.parse(readFileSync(path.join(ROOT, ".mcp.json"), "utf-8")).mcpServers.cardmem.headers.Authorization;
  const res = await fetch("https://services.cardmem.com/mcp", {
    method: "POST",
    headers: { authorization: token.startsWith("Bearer") ? token : `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "cardmem_list_projects", arguments: {} } }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`cardmem list_projects: HTTP ${res.status}`);
  const body = await res.text();
  const data = body.split("\n").find((l) => l.startsWith("data:"));
  const msg = JSON.parse(data ? data.slice(5) : body);
  if (msg.error) throw new Error(`cardmem list_projects: ${JSON.stringify(msg.error)}`);
  const projects = JSON.parse(msg.result.content[0].text).projects as { slug: string; github_repo_full_name: string | null }[];
  if (!projects.length) throw new Error("cardmem returned 0 projects — refusing to report an empty fleet as clean");
  return projects.map((p) => ({ slug: p.slug, repo: p.github_repo_full_name }));
}

/** Shallow clone (or refresh) origin's default branch into our own cache. */
export function checkout(repo: string, cacheDir = CACHE): { dir: string; sha: string } {
  const dir = path.join(cacheDir, repo.replace("/", "__"));
  mkdirSync(cacheDir, { recursive: true });
  if (existsSync(path.join(dir, ".git"))) {
    sh("git", ["fetch", "--depth", "1", "origin", "HEAD"], dir);
    sh("git", ["reset", "--hard", "FETCH_HEAD"], dir);
  } else {
    sh("gh", ["repo", "clone", repo, dir, "--", "--depth", "1"]);
  }
  return { dir, sha: sh("git", ["rev-parse", "--short", "HEAD"], dir).trim() };
}

function npmMatch(dep: string): Vendor[] {
  return VENDORS.filter((v) => v.npm?.some((n) => (n.endsWith("/") ? dep.startsWith(n) : dep === n)));
}

/** Scan one checked-out repo. Exported for tests. */
export function scanDir(repo: string, dir: string) {
  const files = sh("git", ["ls-files"], dir).split("\n").filter((f) => f && !SKIP_PATH.test(f) && !NOT_USE.test(f) && (TEXT_EXT.test(f) || /(^|\/)(Dockerfile|fly\.toml|\.env\.example)$/.test(f)));
  const hits = new Map<string, Hit[]>();
  const unknownHosts = new Map<string, Hit[]>();
  const flyRegions: { app: string; region: string; file: string }[] = [];
  const add = (m: Map<string, Hit[]>, k: string, h: Hit) => { const a = m.get(k) ?? []; if (a.length < 5) a.push(h); m.set(k, a); };

  for (const file of files) {
    const full = path.join(dir, file);
    let text: string;
    try { if (statSync(full).size > 2_000_000) continue; text = readFileSync(full, "utf-8"); } catch { continue; }
    const lines = text.split("\n");

    if (file.endsWith("package.json")) {
      try {
        const pkg = JSON.parse(text);
        for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies })) {
          const line = lines.findIndex((l) => l.includes(`"${dep}"`)) + 1;
          for (const v of npmMatch(dep)) add(hits, v.id, { repo, file, line, signal: `npm ${dep}` });
        }
      } catch { /* not JSON — scanned as text below */ }
    }
    if (/(^|\/)fly\.toml$/.test(file)) {
      const app = text.match(/^app\s*=\s*['"]([^'"]+)/m)?.[1] ?? "?";
      const region = text.match(/^primary_region\s*=\s*['"]([^'"]+)/m)?.[1] ?? "(ikke angivet)";
      flyRegions.push({ app, region, file });
      add(hits, "fly", { repo, file, line: 1, signal: `fly.toml app=${app}` });
    }

    lines.forEach((l, i) => {
      for (const m of l.matchAll(/\b([A-Z][A-Z0-9_]{3,})\b/g)) {
        for (const v of VENDORS) if (v.env?.test(m[1])) add(hits, v.id, { repo, file, line: i + 1, signal: `env ${m[1]}` });
      }
      for (const m of l.matchAll(/https?:\/\/([a-z0-9][a-z0-9.-]*\.[a-z]{2,})/gi)) {
        const host = m[1].toLowerCase();
        const v = VENDORS.find((x) => x.host?.test(host));
        if (v) add(hits, v.id, { repo, file, line: i + 1, signal: `host ${host}` });
        else if (!OWN_HOSTS.test(host) && !NOISE_HOSTS.test(host) && !PUBLIC_DATA_HOSTS.test(host)) add(unknownHosts, host, { repo, file, line: i + 1, signal: `host ${host}` });
      }
    });
  }
  return { files: files.length, hits, unknownHosts, flyRegions };
}

/**
 * One project → a result that says SCANNED or NOT SCANNED (with why). A repo we
 * cannot read must never come back looking like a repo with no vendors.
 */
export function scanProject(p: { slug: string; repo: string | null }, cacheDir = CACHE) {
  if (!p.repo) return { result: { slug: p.slug, repo: null, status: "not_scanned", reason: "intet repo registreret i cardmem" } as ProjectResult, scan: null };
  let co: { dir: string; sha: string };
  try { co = checkout(p.repo, cacheDir); } catch (e) {
    const reason = `kunne ikke klones: ${String((e as Error).message).split("\n")[0].slice(0, 160)}`;
    return { result: { slug: p.slug, repo: p.repo, status: "not_scanned", reason } as ProjectResult, scan: null };
  }
  const scan = scanDir(p.repo, co.dir);
  if (scan.files === 0) {
    return { result: { slug: p.slug, repo: p.repo, status: "not_scanned", reason: "0 læsbare filer i repoet", sha: co.sha } as ProjectResult, scan: null };
  }
  return { result: { slug: p.slug, repo: p.repo, status: "scanned", sha: co.sha, files: scan.files, flyRegions: scan.flyRegions } as ProjectResult, scan };
}

// ── YAML (tiny emitter; the file is ours and flat) ───────────────────────────
const q = (s: string) => JSON.stringify(s);

async function main() {
  const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;
  const projects = (await listProjects()).filter((p) => !only || p.slug === only);
  const results: ProjectResult[] = [];
  const vendorHits = new Map<string, Hit[]>();
  const vendorProducts = new Map<string, Set<string>>();
  const unknown = new Map<string, Hit[]>();

  for (const p of projects) {
    const { result, scan: r } = scanProject(p);
    results.push(result);
    if (!r) continue;
    for (const [id, hs] of r.hits) {
      vendorHits.set(id, [...(vendorHits.get(id) ?? []), ...hs.slice(0, 2)]);
      (vendorProducts.get(id) ?? vendorProducts.set(id, new Set()).get(id)!).add(p.slug);
    }
    for (const [h, hs] of r.unknownHosts) unknown.set(h, [...(unknown.get(h) ?? []), hs[0]]);
    process.stderr.write(`${p.slug}: ${r.files} filer, ${r.hits.size} leverandører\n`);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const scanned = results.filter((r) => r.status === "scanned");
  const y: string[] = [
    "# F201 — compliance-kilden. Genereret af scripts/compliance-scan.ts; F201.2 udfylder vurderingsfelterne.",
    `scanned_at: ${q(new Date().toISOString())}`,
    `projects_total: ${results.length}`,
    `projects_scanned: ${scanned.length}`,
    "vendors:",
  ];
  for (const v of VENDORS) {
    const hs = vendorHits.get(v.id);
    if (!hs) continue;
    const regions = scanned.flatMap((r) => (vendorProducts.get(v.id)?.has(r.slug) && v.id === "fly" ? r.flyRegions ?? [] : []));
    y.push(`  - id: ${v.id}`, `    name: ${q(v.name)}`, `    purpose: ${q(v.purpose)}`,
      `    products: [${[...vendorProducts.get(v.id)!].sort().map(q).join(", ")}]`);
    if (v.id === "fly") y.push(`    regions: [${[...new Set(regions.map((r) => r.region))].sort().map(q).join(", ")}]`);
    y.push("    evidence:");
    for (const h of hs.slice(0, 8)) y.push(`      - ${q(`${h.repo} ${h.file}:${h.line} (${h.signal})`)}`);
    y.push("    # F201.2", "    dpa_status: null", "    dpa_url: null", "    transfer_basis: null", "    eu_region_possible: null", "    checked_at: null");
  }
  y.push("not_scanned:");
  for (const r of results.filter((x) => x.status === "not_scanned")) y.push(`  - { project: ${q(r.slug)}, repo: ${q(r.repo ?? "")}, reason: ${q(r.reason ?? "")} }`);
  writeFileSync(path.join(OUT_DIR, "compliance.yaml"), y.join("\n") + "\n");

  const rep: string[] = [
    "# F201.1 — scanningsrapport", "",
    `Kørt ${new Date().toISOString()} · ${scanned.length} af ${results.length} projekter scannet.`, "",
    "## Projekter", "", "| projekt | repo | status | commit | filer | Fly-regioner |", "|---|---|---|---|---|---|",
    ...results.map((r) => `| ${r.slug} | ${r.repo ?? "—"} | ${r.status === "scanned" ? "scannet" : `**IKKE scannet:** ${r.reason}`} | ${r.sha ?? ""} | ${r.files ?? ""} | ${(r.flyRegions ?? []).map((f) => `${f.app}=${f.region}`).join(", ")} |`),
    "", "## Leverandører", "", "| leverandør | produkter |", "|---|---|",
    ...VENDORS.filter((v) => vendorProducts.has(v.id)).map((v) => `| ${v.name} | ${[...vendorProducts.get(v.id)!].sort().join(", ")} |`),
    "", "## Ukendte udgående værter (skal vurderes — kan være en overset leverandør)", "",
    ...[...unknown.entries()].sort().map(([h, hs]) => `- \`${h}\` — ${hs.slice(0, 3).map((x) => `${x.repo} ${x.file}:${x.line}`).join("; ")}`),
  ];
  // Cross-check against the fleet's own infra register (discovery.broberg.ai).
  // Every entry must either be a vendor we found, or be named here with why not.
  const NOT_A_VENDOR: Record<string, string> = {
    pitch: "vores egen tjeneste (Pitch Vault), hostet på Fly",
    "image-processing": "bibliotek (sharp) der kører på vores egne maskiner — ingen tredjepart",
    "github-actions": "del af GitHub, som står på listen",
    frontend: "kategori af browser-kode, ikke en leverandør",
    "ai-providers": "kategori; de enkelte AI-leverandører står på listen hver for sig",
    "fleet-ops": "vores egen drift af udviklingsmaskiner, ingen kundedata",
    documents: "PDF-generering på vores egne maskiner — ingen tredjepart",
    "macos-native": "kategori (app-signering); Apple står på listen",
  };
  rep.push("", "## Krydstjek mod discovery.broberg.ai/api/infra", "");
  try {
    const infra = (await (await fetch("https://discovery.broberg.ai/api/infra", { signal: AbortSignal.timeout(15_000) })).json()).infra as { id: string; name: string }[];
    for (const i of infra) {
      const found = vendorHits.has(i.id);
      rep.push(`- ${i.name} (\`${i.id}\`): ${found ? "fundet i scanningen" : NOT_A_VENDOR[i.id] ? `ikke med — ${NOT_A_VENDOR[i.id]}` : "**MANGLER — hverken fundet eller begrundet**"}`);
    }
  } catch (e) {
    rep.push(`**Krydstjek kunne ikke køres:** ${(e as Error).message}`);
  }
  writeFileSync(path.join(OUT_DIR, "scan-report.md"), rep.join("\n") + "\n");
  process.stderr.write(`\n${scanned.length}/${results.length} scannet · ${vendorHits.size} leverandører · ${unknown.size} ukendte værter\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(e); process.exit(1); });
