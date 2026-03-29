/**
 * F80 — Auto-generate selector-map.json from CMS config + hardcoded UI elements.
 *
 * Reads cms.config.ts for the active site and builds a complete map of all
 * data-testid selectors available in the admin UI.
 *
 * Usage:
 *   npx tsx tests/helpers/generate-selector-map.ts [configPath]
 *
 * Output: tests/selector-map.json
 */
import fs from "fs";
import path from "path";

interface SelectorEntry {
  testId: string;
  selector: string;
  description: string;
}

interface SelectorMap {
  version: string;
  generated: string;
  navigation: SelectorEntry[];
  actions: SelectorEntry[];
  fields: SelectorEntry[];
  collections: SelectorEntry[];
  settings: SelectorEntry[];
  media: SelectorEntry[];
  layout: SelectorEntry[];
}

// ── Static selectors (always present) ──────────────────────

const NAVIGATION: SelectorEntry[] = [
  { testId: "sidebar", selector: '[data-testid="sidebar"]', description: "Main sidebar container" },
  { testId: "site-switcher", selector: '[data-testid="site-switcher"]', description: "Site switcher dropdown" },
  { testId: "org-switcher", selector: '[data-testid="org-switcher"]', description: "Organization switcher dropdown" },
  { testId: "nav-link-sites", selector: '[data-testid="nav-link-sites"]', description: "Sites page link" },
  { testId: "nav-link-dashboard", selector: '[data-testid="nav-link-dashboard"]', description: "Dashboard link" },
  { testId: "nav-link-cockpit", selector: '[data-testid="nav-link-cockpit"]', description: "AI Cockpit link" },
  { testId: "nav-link-agents", selector: '[data-testid="nav-link-agents"]', description: "Agents link" },
  { testId: "nav-link-curation", selector: '[data-testid="nav-link-curation"]', description: "Curation queue link" },
  { testId: "nav-link-calendar", selector: '[data-testid="nav-link-calendar"]', description: "Calendar link" },
  { testId: "nav-link-content", selector: '[data-testid="nav-link-content"]', description: "Content section toggle" },
  { testId: "nav-link-interactives", selector: '[data-testid="nav-link-interactives"]', description: "Interactives link" },
  { testId: "nav-link-media", selector: '[data-testid="nav-link-media"]', description: "Media library link" },
  { testId: "nav-link-tools", selector: '[data-testid="nav-link-tools"]', description: "Tools section toggle" },
  { testId: "nav-link-link-checker", selector: '[data-testid="nav-link-link-checker"]', description: "Link checker link" },
  { testId: "nav-link-seo", selector: '[data-testid="nav-link-seo"]', description: "SEO dashboard link" },
  { testId: "nav-link-backup", selector: '[data-testid="nav-link-backup"]', description: "Backup link" },
  { testId: "nav-link-search", selector: '[data-testid="nav-link-search"]', description: "Search trigger" },
  { testId: "nav-link-settings", selector: '[data-testid="nav-link-settings"]', description: "Settings link" },
  { testId: "nav-link-trash", selector: '[data-testid="nav-link-trash"]', description: "Trash link" },
];

const ACTIONS: SelectorEntry[] = [
  { testId: "action-bar", selector: '[data-testid="action-bar"]', description: "Action bar container" },
  { testId: "btn-save", selector: '[data-testid="btn-save"]', description: "Save button" },
  { testId: "btn-create", selector: '[data-testid="btn-create"]', description: "Create new document button" },
  { testId: "btn-publish", selector: '[data-testid="btn-publish"]', description: "Publish button" },
  { testId: "btn-delete", selector: '[data-testid="btn-delete"]', description: "Delete button" },
  { testId: "btn-trash", selector: '[data-testid="btn-trash"]', description: "Trash button" },
];

const SETTINGS: SelectorEntry[] = [
  "general", "team", "email", "ai", "deploy", "tools", "mcp",
  "brand-voice", "globals", "schema", "prompts",
].flatMap((tab) => [
  { testId: `settings-tab-${tab}`, selector: `[data-testid="settings-tab-${tab}"]`, description: `Settings tab: ${tab}` },
  { testId: `settings-panel-${tab}`, selector: `[data-testid="settings-panel-${tab}"]`, description: `Settings panel: ${tab}` },
  { testId: `panel-${tab}`, selector: `[data-testid="panel-${tab}"]`, description: `Panel component: ${tab}` },
]);

const LAYOUT: SelectorEntry[] = [
  { testId: "document-editor", selector: '[data-testid="document-editor"]', description: "Document editor wrapper" },
  { testId: "media-library", selector: '[data-testid="media-library"]', description: "Media library container" },
];

// ── Dynamic selectors (from CMS config) ────────────────────

function loadConfig(configPath: string): { collections: { name: string; fields: { name: string; type: string }[] }[] } | null {
  try {
    // Try loading as JSON first (for GitHub-backed sites)
    if (configPath.endsWith(".json")) {
      return JSON.parse(fs.readFileSync(configPath, "utf-8"));
    }
    // For .ts/.js, use jiti
    const jiti = require("jiti")(__filename, { interopDefault: true });
    const mod = jiti(configPath);
    return mod.default ?? mod;
  } catch (err) {
    console.warn(`Could not load config from ${configPath}:`, err);
    return null;
  }
}

function generateFieldSelectors(collections: { name: string; fields: { name: string; type: string }[] }[]): SelectorEntry[] {
  const entries: SelectorEntry[] = [];
  for (const col of collections) {
    for (const f of col.fields ?? []) {
      const testId = `field-${f.type}-${f.name}`;
      entries.push({
        testId,
        selector: `[data-testid="${testId}"]`,
        description: `${col.name}.${f.name} (${f.type})`,
      });
    }
  }
  // Deduplicate (same field name/type across collections)
  const seen = new Set<string>();
  return entries.filter((e) => {
    if (seen.has(e.testId)) return false;
    seen.add(e.testId);
    return true;
  });
}

function generateCollectionSelectors(collections: { name: string }[]): SelectorEntry[] {
  return collections.flatMap((col) => [
    { testId: `nav-link-collection-${col.name}`, selector: `[data-testid="nav-link-collection-${col.name}"]`, description: `Nav: ${col.name} collection` },
    { testId: `collection-list-${col.name}`, selector: `[data-testid="collection-list-${col.name}"]`, description: `Document list: ${col.name}` },
  ]);
}

// ── Main ───────────────────────────────────────────────────

async function main() {
  const configPath = process.argv[2] ?? process.env.CMS_CONFIG_PATH;

  const map: SelectorMap = {
    version: "1.0.0",
    generated: new Date().toISOString(),
    navigation: NAVIGATION,
    actions: ACTIONS,
    fields: [],
    collections: [],
    settings: SETTINGS,
    media: [],
    layout: LAYOUT,
  };

  if (configPath && fs.existsSync(configPath)) {
    const config = loadConfig(path.resolve(configPath));
    if (config?.collections) {
      map.fields = generateFieldSelectors(config.collections);
      map.collections = generateCollectionSelectors(config.collections);
    }
  } else {
    console.log("No CMS config found — generating static selectors only.");
    console.log("Pass config path as argument: npx tsx generate-selector-map.ts path/to/cms.config.ts");
  }

  const total = Object.values(map).reduce((sum, v) => sum + (Array.isArray(v) ? v.length : 0), 0);
  const outPath = path.join(__dirname, "..", "selector-map.json");
  fs.writeFileSync(outPath, JSON.stringify(map, null, 2));
  console.log(`\n✅ Selector map generated: ${outPath}`);
  console.log(`   Total selectors: ${total}`);
  console.log(`   Navigation: ${map.navigation.length}`);
  console.log(`   Actions: ${map.actions.length}`);
  console.log(`   Fields: ${map.fields.length}`);
  console.log(`   Collections: ${map.collections.length}`);
  console.log(`   Settings: ${map.settings.length}`);
  console.log(`   Layout: ${map.layout.length}`);
}

main().catch(console.error);
