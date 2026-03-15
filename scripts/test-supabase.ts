/**
 * Integration test for the Supabase storage adapter.
 * Requires a running Supabase instance with exec_sql RPC function.
 *
 * Usage: npx tsx scripts/test-supabase.ts [supabase-url]
 */

const SUPABASE_URL = process.argv[2] ?? "http://ubuntu:54321";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

let passed = 0;
let failed = 0;

function ok(name: string) { console.log(`  ${green("✓")} ${name}`); passed++; }
function fail(name: string, err: unknown) { console.log(`  ${red("✗")} ${name}: ${err}`); failed++; }

async function main() {
  console.log(`\nTesting Supabase adapter against ${dim(SUPABASE_URL)}\n`);

  // Dynamic import to avoid compile-time resolution
  const { SupabaseStorageAdapter } = await import("../packages/cms/src/storage/supabase/adapter.js");

  const adapter = new SupabaseStorageAdapter({
    url: SUPABASE_URL,
    anonKey: ANON_KEY,
    serviceKey: SERVICE_KEY,
    tableName: "cms_test_documents",
  });

  // ── Initialize ──
  try {
    await adapter.initialize();
    ok("initialize()");
  } catch (e) { fail("initialize()", e); }

  // ── Migrate ──
  try {
    await adapter.migrate(["posts", "pages"]);
    ok("migrate() — table created");
  } catch (e) { fail("migrate()", e); }

  // ── Create ──
  let docId = "";
  try {
    const doc = await adapter.create("posts", {
      slug: "test-post",
      status: "draft",
      data: { title: "Test Post", content: "Hello from Supabase!", tags: ["test", "supabase"] },
    });
    docId = doc.id;
    if (doc.slug !== "test-post") throw new Error(`slug mismatch: ${doc.slug}`);
    if (doc.data.title !== "Test Post") throw new Error(`title mismatch`);
    if (doc.status !== "draft") throw new Error(`status mismatch: ${doc.status}`);
    ok("create() — document created");
  } catch (e) { fail("create()", e); }

  // ── findBySlug ──
  try {
    const doc = await adapter.findBySlug("posts", "test-post");
    if (!doc) throw new Error("not found");
    if (doc.id !== docId) throw new Error(`id mismatch: ${doc.id}`);
    if (doc.data.title !== "Test Post") throw new Error(`title mismatch`);
    ok("findBySlug() — found by slug");
  } catch (e) { fail("findBySlug()", e); }

  // ── findById ──
  try {
    const doc = await adapter.findById("posts", docId);
    if (!doc) throw new Error("not found");
    if (doc.slug !== "test-post") throw new Error(`slug mismatch`);
    ok("findById() — found by id");
  } catch (e) { fail("findById()", e); }

  // ── findMany ──
  try {
    // Create a second doc
    await adapter.create("posts", {
      slug: "second-post",
      status: "published",
      data: { title: "Second Post", content: "Published!", tags: ["test"] },
    });

    const { documents, total } = await adapter.findMany("posts");
    if (total < 2) throw new Error(`expected >= 2, got ${total}`);
    ok(`findMany() — ${total} documents found`);
  } catch (e) { fail("findMany()", e); }

  // ── findMany with status filter ──
  try {
    const { documents } = await adapter.findMany("posts", { status: "published" });
    if (documents.length < 1) throw new Error("expected at least 1 published");
    if (documents.some(d => d.status !== "published")) throw new Error("status filter broken");
    ok("findMany(status: published) — filtered correctly");
  } catch (e) { fail("findMany(status filter)", e); }

  // ── findMany with pagination ──
  try {
    const { documents } = await adapter.findMany("posts", { limit: 1, offset: 0 });
    if (documents.length !== 1) throw new Error(`expected 1, got ${documents.length}`);
    ok("findMany(limit: 1) — pagination works");
  } catch (e) { fail("findMany(pagination)", e); }

  // ── Update ──
  try {
    const updated = await adapter.update("posts", docId, {
      data: { title: "Updated Title" },
      status: "published",
    });
    if (updated.data.title !== "Updated Title") throw new Error("title not updated");
    if (updated.status !== "published") throw new Error("status not updated");
    if (updated.data.content !== "Hello from Supabase!") throw new Error("content was lost");
    ok("update() — title and status updated, content preserved");
  } catch (e) { fail("update()", e); }

  // ── Update slug ──
  try {
    const updated = await adapter.update("posts", docId, { slug: "renamed-post" });
    if (updated.slug !== "renamed-post") throw new Error(`slug not updated: ${updated.slug}`);
    // Verify findBySlug with new slug
    const found = await adapter.findBySlug("posts", "renamed-post");
    if (!found) throw new Error("not found by new slug");
    ok("update(slug) — slug renamed successfully");
  } catch (e) { fail("update(slug)", e); }

  // ── Delete ──
  try {
    await adapter.delete("posts", docId);
    const gone = await adapter.findById("posts", docId);
    if (gone) throw new Error("document still exists after delete");
    ok("delete() — document removed");
  } catch (e) { fail("delete()", e); }

  // ── findBySlug returns null for missing ──
  try {
    const nope = await adapter.findBySlug("posts", "nonexistent-slug");
    if (nope !== null) throw new Error("expected null");
    ok("findBySlug(missing) — returns null");
  } catch (e) { fail("findBySlug(missing)", e); }

  // ── Cleanup ──
  try {
    // Delete remaining test docs
    const { documents } = await adapter.findMany("posts");
    for (const doc of documents) {
      await adapter.delete("posts", doc.id);
    }
    await adapter.close();
    ok("cleanup — all test documents removed");
  } catch (e) { fail("cleanup", e); }

  // ── Summary ──
  console.log(`\n${passed + failed} tests: ${green(`${passed} passed`)}${failed > 0 ? `, ${red(`${failed} failed`)}` : ""}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(red("Fatal:"), err);
  process.exit(1);
});
