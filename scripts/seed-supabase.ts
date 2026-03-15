import { SupabaseStorageAdapter } from "../packages/cms/src/storage/supabase/adapter.js";
import { createClient } from "@supabase/supabase-js";

const URL = process.argv[2] ?? "http://192.168.1.92:54321";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

async function main() {
  const adapter = new SupabaseStorageAdapter({
    url: URL, anonKey: ANON, serviceKey: SERVICE, tableName: "cms_documents",
  });

  // Migrate first (creates table)
  await adapter.migrate(["posts", "pages", "team"]);

  // Reload PostgREST schema cache so it sees the new table
  const admin = createClient(URL, SERVICE);
  await admin.rpc("exec_sql", { query: "NOTIFY pgrst, 'reload schema'" });
  await new Promise(r => setTimeout(r, 3000));

  // Now initialize (verifies connectivity)
  await adapter.initialize();

  const posts = [
    { slug: "why-file-based-cms", status: "published" as const, data: { title: "Why File-Based CMS is the Future", excerpt: "Git-committable content, no database, AI-native workflows.", content: "# Why File-Based CMS\n\nThe future of content management is files, not databases.\n\n## Git-native\nEvery change is a commit. Every deploy is a push.\n\n## AI-friendly\nJSON files are trivially parseable by AI models.\n\n## Zero infrastructure\nNo database to provision. Content lives next to code.", date: "2026-03-15", author: "Christian Broberg", tags: ["cms", "architecture"], category: "engineering" }},
    { slug: "building-with-ai-agents", status: "published" as const, data: { title: "Building with AI Agents: Lessons from @webhouse/cms", excerpt: "How we built an AI-native CMS where agents generate, rewrite, and optimize content.", content: "# Building with AI Agents\n\nWhat if AI wasn't an afterthought, but the primary content producer?\n\n## The Orchestrator Pattern\nA central engine coordinates specialized agents.\n\n## AI Lock\nField-level locks prevent AI from overwriting human edits.\n\n## Results\n85% AI-generated content. Humans curate and refine.", date: "2026-03-10", author: "Christian Broberg", tags: ["ai", "agents", "cms"], category: "engineering" }},
    { slug: "supabase-as-cms-backend", status: "published" as const, data: { title: "Using Supabase as a CMS Backend", excerpt: "Store CMS content in PostgreSQL via Supabase with full JSONB support.", content: "# Supabase as CMS Backend\n\nOur Supabase adapter stores content in PostgreSQL.\n\n## Why Supabase?\n- Real-time subscriptions\n- Row-level security\n- JSONB for flexible documents\n- Built-in auth", date: "2026-03-15", author: "Christian Broberg", tags: ["supabase", "postgresql"], category: "engineering" }},
    { slug: "webhouse-cms-v02", status: "draft" as const, data: { title: "Announcing @webhouse/cms v0.2", excerpt: "Block editor, GitHub OAuth, multi-site admin, Supabase adapter.", content: "# @webhouse/cms v0.2\n\nThis release brings the CMS from 'works for us' to 'works for everyone.'", date: "2026-03-15", tags: ["release", "cms"], category: "company" }},
  ];

  const pages = [
    { slug: "home", status: "published" as const, data: { title: "WebHouse — AI-native web development", description: "We build websites, platforms, and AI tools." }},
    { slug: "about", status: "published" as const, data: { title: "About WebHouse", description: "Founded in 1995. 30 years of building for the web." }},
    { slug: "contact", status: "published" as const, data: { title: "Contact", description: "Get in touch.", content: "Email: hello@webhouse.dk\nLocation: Aalborg, Denmark" }},
  ];

  const team = [
    { slug: "christian-broberg", status: "published" as const, data: { name: "Christian Broberg", role: "Founder & CEO", bio: "30 years of web development. Built the first Danish CMS in 1995.", sortOrder: 1 }},
    { slug: "mikkel-broberg", status: "published" as const, data: { name: "Mikkel Broberg", role: "Developer", bio: "Full-stack developer. React, Next.js, cloud infrastructure.", sortOrder: 2 }},
  ];

  for (const post of posts) {
    const doc = await adapter.create("posts", post);
    console.log("Created post:", doc.slug, `(${doc.status})`);
  }
  for (const page of pages) {
    const doc = await adapter.create("pages", page);
    console.log("Created page:", doc.slug);
  }
  for (const member of team) {
    const doc = await adapter.create("team", member);
    console.log("Created team:", doc.slug);
  }

  const { documents, total } = await adapter.findMany("posts", { status: "published" });
  console.log(`\nPublished posts: ${total}`);
  for (const doc of documents) {
    console.log(`  - ${doc.data.title} (${(doc.data.tags as string[]).join(", ")})`);
  }

  const { documents: allPages } = await adapter.findMany("pages");
  console.log(`Pages: ${allPages.length}`);

  const { documents: allTeam } = await adapter.findMany("team");
  console.log(`Team: ${allTeam.length}`);

  await adapter.close();
  console.log(`\nDone — check Supabase Studio at http://192.168.1.92:54323`);
}

main().catch(e => { console.error(e); process.exit(1); });
